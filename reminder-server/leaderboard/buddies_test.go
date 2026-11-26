package leaderboard

import (
	"database/sql"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
)

// idOf is the public id of a row, read from the board as `viewer` sees it.
func idOf(t *testing.T, handler http.Handler, viewer, name string) string {
	t.Helper()
	for _, entry := range board(t, handler, viewer).Entries {
		if entry.Name == name {
			return entry.ID
		}
	}
	t.Fatalf("%s is not on the board", name)
	return ""
}

func follow(t *testing.T, handler http.Handler, sub, id string) int {
	t.Helper()
	return call(t, handler, sub, "PUT", "/api/sync/leaderboard/follows/"+id, "").Code
}

// device registers a push subscription for the account; its endpoint is named after it.
func device(t *testing.T, handler http.Handler, sub, endpoint, language string) int {
	t.Helper()
	body := `{"subscription":{"endpoint":"` + endpoint + `","keys":{"p256dh":"key","auth":"secret"}},"language":"` + language + `"}`
	return call(t, handler, sub, "PUT", "/api/sync/leaderboard/device", body).Code
}

const benchSet = `{"exercise":{"en":"Bench press","ru":"Жим лёжа"},"done":{"en":"80 kg × 8","ru":"80 кг × 8"},"tag":"set-1"}`

func report(t *testing.T, handler http.Handler, sub, body string) int {
	t.Helper()
	return call(t, handler, sub, "POST", "/api/sync/leaderboard/activity", body).Code
}

// twoOnTheBoard has Alice and Bob joined, each with one device.
func twoOnTheBoard(t *testing.T) (http.Handler, *[]sent) {
	t.Helper()
	handler, pushed := testBuddies(t)
	join(t, handler, "alice", "Alice", 500)
	join(t, handler, "bob", "Bob", 300)
	device(t, handler, "alice", "https://push.example/alice", "en")
	device(t, handler, "bob", "https://push.example/bob", "en")
	return handler, pushed
}

func TestAFollowInOneDirectionTellsNobodyAnything(t *testing.T) {
	handler, pushed := twoOnTheBoard(t)
	if code := follow(t, handler, "alice", idOf(t, handler, "alice", "Bob")); code != http.StatusNoContent {
		t.Fatalf("follow: %d", code)
	}

	// Neither Bob's sets reach Alice, who follows him, nor Alice's sets Bob.
	report(t, handler, "bob", benchSet)
	report(t, handler, "alice", benchSet)
	if len(*pushed) != 0 {
		t.Fatalf("a one-sided follow pushed: %+v", *pushed)
	}
}

func TestTwoFollowsThatMeetTellEachOther(t *testing.T) {
	handler, pushed := twoOnTheBoard(t)
	follow(t, handler, "alice", idOf(t, handler, "alice", "Bob"))
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))

	report(t, handler, "bob", benchSet)
	if len(*pushed) != 1 {
		t.Fatalf("pushed: %+v", *pushed)
	}
	got := (*pushed)[0]
	if got.Endpoint != "https://push.example/alice" || got.Title != "Bob" {
		t.Fatalf("to the wrong device or under the wrong name: %+v", got)
	}
	if !strings.Contains(got.Body, "80 kg × 8") || !strings.Contains(got.Body, "bench press") {
		t.Fatalf("the body does not quote the set: %q", got.Body)
	}

	report(t, handler, "alice", benchSet)
	if len(*pushed) != 2 || (*pushed)[1].Endpoint != "https://push.example/bob" {
		t.Fatalf("the other direction: %+v", *pushed)
	}
}

func TestTheBoardSaysWhomYouFollowAndNeverWhoFollowsYou(t *testing.T) {
	handler, _ := twoOnTheBoard(t)
	follow(t, handler, "alice", idOf(t, handler, "alice", "Bob"))

	for _, entry := range board(t, handler, "alice").Entries {
		if entry.Following != (entry.Name == "Bob") {
			t.Fatalf("Alice's board: %+v", entry)
		}
	}
	// Bob is followed and sees nothing of it.
	for _, entry := range board(t, handler, "bob").Entries {
		if entry.Following {
			t.Fatalf("Bob's board gives a follow away: %+v", entry)
		}
	}
}

