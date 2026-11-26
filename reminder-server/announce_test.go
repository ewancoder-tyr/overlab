package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// announcingServer is a test server whose pushes are recorded instead of sent. Endpoints
// listed in `gone` answer as a push service does for a subscription that no longer exists.
func announcingServer(t *testing.T, gone ...string) (*server, *[]Message) {
	t.Helper()
	app, handler := testServer(t, "2026-11-11T09:00:00Z")
	app.announcedPath = filepath.Join(t.TempDir(), "announced-version.txt")
	var sent []Message
	app.push = func(_ context.Context, device Device, message Message) error {
		for _, endpoint := range gone {
			if device.Endpoint == endpoint {
				return errGone
			}
		}
		sent = append(sent, message)
		return nil
	}
	call(handler, "PUT", "/api/reminders/device", registration(endpoint))
	russianDevice := strings.Replace(registration(endpoint+"2"), `"time"`, `"language":"ru","time"`, 1)
	call(handler, "PUT", "/api/reminders/device", russianDevice)
	return app, &sent
}

// releaseNotes writes release notes as the app keeps them: every version, newest first.
func releaseNotes(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "release-notes.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

const notes = `[
	{"version":"1.1.0","date":"2026-12-01","summary":{"en":"Workout plans are here.","ru":"Планы тренировок уже здесь."},"changes":{"en":["x"],"ru":["x"]}},
	{"version":"1.0.0","date":"2026-11-26","summary":{"en":"The first version.","ru":"Первая версия."},"changes":{"en":["x"],"ru":["x"]}}
]`

func TestTheNewestReleaseReachesEveryDeviceInItsLanguageAndOpensWhatsNew(t *testing.T) {
	app, sent := announcingServer(t)

	app.announceRelease(context.Background(), releaseNotes(t, notes))

	if len(*sent) != 2 {
		t.Fatalf("got %d message(s), want 2", len(*sent))
	}
	byTitle := map[string]Message{}
	for _, message := range *sent {
		byTitle[message.Title] = message
	}
	english, russian := byTitle["OverLab 1.1.0 is out"], byTitle["Вышла OverLab 1.1.0"]
	if english.Body != "Workout plans are here. Tap to see what's new." || english.URL != "/whats-new" {
		t.Errorf("unexpected English message: %+v", english)
	}
	if russian.Body != "Планы тренировок уже здесь. Нажмите, чтобы узнать, что нового." {
		t.Errorf("unexpected Russian message: %+v", russian)
	}
	if english.Tag == reminderMessage("", "").Tag {
		t.Error("an announcement must not replace a reminder on the phone")
	}
}

func TestAVersionIsAnnouncedOnlyOnce(t *testing.T) {
	app, sent := announcingServer(t)
	path := releaseNotes(t, notes)

	app.announceRelease(context.Background(), path)
	app.announceRelease(context.Background(), path)

	if len(*sent) != 2 {
		t.Errorf("a restart must not notify again: got %d message(s), want 2", len(*sent))
	}
}

func TestRollingBackToAnOlderVersionAnnouncesNothing(t *testing.T) {
	app, sent := announcingServer(t)
	app.announceRelease(context.Background(), releaseNotes(t, notes))

	older := `[{"version":"1.0.0","date":"2026-11-26","summary":{"en":"The first version."}}]`
	app.announceRelease(context.Background(), releaseNotes(t, older))

	if len(*sent) != 2 {
		t.Errorf("a rollback must not notify: got %d message(s), want 2", len(*sent))
	}
	if got := app.lastAnnounced(); got != "1.1.0" {
		t.Errorf("a rollback must not be remembered: last announced is %q, want 1.1.0", got)
	}
}

func TestVersionsAreComparedNumberByNumber(t *testing.T) {
	cases := []struct {
		version, announced string
		want               bool
	}{
		{"1.0.0", "", true},
		{"1.0.0", "0.17.0", true},
		{"1.10.0", "1.9.0", true},
		{"1.9.0", "1.10.0", false},
		{"1.1.0", "1.1.0", false},
		{"1.1", "1.1.0", false},
		{"2.0.0", "1.12.3", true},
	}
	for _, c := range cases {
		if got := isNewer(c.version, c.announced); got != c.want {
			t.Errorf("isNewer(%q, %q) = %v, want %v", c.version, c.announced, got, c.want)
		}
	}
}

func TestADeviceWithoutATranslationGetsTheEnglishNotice(t *testing.T) {
	app, sent := announcingServer(t)

	app.announceRelease(context.Background(), releaseNotes(t,
		`[{"version":"1.1.0","summary":{"en":"Workout plans are here."}}]`))

	for _, message := range *sent {
		if message.Title != "OverLab 1.1.0 is out" {
			t.Errorf("unexpected message: %+v", message)
		}
	}
}

func TestAnnouncingForgetsDevicesWhoseSubscriptionIsGone(t *testing.T) {
	app, _ := announcingServer(t, endpoint)

	app.announceRelease(context.Background(), releaseNotes(t, notes))

	if _, known := app.store.Get(endpoint); known {
		t.Error("a device whose subscription is gone should be forgotten")
	}
}

func TestNothingIsAnnouncedWithoutUsableReleaseNotes(t *testing.T) {
	for name, path := range map[string]string{
		"no file":      filepath.Join(t.TempDir(), "missing.json"),
		"not JSON":     releaseNotes(t, `oops`),
		"no versions":  releaseNotes(t, `[]`),
		"no summary":   releaseNotes(t, `[{"version":"1.1.0","summary":{}}]`),
		"long summary": releaseNotes(t, `[{"version":"1.1.0","summary":{"en":"`+strings.Repeat("x", 400)+`"}}]`),
	} {
		app, sent := announcingServer(t)

		app.announceRelease(context.Background(), path)

		if len(*sent) != 0 || app.lastAnnounced() != "" {
			t.Errorf("%s: %d message(s) sent, %q remembered", name, len(*sent), app.lastAnnounced())
		}
	}
}

// Nothing outside the service may trigger an announcement: there is no route for it.
func TestThereIsNoAnnounceRoute(t *testing.T) {
	_, handler := testServer(t, "2026-11-11T09:00:00Z")

	for _, path := range []string{"/internal/announce", "/api/reminders/announce"} {
		if response := call(handler, "POST", path, `{}`); response.Code != 404 {
			t.Errorf("%s: got status %d, want 404", path, response.Code)
		}
	}
}
