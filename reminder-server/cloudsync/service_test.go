package cloudsync

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// testService is a Service with a fake Google: the "ID token" is the sub itself, and "bad" fails.
func testService(t *testing.T) (*Service, http.Handler) {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "sync.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	service := &Service{
		store: store,
		verify: func(_ context.Context, token string) (Identity, error) {
			if token == "bad" {
				return Identity{}, errors.New("bad token")
			}
			return Identity{Sub: token}, nil
		},
		cookie: cookieSigner{secret: []byte("0123456789abcdef0123456789abcdef")},
		now:    func() time.Time { return time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC) },
	}
	mux := http.NewServeMux()
	service.Register(mux)
	return service, mux
}

// device plays one browser: it keeps the session cookie between requests, as a browser would.
type device struct {
	t       *testing.T
	handler http.Handler
	cookie  *http.Cookie
}

func (d *device) do(method, path, body string) *httptest.ResponseRecorder {
	d.t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	if d.cookie != nil {
		request.AddCookie(d.cookie)
	}
	response := httptest.NewRecorder()
	d.handler.ServeHTTP(response, request)
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == cookieName {
			d.cookie = cookie
		}
	}
	return response
}

func (d *device) signIn(sub string) int64 {
	d.t.Helper()
	response := d.do("POST", "/api/sync/session", `{"credential":"`+sub+`"}`)
	if response.Code != http.StatusOK {
		d.t.Fatalf("sign-in: %d %s", response.Code, response.Body)
	}
	var answer generationResponse
	_ = json.Unmarshal(response.Body.Bytes(), &answer)
	return answer.Generation
}

func (d *device) push(generation int64, ids ...string) int {
	d.t.Helper()
	events := make([]string, len(ids))
	for i, id := range ids {
		events[i] = `{"id":"` + id + `","type":"SetPerformed"}`
	}
	body := `{"generation":` + itoa(generation) + `,"events":[` + strings.Join(events, ",") + `]}`
	return d.do("POST", "/api/sync/events", body).Code
}