func TestReportingIsAnsweredTheSameWhetherAnyoneListens(t *testing.T) {
	handler, _ := twoOnTheBoard(t)
	alone := call(t, handler, "bob", "POST", "/api/sync/leaderboard/activity", benchSet)

	follow(t, handler, "alice", idOf(t, handler, "alice", "Bob"))
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))
	heard := call(t, handler, "bob", "POST", "/api/sync/leaderboard/activity", benchSet)

	if alone.Code != http.StatusNoContent || heard.Code != alone.Code || heard.Body.String() != alone.Body.String() {
		t.Fatalf("the answers differ: %d %q, %d %q", alone.Code, alone.Body, heard.Code, heard.Body)
	}
}

func TestEitherSideUnfollowingStopsBothDirections(t *testing.T) {
	handler, pushed := twoOnTheBoard(t)
	bob := idOf(t, handler, "alice", "Bob")
	follow(t, handler, "alice", bob)
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))

	if code := call(t, handler, "alice", "DELETE", "/api/sync/leaderboard/follows/"+bob, "").Code; code != http.StatusNoContent {
		t.Fatalf("unfollow: %d", code)
	}
	report(t, handler, "bob", benchSet)
	report(t, handler, "alice", benchSet)
	if len(*pushed) != 0 {
		t.Fatalf("pushed after unfollowing: %+v", *pushed)
	}
}

func TestLeavingTheBoardRemovesFollowsInBothDirections(t *testing.T) {
	handler, pushed := twoOnTheBoard(t)
	follow(t, handler, "alice", idOf(t, handler, "alice", "Bob"))
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))

	call(t, handler, "bob", "DELETE", "/api/sync/leaderboard/me", "")
	join(t, handler, "bob", "Bob", 300)
	device(t, handler, "bob", "https://push.example/bob", "en")

	// Back on the board, Bob follows nobody, and Alice's old follow of him is gone too: he
	// would have to be followed, and follow, again.
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))
	report(t, handler, "bob", benchSet)
	report(t, handler, "alice", benchSet)
	if len(*pushed) != 0 {
		t.Fatalf("a follow survived leaving: %+v", *pushed)
	}
}

func TestEachDeviceIsRoastedInItsOwnLanguage(t *testing.T) {
	handler, pushed := twoOnTheBoard(t)
	device(t, handler, "alice", "https://push.example/alice-ru", "ru")
	follow(t, handler, "alice", idOf(t, handler, "alice", "Bob"))
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))

	report(t, handler, "bob", benchSet)
	if len(*pushed) != 2 {
		t.Fatalf("both of Alice's devices should hear: %+v", *pushed)
	}
	for _, got := range *pushed {
		russian := strings.HasSuffix(got.Endpoint, "-ru")
		if strings.Contains(got.Body, "80 кг × 8") != russian || strings.Contains(got.Body, "80 kg × 8") == russian {
			t.Fatalf("%s got %q", got.Endpoint, got.Body)
		}
	}
}

func TestTheTagIsThePhonesWithinTheSendersOwnSpace(t *testing.T) {
	handler, pushed := twoOnTheBoard(t)
	bob := idOf(t, handler, "alice", "Bob")
	follow(t, handler, "alice", bob)
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))

	report(t, handler, "bob", benchSet)
	if got := (*pushed)[0].Tag; got != "buddy-"+bob+"-set-1" {
		t.Fatalf("tag: %q", got)
	}
}

func TestTheSameWordingNeverComesTwiceInARow(t *testing.T) {
	handler, pushed := twoOnTheBoard(t)
	follow(t, handler, "alice", idOf(t, handler, "alice", "Bob"))
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))

	// The fake picker always answers 0, which alone would repeat the first wording.
	report(t, handler, "bob", benchSet)
	report(t, handler, "bob", benchSet)
	if (*pushed)[0].Body == (*pushed)[1].Body {
		t.Fatalf("the same wording twice: %q", (*pushed)[0].Body)
	}
}

func TestADeadSubscriptionIsForgotten(t *testing.T) {
	handler, pushed := twoOnTheBoard(t)
	device(t, handler, "alice", "https://push.example/gone", "en")
	follow(t, handler, "alice", idOf(t, handler, "alice", "Bob"))
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))

	report(t, handler, "bob", benchSet)
	report(t, handler, "bob", benchSet)
	// Two reports, one live device: two pushes. The dead one was tried once, then dropped.
	if len(*pushed) != 2 {
		t.Fatalf("pushed: %+v", *pushed)
	}
}

