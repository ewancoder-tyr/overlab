// Package cloudsync keeps a cloud copy of a signed-in user's event log, so all their devices
// share one history. See docs/sync.md, "Sync".
//
//	POST   /api/sync/session   sign in: exchange a Google ID token for a session cookie
//	DELETE /api/sync/session   sign out: drop the cookie
//	POST   /api/sync/events    push: store events the account does not have yet
//	GET    /api/sync/events    pull: events stored after a cursor
//	DELETE /api/sync/account   delete everything the account has here
//
// It is deliberately separate from the reminders: it has its own database and its own routes,
// and nothing else in the server imports it. Removing sync means deleting this folder and the
// few lines in main.go that call New and Register.
//
// The app is offline-first and works fully without this service. These endpoints only move
// events; they never read them, so a new event type in the app needs no change here.
package cloudsync

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"time"
)

const (
	// One push is at most this big. The app sends at most pushBatch events per request.
	maxPushBytes = 4 << 20
	// One event is a few hundred bytes; anything far larger is not an OverLab event.
	maxEventBytes = 16 << 10
	// The most events one pull returns; the app asks again while `more` is true.
	pullLimit = 1000
)

// Service is the sync module. Create it with New and add its routes with Register.
type Service struct {
	store  *Store
	verify VerifyIDToken
	cookie cookieSigner
	now    func() time.Time
	// onDeleted runs after an account deleted everything (see OnAccountDeleted).
	onDeleted []func(ctx context.Context, sub string)
}

// New opens the sync database and the cookie secret in dataDir. clientID is OverLab's Google
// OAuth client id: an ID token is accepted only when Google issued it to that id.
func New(dataDir, clientID string) (*Service, error) {
	store, err := OpenStore(filepath.Join(dataDir, "sync.db"))
	if err != nil {
		return nil, err
	}
	secret, err := loadOrCreateSecret(filepath.Join(dataDir, "sync-secret"))
	if err != nil {
		_ = store.Close()
		return nil, err
	}
	return &Service{store: store, verify: GoogleVerifier(clientID), cookie: cookieSigner{secret}, now: time.Now}, nil
}

// Register adds the sync routes to mux.
func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/sync/session", s.handleSignIn)
	mux.HandleFunc("DELETE /api/sync/session", s.handleSignOut)
	mux.HandleFunc("POST /api/sync/events", s.signedIn(s.handlePush))
	mux.HandleFunc("GET /api/sync/events", s.signedIn(s.handlePull))
	mux.HandleFunc("DELETE /api/sync/account", s.signedIn(s.handleDeleteAccount))
}

// Account returns the account a request is signed in as. Other modules of the server (the
// leaderboard) use it to share this sign-in instead of running their own.
func (s *Service) Account(r *http.Request) (string, bool) {
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		return "", false
	}
	return s.cookie.subject(cookie.Value, s.now())
}

// Verify checks a Google ID token, as sign-in does, for modules that need the profile in it.
func (s *Service) Verify(ctx context.Context, token string) (Identity, error) {
	return s.verify(ctx, token)
}

// OnAccountDeleted registers work to do when an account deletes everything, so whatever another
// module keeps for that account goes with it. Sync does not know what that is.
func (s *Service) OnAccountDeleted(do func(ctx context.Context, sub string)) {
	s.onDeleted = append(s.onDeleted, do)
}

// generationResponse is the answer to sign-in and to "Delete everything", and the body of a 409
// when the device's generation is out of date.
type generationResponse struct {
	Generation int64 `json:"generation"`
}

