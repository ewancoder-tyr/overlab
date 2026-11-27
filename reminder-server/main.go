// The OverLab reminder service: the one piece of OverLab that runs on a server.
//
// The app itself is offline-first and keeps all training data on the device. But a web app
// cannot wake itself up at 15:00 to show a notification, so this small service does exactly
// that and nothing more. It stores, per device: a push subscription, the app's language and one
// reminder per program (see programs.go): the program's name, its days and time, and a few
// headline numbers for its next day to tease the user with ("25 kg on bench press"). Devices on
// an earlier version of the app still register a gym schedule and solo reminders (solo.go)
// instead. It never receives the training log itself, and no name or account.
//
//	GET    /api/reminders/key     the public key the browser needs to subscribe
//	PUT    /api/reminders/device  register a device or update its reminder
//	DELETE /api/reminders/device  forget a device
//	POST   /api/reminders/test    send that device a test notification now
//	GET    /api/reminders/health  answers 204 while the service is up
//
// It also tells every device when a new version of the app is out: once per version, shortly
// after it starts with release notes that list a version it has not announced yet (see
// announce.go). There is no route for it, so nothing can trigger it from outside.
//
// The same program also hosts cloud sync under /api/sync/, a separate module with its own
// database that has nothing to do with reminders (see cloudsync/service.go), and, beside it,
// the leaderboard under /api/sync/leaderboard, which borrows sync's sign-in (see
// leaderboard/service.go) and, for telling buddies about each other's sets, this server's way
// of sending a notification (see leaderboard/buddies.go).
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"math/rand/v2"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"overlab/reminder-server/cloudsync"
	"overlab/reminder-server/leaderboard"
	// Embeds the time zone database in the binary, so "Europe/Warsaw" resolves even in a
	// minimal container image that ships without one.
	_ "time/tzdata"
)

type server struct {
	store  *Store
	sender Sender
	// push delivers one notification. It is `sender.Send` in production and a fake in tests.
	push func(ctx context.Context, device Device, message Message) error
	// announcedPath is the file that remembers the last version announced.
	announcedPath string
	now           func() time.Time // Replaceable in tests.
	pick          picker           // The source of randomness for wordings; replaceable in tests.
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
	Reminder
	Hype []HypeFact `json:"hype"`
	// Solo is optional: only versions of the app before programs send it.
	Solo []SoloReminder `json:"solo"`
	// Programs is optional: one reminder per program (see programs.go).
	Programs []ProgramReminder `json:"programs"`
	// Language is optional: a device that sends none gets English.
	Language string `json:"language"`
}

type endpointRequest struct {
	Endpoint string `json:"endpoint"`
}

// readJSON decodes a small JSON body, answering 400 itself when that fails.
func readJSON(w http.ResponseWriter, r *http.Request, into any) bool {
	// The largest request is a registration with twenty programs, each with twenty hype facts
	// in a script that takes two bytes a letter: well under this.
	r.Body = http.MaxBytesReader(w, r.Body, 256<<10)
	if err := json.NewDecoder(r.Body).Decode(into); err != nil {
		http.Error(w, "the request body is not valid JSON", http.StatusBadRequest)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (s *server) handleKey(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"publicKey": s.sender.keys.Public})
}

