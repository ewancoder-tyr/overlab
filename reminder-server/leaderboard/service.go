// Package leaderboard ranks the users who chose to take part by experience. See
// docs/leaderboard.md, "Leaderboard".
//
//	GET    /api/sync/leaderboard        the board, for an account that has joined it
//	PUT    /api/sync/leaderboard/me     join (or refresh name and picture) with a Google ID token
//	PUT    /api/sync/leaderboard/me/xp  report the latest experience
//	DELETE /api/sync/leaderboard/me     leave
//
// Buddies, who are told about each other's sets, are part of it (see buddies.go).
//
// It needs cloud sync's sign-in, so its routes live under /api/sync/, where the session cookie
// is sent, but the package imports nothing from cloudsync: main.go hands it the two functions it
// needs (Accounts). Removing the leaderboard means deleting this folder, its lines in main.go
// and the database file.
//
// The server cannot compute experience: it never reads events, and the experience rules live
// only in the app. So the app reports its total, and the board trusts it. The level and its
// title are derived from that total on each phone, in the viewer's language.
package leaderboard

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"math/rand/v2"
	"net/http"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	// Far beyond any real total (level 30 is some 40,000), but keeps nonsense off the board.
	maxXP = 1_000_000_000
	// Display names longer than this are cut. Google's are far shorter.
	maxNameRunes    = 60
	maxPictureBytes = 2048
)

// Profile is who a verified Google ID token is for, and what Google shows for that account.
type Profile struct {
	Sub     string
	Name    string
	Picture string
}

// Accounts is what the leaderboard borrows from cloud sync.
type Accounts struct {
	// Account answers which account a request is signed in as.
	Account func(r *http.Request) (string, bool)
	// Verify checks a Google ID token and returns its profile.
	Verify func(ctx context.Context, token string) (Profile, error)
}

// Service is the leaderboard module. Create it with New and add its routes with Register.
type Service struct {
	store    *Store
	accounts Accounts
	push     Push
	now      func() time.Time
	// pick is the source of randomness for wordings; replaceable in tests.
	pick func(n int) int
	// spawn runs the pushes of one report. A goroutine in production, so the answer to the
	// phone never waits for them; tests run them in place.
	spawn func(work func())
	// reports counts each account's recent reports (see allowReport).
	reports reportLimiter
}

// New opens the leaderboard database in dataDir.
func New(dataDir string, accounts Accounts, push Push) (*Service, error) {
	store, err := OpenStore(filepath.Join(dataDir, "leaderboard.db"))
	if err != nil {
		return nil, err
	}
	return &Service{
		store:    store,
		accounts: accounts,
		push:     push,
		now:      time.Now,
		pick:     rand.IntN,
		spawn:    func(work func()) { go work() },
	}, nil
}

// Register adds the leaderboard routes to mux.
func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sync/leaderboard", s.signedIn(s.handleBoard))
	mux.HandleFunc("PUT /api/sync/leaderboard/me", s.signedIn(s.handleJoin))
	mux.HandleFunc("PUT /api/sync/leaderboard/me/xp", s.signedIn(s.handleXP))
	mux.HandleFunc("DELETE /api/sync/leaderboard/me", s.signedIn(s.handleLeave))
	s.registerBuddies(mux)
}

// Forget removes an account from the board. main.go calls it when the account deletes
// everything, so a deleted account does not linger here.
func (s *Service) Forget(ctx context.Context, sub string) {
	if err := s.store.Leave(ctx, sub); err != nil {
		log.Printf("leaderboard: forgetting a deleted account: %v", err)
	}
}

func (s *Service) signedIn(handler func(http.ResponseWriter, *http.Request, string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sub, ok := s.accounts.Account(r)
		if !ok {
			http.Error(w, "not signed in", http.StatusUnauthorized)
			return
		}
		handler(w, r, sub)
	}
}

// entryJSON has the fields of Entry in the same order, so one converts to the other.
type entryJSON struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Picture   string `json:"picture"`
	XP        int64  `json:"xp"`
	You       bool   `json:"you"`
	Following bool   `json:"following"`
}