func (s *Service) handleSignIn(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Credential string `json:"credential"`
	}
	if !readJSON(w, r, 16<<10, &request) {
		return
	}
	identity, err := s.verify(r.Context(), request.Credential)
	sub := identity.Sub
	if err != nil {
		log.Printf("sync: rejected an ID token: %v", err)
		http.Error(w, "the Google sign-in could not be verified", http.StatusUnauthorized)
		return
	}
	generation, err := s.store.Generation(r.Context(), sub)
	if err != nil {
		serverError(w, err)
		return
	}
	expires := s.now().Add(cookieLifetime)
	http.SetCookie(w, &http.Cookie{
		Name:  cookieName,
		Value: s.cookie.value(sub, expires),
		// Sent only to the sync routes, never with page or reminder requests.
		Path:     "/api/sync/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, generationResponse{Generation: generation})
}

func (s *Service) handleSignOut(w http.ResponseWriter, _ *http.Request) {
	// A cookie is removed by sending it again, empty and already expired.
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: "", Path: "/api/sync/", MaxAge: -1,
		HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})
	w.WriteHeader(http.StatusNoContent)
}

// signedIn wraps a handler that needs an account, answering 401 itself when there is none.
// The app treats 401 as "sign in again"; its events wait on the device meanwhile.
func (s *Service) signedIn(handler func(http.ResponseWriter, *http.Request, string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sub, ok := s.Account(r)
		if !ok {
			http.Error(w, "not signed in, or the session has expired", http.StatusUnauthorized)
			return
		}
		handler(w, r, sub)
	}
}

type pushRequest struct {
	Generation int64             `json:"generation"`
	Events     []json.RawMessage `json:"events"`
}

func (s *Service) handlePush(w http.ResponseWriter, r *http.Request, sub string) {
	var request pushRequest
	if !readJSON(w, r, maxPushBytes, &request) {
		return
	}
	events := make([]Event, 0, len(request.Events))
	for _, body := range request.Events {
		// The only thing the server reads from an event: its id.
		var envelope struct {
			ID string `json:"id"`
		}
		if len(body) > maxEventBytes || json.Unmarshal(body, &envelope) != nil || envelope.ID == "" {
			http.Error(w, "every event must be a JSON object with an id", http.StatusBadRequest)
			return
		}
		events = append(events, Event{ID: envelope.ID, Body: body})
	}
	err := s.store.Append(r.Context(), sub, request.Generation, events)
	if answeredError(r.Context(), w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type pullResponse struct {
	Events []json.RawMessage `json:"events"`
	Cursor int64             `json:"cursor"`
	More   bool              `json:"more"`
}

func (s *Service) handlePull(w http.ResponseWriter, r *http.Request, sub string) {
	generation, err1 := strconv.ParseInt(r.URL.Query().Get("generation"), 10, 64)
	after, err2 := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
	if err1 != nil || err2 != nil || after < 0 {
		http.Error(w, "generation and after must be numbers", http.StatusBadRequest)
		return
	}
	page, err := s.store.After(r.Context(), sub, generation, after, pullLimit)
	if answeredError(r.Context(), w, err) {
		return
	}
	writeJSON(w, pullResponse{Events: page.Events, Cursor: page.Cursor, More: page.More})
}

func (s *Service) handleDeleteAccount(w http.ResponseWriter, r *http.Request, sub string) {
	generation, err := s.store.DeleteEverything(r.Context(), sub)
	if err != nil {
		serverError(w, err)
		return
	}
	log.Printf("sync: an account deleted its cloud copy")
	for _, do := range s.onDeleted {
		do(r.Context(), sub)
	}
	writeJSON(w, generationResponse{Generation: generation})
}

// answeredError turns a store error into its HTTP answer. It returns false when there was none.
func answeredError(ctx context.Context, w http.ResponseWriter, err error) bool {
	var wrong generationError
	switch {
	case err == nil:
		return false
	case errors.As(err, &wrong):
		// 409 Conflict, with the generation to start over from.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(generationResponse{Generation: wrong.current})
	case errors.Is(err, errNoAccount):
		http.Error(w, "no such account; sign in again", http.StatusUnauthorized)
	case errors.Is(err, errAccountFull):
		http.Error(w, err.Error(), http.StatusInsufficientStorage)
	case ctx.Err() != nil:
		// The device gave up waiting; it will retry.
	default:
		serverError(w, err)
	}
	return true
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
	log.Printf("sync: %v", err)
	http.Error(w, "internal error", http.StatusInternalServerError)
}