func (s *server) handlePutDevice(w http.ResponseWriter, r *http.Request) {
	var request deviceRequest
	if !readJSON(w, r, &request) {
		return
	}
	subscription := request.Subscription
	if !isPushEndpoint(subscription.Endpoint) || subscription.Keys.P256dh == "" || subscription.Keys.Auth == "" {
		http.Error(w, "not a push subscription from a supported browser", http.StatusBadRequest)
		return
	}
	if err := request.Reminder.Validate(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := validateHype(request.Hype); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := validateSolo(request.Solo); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := validatePrograms(request.Programs); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	device := Device{
		Endpoint: subscription.Endpoint,
		P256dh:   subscription.Keys.P256dh,
		Auth:     subscription.Keys.Auth,
		Reminder: request.Reminder,
		Hype:     request.Hype,
		Solo:     request.Solo,
		Programs: request.Programs,
		// Stored only when this server speaks it, so the file holds no arbitrary strings.
		Language: supportedLanguage(request.Language),
	}
	// A device that is new to us must not be notified for a reminder time that has already
	// passed today. A known device keeps its own "last sent" mark.
	sentDate := ""
	if _, known := s.store.Get(device.Endpoint); !known {
		sentDate = device.Reminder.PassedToday(s.now())
	}
	if err := s.store.Upsert(device, sentDate, s.now()); err != nil {
		if errors.Is(err, errStoreFull) {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}
		log.Printf("could not save a device: %v", err)
		http.Error(w, "could not save", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleDeleteDevice(w http.ResponseWriter, r *http.Request) {
	var request endpointRequest
	if !readJSON(w, r, &request) {
		return
	}
	if err := s.store.Delete(request.Endpoint); err != nil {
		log.Printf("could not delete a device: %v", err)
		http.Error(w, "could not save", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleTest(w http.ResponseWriter, r *http.Request) {
	var request endpointRequest
	if !readJSON(w, r, &request) {
		return
	}
	device, known := s.store.Get(request.Endpoint)
	if !known {
		http.Error(w, "this device is not registered", http.StatusNotFound)
		return
	}
	// The test is a real reminder, so the user sees exactly what a program's day will bring:
	// that of the device's first program, or the gym day reminder of a device without programs.
	var err error
	if len(device.Programs) > 0 {
		err = s.remindProgram(r.Context(), device, device.Programs[0], "")
	} else {
		err = s.remind(r.Context(), device, "")
	}
	if errors.Is(err, errGone) {
		_ = s.store.Delete(device.Endpoint)
		http.Error(w, "the browser no longer accepts notifications for this device", http.StatusGone)
		return
	}
	if err != nil {
		log.Printf("test notification failed: %v", err)
		http.Error(w, "the push service rejected the notification", http.StatusBadGateway)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// remind composes one reminder for a device, sends it and records which wording was used.
// `date` is the gym day it counts for, or "" for a test that should not use up the day.
func (s *server) remind(ctx context.Context, device Device, date string) error {
	// LastWording is stored plus one; minus one turns "none yet" (0) into an impossible index.
	title, body, wording, err := composeReminder(device.Hype, device.Language, device.LastWording-1, s.pick)
	if err != nil {
		return err
	}
	if err := s.push(ctx, device, reminderMessage(title, body)); err != nil {
		return err
	}
	return s.store.MarkSent(device.Endpoint, date, wording)
}

// remindSolo sends one solo reminder: the exercise as the title, and the same roast a gym day
// gets, about that exercise alone. Without a solo set to quote yet, a general wording.
func (s *server) remindSolo(ctx context.Context, device Device, solo SoloReminder, date string) error {
	var facts []HypeFact
	if solo.Hype != nil {
		facts = []HypeFact{*solo.Hype}
	}
	// The title composeReminder picks ("Gym day") is not used: this is not a gym day.
	_, body, wording, err := composeReminder(facts, device.Language, device.LastWording-1, s.pick)
	if err != nil {
		return err
	}
	if err := s.push(ctx, device, soloMessage(solo, body)); err != nil {
		return err
	}
	return s.store.MarkSoloSent(device.Endpoint, solo.ID, date, wording)
}

// remindProgram sends the reminder of one program: its name as the title, and a roast about
// one of the exercises of its next day. Without a set to quote yet, a general wording. `date`
// is the day it counts for, or "" for a test that should not use up the day.
func (s *server) remindProgram(ctx context.Context, device Device, program ProgramReminder, date string) error {
	// The title composeReminder picks ("Gym day") is not used: the program's own name says more.
	_, body, wording, err := composeReminder(program.Hype, device.Language, device.LastWording-1, s.pick)
	if err != nil {
		return err
	}
	if err := s.push(ctx, device, programMessage(program, body)); err != nil {
		return err
	}
	return s.store.MarkProgramSent(device.Endpoint, program.ID, date, wording)
}

// sendDue sends every reminder that is due right now. It runs once a minute.
func (s *server) sendDue(ctx context.Context) {
	now := s.now()
	for _, device := range s.store.All() {
		if !s.sendDueTo(ctx, device, now) {
			log.Printf("a subscription is gone; forgetting the device")
			_ = s.store.Delete(device.Endpoint)
		}
	}
}

// sendDueTo sends what one device is due: each of its program reminders and, for a device on
// an earlier version of the app, its gym day reminder and each of its solo reminders, every
// one on its own schedule. It reports false when the push service says the device is gone.
func (s *server) sendDueTo(ctx context.Context, device Device, now time.Time) bool {
	if date, due := device.Reminder.DueDate(now, device.LastSentDate); due {
		err := s.remind(ctx, device, date)
		switch {
		case errors.Is(err, errGone):
			return false
		case err != nil:
			// Not marked as sent, so the next tick tries again (for up to three hours).
			log.Printf("reminder failed, will retry: %v", err)
		}
	}
	for _, solo := range device.Solo {
		date, due := solo.in(device.Reminder.TimeZone).DueDate(now, solo.LastSentDate)
		if !due {
			continue
		}
		err := s.remindSolo(ctx, device, solo, date)
		switch {
		case errors.Is(err, errGone):
			return false
		case err != nil:
			log.Printf("solo reminder failed, will retry: %v", err)
		}
	}
	for _, program := range device.Programs {
		date, due := program.in(device.Reminder.TimeZone).DueDate(now, program.LastSentDate)
		if !due {
			continue
		}
		err := s.remindProgram(ctx, device, program, date)
		switch {
		case errors.Is(err, errGone):
			return false
		case err != nil:
			log.Printf("program reminder failed, will retry: %v", err)
		}
	}
	return true
}

// buddyPush lends the leaderboard this server's way of sending a notification, for telling
// buddies about each other's sets (see leaderboard/buddies.go). It is all the two share: the
// leaderboard keeps its own list of devices, and the reminder devices know no accounts.
func (s *server) buddyPush() leaderboard.Push {
	return leaderboard.Push{
		Send: func(ctx context.Context, to leaderboard.Subscription, notice leaderboard.Notice) error {
			err := s.push(ctx, Device{Endpoint: to.Endpoint, P256dh: to.P256dh, Auth: to.Auth}, buddyMessage(notice))
			if errors.Is(err, errGone) {
				return leaderboard.ErrGone
			}
			return err
		},
		Allowed: isPushEndpoint,
	}
}

func (s *server) routes() *http.ServeMux {
	mux := http.NewServeMux()
	// Since Go 1.22 a pattern can name the HTTP method; other methods get 405 automatically.
	mux.HandleFunc("GET /api/reminders/key", s.handleKey)
	mux.HandleFunc("PUT /api/reminders/device", s.handlePutDevice)
	mux.HandleFunc("DELETE /api/reminders/device", s.handleDeleteDevice)
	mux.HandleFunc("POST /api/reminders/test", s.handleTest)
	mux.HandleFunc("GET /api/reminders/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func main() {
	dataDir := env("DATA_DIR", "./data")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		log.Fatal(err)
	}
	keys, err := loadOrCreateVAPIDKeys(filepath.Join(dataDir, "vapid.json"))
	if err != nil {
		log.Fatalf("VAPID keys: %v", err)
	}
	// Required, with no default: it is the operator's own contact address, which the push
	// services are given with every notification.
	subject := os.Getenv("VAPID_SUBJECT")
	if subject == "" {
		log.Fatal("VAPID_SUBJECT is not set: give a contact URL (https://... or mailto:...) for the push services")
	}
	store, err := OpenStore(filepath.Join(dataDir, "devices.json"))
	if err != nil {
		log.Fatalf("device store: %v", err)
	}
	app := &server{
		store:  store,
		sender: Sender{keys: keys, subject: subject},
		now:    time.Now,
		pick:   rand.IntN,

		announcedPath: filepath.Join(dataDir, "announced-version.txt"),
	}
	app.push = app.sender.Send

	// The scheduler: a goroutine (a lightweight thread) that wakes up once a minute.
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			app.sendDue(context.Background())
		}
	}()

	// A new version is announced a little after the start, not at once: this service and the
	// site are replaced together, and a tap on the notice should find the new site already up.
	go func() {
		time.Sleep(announceDelay)
		app.announceRelease(context.Background(), env("RELEASE_NOTES", "/release-notes.json"))
	}()

	mux := app.routes()
	// Cloud sync is a separate module (see cloudsync/service.go). It is on only when the
	// Google client id is configured, and these lines are all that tie it to this server.
	if clientID := os.Getenv("GOOGLE_CLIENT_ID"); clientID != "" {
		sync, err := cloudsync.New(dataDir, clientID)
		if err != nil {
			log.Fatalf("cloud sync: %v", err)
		}
		sync.Register(mux)

		// The leaderboard is another separate module (see leaderboard/service.go). It needs
		// sync's sign-in, so it exists only with sync, and these lines lend it that sign-in
		// without either package importing the other.
		board, err := leaderboard.New(dataDir, leaderboard.Accounts{
			Account: sync.Account,
			Verify: func(ctx context.Context, token string) (leaderboard.Profile, error) {
				identity, err := sync.Verify(ctx, token)
				return leaderboard.Profile(identity), err
			},
		}, app.buddyPush())
		if err != nil {
			log.Fatalf("leaderboard: %v", err)
		}
		board.Register(mux)
		sync.OnAccountDeleted(board.Forget)
	}

	address := env("LISTEN", ":8080")
	log.Printf("reminder service listening on %s with %d device(s)", address, len(store.All()))
	httpServer := &http.Server{
		Addr:              address,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(httpServer.ListenAndServe())
}
