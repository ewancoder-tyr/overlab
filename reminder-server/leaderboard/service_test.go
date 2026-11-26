package leaderboard

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

// testBoard is a Service with fake accounts: the X-Account header says who is signed in, and an
// "ID token" is "<sub>|<name>|<picture>". "bad" fails verification.
func testBoard(t *testing.T) http.Handler {
	t.Helper()
	handler, _ := testBuddies(t)
	return handler
}

// A sent is one notification the fake push "delivered", and to which device.
type sent struct {
	Endpoint string
	Notice
}

// testBuddies is testBoard plus a fake push that records what was sent. An endpoint that
// contains "gone" answers as a dead subscription does.
func testBuddies(t *testing.T) (http.Handler, *[]sent) {
	t.Helper()
	pushed := &[]sent{}
	store, err := OpenStore(filepath.Join(t.TempDir(), "leaderboard.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	clock := time.Date(2026, 11, 14, 10, 0, 0, 0, time.UTC)
	service := &Service{
		store: store,
		accounts: Accounts{
			Account: func(r *http.Request) (string, bool) {
				sub := r.Header.Get("X-Account")
				return sub, sub != ""
			},
			Verify: func(_ context.Context, token string) (Profile, error) {
				parts := strings.Split(token, "|")
				if token == "bad" || len(parts) != 3 {
					return Profile{}, errors.New("bad token")
				}
				return Profile{Sub: parts[0], Name: parts[1], Picture: parts[2]}, nil
			},
		},
		// Each joining is a second later than the one before, so ties have an order.
		now: func() time.Time { clock = clock.Add(time.Second); return clock },
		push: Push{
			Send: func(_ context.Context, to Subscription, notice Notice) error {
				if strings.Contains(to.Endpoint, "gone") {
					return ErrGone
				}
				*pushed = append(*pushed, sent{to.Endpoint, notice})
				return nil
			},
			Allowed: func(endpoint string) bool { return strings.HasPrefix(endpoint, "https://push.example/") },
		},
		pick:  func(int) int { return 0 },
		spawn: func(work func()) { work() },
	}
	mux := http.NewServeMux()
	service.Register(mux)
	mux.HandleFunc("DELETE /test/forget/{sub}", func(w http.ResponseWriter, r *http.Request) {
		service.Forget(r.Context(), r.PathValue("sub"))
	})
	return mux, pushed
}

func call(t *testing.T, handler http.Handler, sub, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	if sub != "" {
		request.Header.Set("X-Account", sub)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func join(t *testing.T, handler http.Handler, sub, name string, xp int) {
	t.Helper()
	body := `{"credential":"` + sub + `|` + name + `|https://lh3.googleusercontent.com/` + sub + `","xp":` + itoa(xp) + `}`
	if response := call(t, handler, sub, "PUT", "/api/sync/leaderboard/me", body); response.Code != http.StatusNoContent {
		t.Fatalf("join %s: %d %s", sub, response.Code, response.Body)
	}
}

func board(t *testing.T, handler http.Handler, sub string) boardResponse {
	t.Helper()
	response := call(t, handler, sub, "GET", "/api/sync/leaderboard", "")
	if response.Code != http.StatusOK {
		t.Fatalf("board: %d %s", response.Code, response.Body)
	}
	var answer boardResponse
	_ = json.Unmarshal(response.Body.Bytes(), &answer)
	return answer
}

func names(answer boardResponse) string {
	result := make([]string, len(answer.Entries))
	for i, entry := range answer.Entries {
		result[i] = entry.Name
	}
	return strings.Join(result, ",")
}

func itoa(n int) string { return strconv.Itoa(n) }

func TestTheBoardIsOrderedByExperience(t *testing.T) {
	handler := testBoard(t)
	join(t, handler, "alice", "Alice", 500)
	join(t, handler, "bob", "Bob", 1200)
	join(t, handler, "carol", "Carol", 500)

	answer := board(t, handler, "carol")
	// Most first; Alice and Carol tie, and Alice joined first.
	if got := names(answer); got != "Bob,Alice,Carol" {
		t.Fatalf("order: %s", got)
	}
	if !answer.Joined || !answer.Entries[2].You || answer.Entries[0].You {
		t.Fatalf("the asker's row is not marked: %+v", answer)
	}
}

func TestOnlyThoseWhoJoinedSeeTheBoard(t *testing.T) {
	handler := testBoard(t)
	join(t, handler, "alice", "Alice", 500)

	answer := board(t, handler, "dave")
	if answer.Joined || len(answer.Entries) != 0 {
		t.Fatalf("someone who has not joined saw the board: %+v", answer)
	}
	if code := call(t, handler, "", "GET", "/api/sync/leaderboard", "").Code; code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
}

func TestReportingExperienceNeverJoins(t *testing.T) {
	handler := testBoard(t)
	if code := call(t, handler, "alice", "PUT", "/api/sync/leaderboard/me/xp", `{"xp":10}`).Code; code != http.StatusNotFound {
		t.Fatalf("xp before joining: %d", code)
	}
	join(t, handler, "alice", "Alice", 10)
	if code := call(t, handler, "alice", "PUT", "/api/sync/leaderboard/me/xp", `{"xp":90}`).Code; code != http.StatusNoContent {
		t.Fatalf("xp after joining: %d", code)
	}
	if xp := board(t, handler, "alice").Entries[0].XP; xp != 90 {
		t.Fatalf("xp: %d", xp)
	}
}

func TestExperienceMayGoDownAfterStartingFromScratch(t *testing.T) {
	handler := testBoard(t)
	join(t, handler, "alice", "Alice", 4000)
	call(t, handler, "alice", "PUT", "/api/sync/leaderboard/me/xp", `{"xp":0}`)
	if xp := board(t, handler, "alice").Entries[0].XP; xp != 0 {
		t.Fatalf("xp: %d", xp)
	}
}

func TestNonsenseExperienceIsRefused(t *testing.T) {
	handler := testBoard(t)
	join(t, handler, "alice", "Alice", 10)
	for _, body := range []string{`{"xp":-1}`, `{"xp":1.5}`, `{"xp":1e12}`, `{"xp":"10"}`} {
		if code := call(t, handler, "alice", "PUT", "/api/sync/leaderboard/me/xp", body).Code; code != http.StatusBadRequest {
			t.Errorf("%s: %d", body, code)
		}
	}
}

func TestJoiningNeedsATokenForTheSyncedAccount(t *testing.T) {
	handler := testBoard(t)
	if code := call(t, handler, "alice", "PUT", "/api/sync/leaderboard/me", `{"credential":"bad","xp":0}`).Code; code != http.StatusUnauthorized {
		t.Fatalf("bad token: %d", code)
	}
	// A valid token, but for Bob, sent by a device signed in as Alice.
	if code := call(t, handler, "alice", "PUT", "/api/sync/leaderboard/me", `{"credential":"bob|Bob|https://x","xp":0}`).Code; code != http.StatusForbidden {
		t.Fatalf("someone else's token: %d", code)
	}
	if board(t, handler, "alice").Joined {
		t.Fatal("a refused join joined")
	}
}

func TestJoiningAgainRefreshesTheProfileAndKeepsTheTie(t *testing.T) {
	handler := testBoard(t)
	join(t, handler, "alice", "Alice", 100)
	join(t, handler, "bob", "Bob", 100)
	join(t, handler, "alice", "Alice Smith", 100)
	if got := names(board(t, handler, "bob")); got != "Alice Smith,Bob" {
		t.Fatalf("after joining again: %s", got)
	}
}

func TestOnlyHttpsPicturesAreKept(t *testing.T) {
	handler := testBoard(t)
	call(t, handler, "alice", "PUT", "/api/sync/leaderboard/me", `{"credential":"alice|Alice|javascript:alert(1)","xp":0}`)
	if picture := board(t, handler, "alice").Entries[0].Picture; picture != "" {
		t.Fatalf("picture: %q", picture)
	}
}

func TestLeavingAndDeletingTakeTheAccountOff(t *testing.T) {
	handler := testBoard(t)
	join(t, handler, "alice", "Alice", 100)
	join(t, handler, "bob", "Bob", 50)

	if code := call(t, handler, "alice", "DELETE", "/api/sync/leaderboard/me", "").Code; code != http.StatusNoContent {
		t.Fatalf("leave: %d", code)
	}
	call(t, handler, "", "DELETE", "/test/forget/bob", "")
	if board(t, handler, "alice").Joined || board(t, handler, "bob").Joined {
		t.Fatal("still on the board")
	}
}