type boardResponse struct {
	Joined  bool        `json:"joined"`
	Entries []entryJSON `json:"entries"`
}

// handleBoard answers whether the account has joined, and the board only if it has: only those
// who show themselves see the others.
func (s *Service) handleBoard(w http.ResponseWriter, r *http.Request, sub string) {
	entries, joined, err := s.store.Board(r.Context(), sub)
	if err != nil {
		serverError(w, err)
		return
	}
	response := boardResponse{Joined: joined, Entries: []entryJSON{}}
	if joined {
		for _, entry := range entries {
			response.Entries = append(response.Entries, entryJSON(entry))
		}
	}
	writeJSON(w, response)
}

func (s *Service) handleJoin(w http.ResponseWriter, r *http.Request, sub string) {
	var request struct {
		Credential string  `json:"credential"`
		XP         float64 `json:"xp"`
	}
	if !readJSON(w, r, 16<<10, &request) {
		return
	}
	xp, ok := wholeXP(request.XP)
	if !ok {
		http.Error(w, "xp must be a whole number of points", http.StatusBadRequest)
		return
	}
	// The name and picture come from a token Google signed, never from the request itself, so
	// nobody can appear on the board as someone else.
	profile, err := s.accounts.Verify(r.Context(), request.Credential)
	if err != nil {
		log.Printf("leaderboard: rejected an ID token: %v", err)
		http.Error(w, "the Google sign-in could not be verified", http.StatusUnauthorized)
		return
	}
	// A token for another Google account than the one this device syncs with would put a
	// second person's name on the first one's experience.
	if profile.Sub != sub {
		http.Error(w, "sign in with the Google account this device syncs with", http.StatusForbidden)
		return
	}
	if err := s.store.Join(r.Context(), sub, cleanName(profile.Name), cleanPicture(profile.Picture), xp, s.now()); err != nil {
		serverError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) handleXP(w http.ResponseWriter, r *http.Request, sub string) {
	var request struct {
		XP float64 `json:"xp"`
	}
	if !readJSON(w, r, 1<<10, &request) {
		return
	}
	xp, ok := wholeXP(request.XP)
	if !ok {
		http.Error(w, "xp must be a whole number of points", http.StatusBadRequest)
		return
	}
	joined, err := s.store.SetXP(r.Context(), sub, xp)
	if err != nil {
		serverError(w, err)
		return
	}
	if !joined {
		// The app takes this as "you have left" (on another device, say) and stops reporting.
		http.Error(w, "not on the leaderboard", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) handleLeave(w http.ResponseWriter, r *http.Request, sub string) {
	if err := s.store.Leave(r.Context(), sub); err != nil {
		serverError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// wholeXP accepts a JSON number that is a whole, sensible amount of experience. JSON has only
// one number type, so it is decoded as a float and checked here.
func wholeXP(value float64) (int64, bool) {
	if math.IsNaN(value) || value < 0 || value > maxXP || value != math.Trunc(value) {
		return 0, false
	}
	return int64(value), true
}

func cleanName(name string) string {
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) > maxNameRunes {
		name = string([]rune(name)[:maxNameRunes])
	}
	return name
}

// cleanPicture keeps only an https URL: the app puts it into an <img>, and anything else
// (a data: or javascript: URL, or plain http on an https page) has no business there.
func cleanPicture(picture string) string {
	if len(picture) > maxPictureBytes || !strings.HasPrefix(picture, "https://") {
		return ""
	}
	return picture
}

func readJSON(w http.ResponseWriter, r *http.Request, limit int64, into any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	if err := json.NewDecoder(r.Body).Decode(into); err != nil {
		http.Error(w, "the request body is not valid JSON", http.StatusBadRequest)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(value)
}

func serverError(w http.ResponseWriter, err error) {
	log.Printf("leaderboard: %v", err)
	http.Error(w, "internal error", http.StatusInternalServerError)
}