func (d *device) pull(generation, after int64) (pullResponse, int) {
	d.t.Helper()
	response := d.do("GET", "/api/sync/events?generation="+itoa(generation)+"&after="+itoa(after), "")
	var page pullResponse
	_ = json.Unmarshal(response.Body.Bytes(), &page)
	return page, response.Code
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func ids(page pullResponse) []string {
	result := make([]string, len(page.Events))
	for i, body := range page.Events {
		var envelope struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(body, &envelope)
		result[i] = envelope.ID
	}
	return result
}

func TestEventsPushedByOneDeviceArePulledByAnother(t *testing.T) {
	_, handler := testService(t)
	phone, tablet := &device{t: t, handler: handler}, &device{t: t, handler: handler}
	generation := phone.signIn("alice")
	tablet.signIn("alice")

	if code := phone.push(generation, "a", "b"); code != http.StatusNoContent {
		t.Fatalf("push: %d", code)
	}
	page, _ := tablet.pull(generation, 0)
	if got := strings.Join(ids(page), ","); got != "a,b" {
		t.Fatalf("pulled %q", got)
	}
	// Pulling again from the returned cursor brings only what is new.
	phone.push(generation, "c")
	page, _ = tablet.pull(generation, page.Cursor)
	if got := strings.Join(ids(page), ","); got != "c" {
		t.Fatalf("pulled %q after the cursor", got)
	}
}

func TestPushingTheSameEventTwiceStoresItOnce(t *testing.T) {
	_, handler := testService(t)
	phone := &device{t: t, handler: handler}
	generation := phone.signIn("alice")
	phone.push(generation, "a")
	phone.push(generation, "a", "b") // A retry after a timeout, say.

	page, _ := phone.pull(generation, 0)
	if got := strings.Join(ids(page), ","); got != "a,b" {
		t.Fatalf("pulled %q", got)
	}
}

func TestAccountsDoNotSeeEachOthersEvents(t *testing.T) {
	_, handler := testService(t)
	alice, bob := &device{t: t, handler: handler}, &device{t: t, handler: handler}
	alice.push(alice.signIn("alice"), "a")

	page, _ := bob.pull(bob.signIn("bob"), 0)
	if len(page.Events) != 0 {
		t.Fatalf("bob sees %v", ids(page))
	}
}

func TestSyncNeedsASignedInDevice(t *testing.T) {
	_, handler := testService(t)
	stranger := &device{t: t, handler: handler}
	if code := stranger.push(1, "a"); code != http.StatusUnauthorized {
		t.Fatalf("push without a cookie: %d", code)
	}
	if code := stranger.do("POST", "/api/sync/session", `{"credential":"bad"}`).Code; code != http.StatusUnauthorized {
		t.Fatalf("sign-in with a bad token: %d", code)
	}
	stranger.cookie = &http.Cookie{Name: cookieName, Value: "alice.9999999999.forged"}
	if _, code := stranger.pull(1, 0); code != http.StatusUnauthorized {
		t.Fatalf("pull with a forged cookie: %d", code)
	}
}

func TestDeleteEverythingMakesOtherDevicesStartOver(t *testing.T) {
	_, handler := testService(t)
	phone, tablet := &device{t: t, handler: handler}, &device{t: t, handler: handler}
	old := phone.signIn("alice")
	tablet.signIn("alice")
	phone.push(old, "a")

	response := phone.do("DELETE", "/api/sync/account", "")
	var answer generationResponse
	_ = json.Unmarshal(response.Body.Bytes(), &answer)
	if answer.Generation != old+1 {
		t.Fatalf("generation after delete: %d", answer.Generation)
	}

	// The tablet still holds event "a" and has not heard of the delete. Its push is refused,
	// so the deleted history cannot come back, and the answer tells it where to start over.
	if code := tablet.push(old, "a"); code != http.StatusConflict {
		t.Fatalf("push from an old generation: %d", code)
	}
	if _, code := tablet.pull(old, 0); code != http.StatusConflict {
		t.Fatalf("pull from an old generation: %d", code)
	}
	page, code := tablet.pull(answer.Generation, 0)
	if code != http.StatusOK || len(page.Events) != 0 {
		t.Fatalf("pull from the new generation: %d %v", code, ids(page))
	}
}

func TestPullIsPaged(t *testing.T) {
	service, handler := testService(t)
	phone := &device{t: t, handler: handler}
	generation := phone.signIn("alice")
	phone.push(generation, "a", "b", "c")

	page, err := service.store.After(context.Background(), "alice", generation, 0, 2)
	if err != nil || len(page.Events) != 2 || !page.More {
		t.Fatalf("first page: %v %d more=%v", err, len(page.Events), page.More)
	}
	page, _ = service.store.After(context.Background(), "alice", generation, page.Cursor, 2)
	if len(page.Events) != 1 || page.More {
		t.Fatalf("second page: %d more=%v", len(page.Events), page.More)
	}
}

func TestEventsWithoutAnIdAreRefused(t *testing.T) {
	_, handler := testService(t)
	phone := &device{t: t, handler: handler}
	generation := phone.signIn("alice")
	code := phone.do("POST", "/api/sync/events", `{"generation":`+itoa(generation)+`,"events":[{"type":"x"}]}`).Code
	if code != http.StatusBadRequest {
		t.Fatalf("push of an event without an id: %d", code)
	}
}

func TestSignOutDropsTheCookie(t *testing.T) {
	_, handler := testService(t)
	phone := &device{t: t, handler: handler}
	generation := phone.signIn("alice")
	phone.do("DELETE", "/api/sync/session", "")
	if code := phone.push(generation, "a"); code != http.StatusUnauthorized {
		t.Fatalf("push after sign-out: %d", code)
	}
}

func TestCookieExpires(t *testing.T) {
	signer := cookieSigner{secret: []byte("0123456789abcdef0123456789abcdef")}
	now := time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	value := signer.value("alice", now.Add(time.Hour))

	if sub, ok := signer.subject(value, now); !ok || sub != "alice" {
		t.Fatalf("fresh cookie: %q %v", sub, ok)
	}
	if _, ok := signer.subject(value, now.Add(2*time.Hour)); ok {
		t.Fatal("an expired cookie was accepted")
	}
	// Changing the expiry invalidates the signature.
	tampered := strings.Replace(value, ".", ".9", 1)
	if _, ok := signer.subject(tampered, now); ok {
		t.Fatal("a tampered cookie was accepted")
	}
}

func TestDeleteEverythingTellsTheOtherModules(t *testing.T) {
	service, handler := testService(t)
	var deleted []string
	service.OnAccountDeleted(func(_ context.Context, sub string) { deleted = append(deleted, sub) })
	phone := &device{t: t, handler: handler}
	phone.signIn("alice")

	phone.do("DELETE", "/api/sync/account", "")
	if len(deleted) != 1 || deleted[0] != "alice" {
		t.Fatalf("deleted accounts: %v", deleted)
	}
}

func TestAccountReadsTheSessionCookie(t *testing.T) {
	service, handler := testService(t)
	phone := &device{t: t, handler: handler}
	phone.signIn("alice")

	request := httptest.NewRequest("GET", "/api/sync/leaderboard", nil)
	if _, ok := service.Account(request); ok {
		t.Fatal("a request without the cookie has an account")
	}
	request.AddCookie(phone.cookie)
	if sub, ok := service.Account(request); !ok || sub != "alice" {
		t.Fatalf("account: %q %v", sub, ok)
	}
}