func TestFollowingNeedsBothToBeOnTheBoard(t *testing.T) {
	handler, _ := twoOnTheBoard(t)
	alice := idOf(t, handler, "bob", "Alice")

	if code := follow(t, handler, "stranger", alice); code != http.StatusNotFound {
		t.Fatalf("someone not on the board followed: %d", code)
	}
	if code := follow(t, handler, "bob", "0000"); code != http.StatusGone {
		t.Fatalf("following a row that does not exist: %d", code)
	}
	if code := follow(t, handler, "alice", alice); code != http.StatusBadRequest {
		t.Fatalf("following yourself: %d", code)
	}
	if code := device(t, handler, "stranger", "https://push.example/stranger", "en"); code != http.StatusNotFound {
		t.Fatalf("a device for someone not on the board: %d", code)
	}
}

func TestAtMostTwentyFollows(t *testing.T) {
	handler, _ := testBuddies(t)
	join(t, handler, "alice", "Alice", 1)
	for i := range MaxFollows + 1 {
		join(t, handler, "user"+itoa(i), "User "+itoa(i), 1)
	}
	for i := range MaxFollows {
		if code := follow(t, handler, "alice", idOf(t, handler, "alice", "User "+itoa(i))); code != http.StatusNoContent {
			t.Fatalf("follow %d: %d", i, code)
		}
	}
	last := idOf(t, handler, "alice", "User "+itoa(MaxFollows))
	if code := follow(t, handler, "alice", last); code != http.StatusConflict {
		t.Fatalf("the twenty-first follow: %d", code)
	}
	// Following someone already followed is not one more.
	if code := follow(t, handler, "alice", idOf(t, handler, "alice", "User 0")); code != http.StatusNoContent {
		t.Fatalf("following again: %d", code)
	}
}

func TestOnlyRealPushServicesAndWellFormedReportsAreAccepted(t *testing.T) {
	handler, _ := twoOnTheBoard(t)
	if code := device(t, handler, "alice", "https://evil.example/hook", "en"); code != http.StatusBadRequest {
		t.Fatalf("an arbitrary endpoint: %d", code)
	}
	for name, body := range map[string]string{
		"no English": `{"exercise":{"ru":"Жим лёжа"},"done":{"en":"80 kg × 8"},"tag":"a"}`,
		"no done":    `{"exercise":{"en":"Bench press"},"tag":"a"}`,
		"no tag":     `{"exercise":{"en":"Bench press"},"done":{"en":"80 kg × 8"}}`,
		"odd tag":    `{"exercise":{"en":"Bench press"},"done":{"en":"80 kg × 8"},"tag":"a b"}`,
		"too long":   `{"exercise":{"en":"` + strings.Repeat("x", maxActivityRunes+1) + `"},"done":{"en":"8"},"tag":"a"}`,
	} {
		if code := report(t, handler, "alice", body); code != http.StatusBadRequest {
			t.Fatalf("%s: %d", name, code)
		}
	}
}

func TestAFloodOfReportsStopsBeingPushed(t *testing.T) {
	handler, pushed := twoOnTheBoard(t)
	follow(t, handler, "alice", idOf(t, handler, "alice", "Bob"))
	follow(t, handler, "bob", idOf(t, handler, "bob", "Alice"))

	for range maxReportsPerHour + 10 {
		// Still answered as always: the limit is nobody's business either.
		if code := report(t, handler, "bob", benchSet); code != http.StatusNoContent {
			t.Fatalf("report: %d", code)
		}
	}
	if len(*pushed) != maxReportsPerHour {
		t.Fatalf("pushed %d", len(*pushed))
	}
}

func TestABoardFromBeforeBuddiesGetsItsRowsNamed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "leaderboard.db")
	old, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	// The schema as it was before buddies: no public id.
	if _, err := old.Exec(`
		CREATE TABLE entries (sub TEXT PRIMARY KEY, name TEXT NOT NULL, picture TEXT NOT NULL,
			xp INTEGER NOT NULL, joined_at INTEGER NOT NULL);
		INSERT INTO entries VALUES ('alice', 'Alice', '', 5, 1), ('bob', 'Bob', '', 3, 2);`); err != nil {
		t.Fatal(err)
	}
	_ = old.Close()

	store, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	entries, _, err := store.Board(t.Context(), "alice")
	if err != nil || len(entries) != 2 {
		t.Fatalf("board: %v %+v", err, entries)
	}
	if entries[0].ID == "" || entries[1].ID == "" || entries[0].ID == entries[1].ID {
		t.Fatalf("rows are not named apart: %+v", entries)
	}
}
