package leaderboard

import (
	"context"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Buddies: two people on the leaderboard who follow each other are told about each other's
// sets as they are logged. See docs/leaderboard.md, "Buddies".
//
//	PUT    /api/sync/leaderboard/follows/{id}  follow a row of the board
//	DELETE /api/sync/leaderboard/follows/{id}  stop following it
//	PUT    /api/sync/leaderboard/device        where to push to on this device, and its language
//	DELETE /api/sync/leaderboard/device        forget this device
//	POST   /api/sync/leaderboard/activity      "I just did this": pushed to my buddies
//
// The consent rule is blind and mutual. A follow alone does nothing and tells nobody: no
// route says who follows an account, and reporting a set is answered the same way whether
// anyone listens or not. Only when two follows meet do sets travel, in both directions, and
// either side ends that by unfollowing.
//
// Nothing about a set is kept. The phone words what was done, in every language it speaks; the
// server wraps it in a roast in the receiving device's language, pushes it and forgets it.

// Subscription is a browser's push subscription: where to post a message for one device, and
// the keys to encrypt it with.
type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

// Notice is one notification about a buddy.
type Notice struct {
	Title string
	Body  string
	// Tag names the notification on the phone: a later one with the same tag replaces it
	// instead of piling up.
	Tag string
}

// ErrGone is what Push.Send answers when the push service says the subscription no longer
// exists. The device is then forgotten.
var ErrGone = errors.New("subscription is gone")

// Push is what buddies borrow from the reminder server, which already knows how to send a
// Web Push message. main.go lends it, so this package imports nothing of the server's.
type Push struct {
	// Send delivers one notification, answering ErrGone for a dead subscription.
	Send func(ctx context.Context, to Subscription, notice Notice) error
	// Allowed says whether an endpoint belongs to a real push service: the server must not be
	// made to post to an address of a client's choosing.
	Allowed func(endpoint string) bool
}

const (
	// A worded exercise or set is short: "Bench press", "80 kg × 8".
	maxActivityRunes = 120
	// What one account may report in an hour. A long workout is some thirty sets; this only
	// stops a client from flooding its buddies.
	maxReportsPerHour = 120
	// How long one report's pushes may take, all devices together.
	fanOutTimeout = time.Minute
)

func (s *Service) registerBuddies(mux *http.ServeMux) {
	mux.HandleFunc("PUT /api/sync/leaderboard/follows/{id}", s.signedIn(s.handleFollow))
	mux.HandleFunc("DELETE /api/sync/leaderboard/follows/{id}", s.signedIn(s.handleUnfollow))
	mux.HandleFunc("PUT /api/sync/leaderboard/device", s.signedIn(s.handlePutDevice))
	mux.HandleFunc("DELETE /api/sync/leaderboard/device", s.signedIn(s.handleDeleteDevice))
	mux.HandleFunc("POST /api/sync/leaderboard/activity", s.signedIn(s.handleActivity))
}

func (s *Service) handleFollow(w http.ResponseWriter, r *http.Request, sub string) {
	err := s.store.Follow(r.Context(), sub, r.PathValue("id"))
	switch {
	case errors.Is(err, errNotJoined):
		http.Error(w, "not on the leaderboard", http.StatusNotFound)
	case errors.Is(err, errNoSuchEntry):
		// The row left the board since the app fetched it.
		http.Error(w, "nobody on the leaderboard has this id", http.StatusGone)
	case errors.Is(err, errSelf):
		http.Error(w, "you cannot follow yourself", http.StatusBadRequest)
	case errors.Is(err, errTooMany):
		http.Error(w, "too many follows", http.StatusConflict)
	case err != nil:
		serverError(w, err)
	default:
		// The same answer whether or not the other side follows back: that stays unknown
		// until their sets start arriving.
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Service) handleUnfollow(w http.ResponseWriter, r *http.Request, sub string) {
	if err := s.store.Unfollow(r.Context(), sub, r.PathValue("id")); err != nil {
		serverError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// deviceRequest is the body of PUT /device. `subscription` is exactly what the browser's
// PushSubscription.toJSON() produces.
type deviceRequest struct {
	Subscription struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	} `json:"subscription"`
	Language string `json:"language"`
}

func (s *Service) handlePutDevice(w http.ResponseWriter, r *http.Request, sub string) {
	var request deviceRequest
	if !readJSON(w, r, 4<<10, &request) {
		return
	}
	subscription := request.Subscription
	if !s.push.Allowed(subscription.Endpoint) || subscription.Keys.P256dh == "" || subscription.Keys.Auth == "" {
		http.Error(w, "not a push subscription from a supported browser", http.StatusBadRequest)
		return
	}
	device := PushDevice{
		Subscription: Subscription{
			Endpoint: subscription.Endpoint,
			P256dh:   subscription.Keys.P256dh,
			Auth:     subscription.Keys.Auth,
		},
		// Stored only when this server roasts in it, so the database holds no arbitrary text.
		Language: supportedLanguage(request.Language),
	}
	err := s.store.SaveDevice(r.Context(), sub, device, s.now())
	if errors.Is(err, errNotJoined) {
		http.Error(w, "not on the leaderboard", http.StatusNotFound)
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) handleDeleteDevice(w http.ResponseWriter, r *http.Request, sub string) {
	var request struct {
		Endpoint string `json:"endpoint"`
	}
	if !readJSON(w, r, 4<<10, &request) {
		return
	}
	if err := s.store.DeleteDevice(r.Context(), sub, request.Endpoint); err != nil {
		serverError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// activityRequest is one thing just done, worded by the phone in every language it speaks:
// {"en": "Bench press", "ru": "Жим лёжа"} and {"en": "80 kg × 8", "ru": "80 кг × 8"}.
type activityRequest struct {
	Exercise map[string]string `json:"exercise"`
	Done     map[string]string `json:"done"`
	// Cardio and Record pick the wordings: a run has no "set", and a record deserves its own.
	Cardio bool `json:"cardio"`
	Record bool `json:"record"`
	// Tag is the phone's name for the notification. Today it is different for every set, so
	// each one is a notification of its own. Should a workout ever be told as one
	// notification that grows, the phone only has to send the whole workout under one tag.
	Tag string `json:"tag"`
}

var tagPattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

// worded checks a text given in several languages: English is required (it is what a device
// without a language gets) and every wording has a sensible length.
func worded(text map[string]string) bool {
	if strings.TrimSpace(text["en"]) == "" {
		return false
	}
	for _, words := range text {
		if strings.TrimSpace(words) == "" || utf8.RuneCountInString(words) > maxActivityRunes {
			return false
		}
	}
	return true
}

// in picks the wording of `language`, or the English one.
func in(text map[string]string, language string) string {
	if words, ok := text[language]; ok {
		return words
	}
	return text["en"]
}

// handleActivity takes "I just did this" and pushes it to the account's buddies.
//
// The answer is always the same and comes before any push is sent, so neither its content nor
// how long it took says whether anyone is listening.
func (s *Service) handleActivity(w http.ResponseWriter, r *http.Request, sub string) {
	var request activityRequest
	if !readJSON(w, r, 4<<10, &request) {
		return
	}
	if !worded(request.Exercise) || !worded(request.Done) || !tagPattern.MatchString(request.Tag) {
		http.Error(w, "an activity needs an exercise, what was done and a tag", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
	if !s.reports.allow(sub, s.now()) {
		return
	}
	s.spawn(func() {
		// Not the request's context: that one ends with the answer just given.
		ctx, cancel := context.WithTimeout(context.Background(), fanOutTimeout)
		defer cancel()
		s.tellBuddies(ctx, sub, request)
	})
}

// tellBuddies pushes one report to every device of every buddy of `sub`.
func (s *Service) tellBuddies(ctx context.Context, sub string, activity activityRequest) {
	name, publicID, joined, err := s.store.Member(ctx, sub)
	if err != nil || !joined {
		return // Reporting never joins anyone, and someone who left has no buddies.
	}
	devices, err := s.store.BuddyDevices(ctx, sub)
	if err != nil {
		log.Printf("buddies: finding the buddies' devices: %v", err)
		return
	}
	for _, device := range devices {
		body, wording := composeRoast(roastFact{
			Exercise: in(activity.Exercise, device.Language),
			Done:     in(activity.Done, device.Language),
			Cardio:   activity.Cardio,
			Record:   activity.Record,
		}, device.Language, device.LastWording-1, s.pick)
		notice := Notice{
			Title: buddyTitle(name, device.Language),
			Body:  body,
			// Prefixed with the sender's row, so no account can replace another's
			// notifications, or the gym reminder, by choosing a tag.
			Tag: "buddy-" + publicID + "-" + activity.Tag,
		}
		err := s.push.Send(ctx, device.Subscription, notice)
		switch {
		case errors.Is(err, ErrGone):
			_ = s.store.DropDevice(ctx, device.Endpoint)
		case err != nil:
			// Not retried: a set told late is not worth telling.
			log.Printf("buddies: a push failed: %v", err)
		default:
			_ = s.store.MarkWording(ctx, device.Endpoint, wording)
		}
	}
}

// reportLimiter counts each account's reports in the current hour, in memory: losing the
// count on a restart costs nothing.
type reportLimiter struct {
	mu     sync.Mutex
	hour   int64
	counts map[string]int
}

func (l *reportLimiter) allow(sub string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if hour := now.Unix() / 3600; hour != l.hour || l.counts == nil {
		l.hour, l.counts = hour, map[string]int{}
	}
	l.counts[sub]++
	return l.counts[sub] <= maxReportsPerHour
}
