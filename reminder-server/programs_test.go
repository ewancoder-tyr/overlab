package main

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

// programRegistration is a device as the app registers it since programs: no gym schedule and
// no solo reminders, only programs.
func programRegistration(programs string) string {
	return `{"subscription":{"endpoint":"` + endpoint + `","keys":{"p256dh":"key","auth":"secret"}},
		"time":"15:00","timeZone":"Europe/Warsaw","language":"en","programs":[` + programs + `]}`
}

// A gym program every second day at 15:00 Warsaw time, counted from 10 November 2026.
const split = `{"id":"split","title":"Three-day split","time":"15:00",
	"schedule":{"kind":"interval","everyDays":2,"startDate":"2026-11-10"},
	"hype":[{"exercise":"Bench press","last":"25 kg","target":"30 kg"}]}`

// A solo program of one exercise, every day at 08:00.
const morning = `{"id":"solo-push-up","title":"Push-up","time":"08:00","open":"push-up",
	"schedule":{"kind":"interval","everyDays":1,"startDate":"2026-11-10"}}`

func TestAProgramRingsOnItsDaysUnderItsOwnName(t *testing.T) {
	app, handler := testServer(t, "2026-11-10T06:00:00Z")
	sent := capturePushes(app)
	if response := call(handler, "PUT", "/api/reminders/device", programRegistration(split)); response.Code != http.StatusNoContent {
		t.Fatalf("got status %d: %s", response.Code, response.Body)
	}

	// 14:30 UTC is 15:30 in Warsaw. The 10th and the 12th are days of the cycle, the 11th is not.
	for _, now := range []string{"2026-11-10T14:30:00Z", "2026-11-10T14:31:00Z", "2026-11-11T14:30:00Z", "2026-11-12T14:30:00Z"} {
		app.now = func() time.Time { return mustTime(t, now) }
		app.sendDue(context.Background())
	}

	if len(*sent) != 2 {
		t.Fatalf("sent %d notifications, want 2", len(*sent))
	}
	message := (*sent)[0]
	if message.Title != "Three-day split" || message.URL != "/exercises" || message.Tag != "program-reminder-split" {
		t.Errorf("unexpected message: %+v", message)
	}
	if !strings.Contains(message.Body, "25 kg") {
		t.Errorf("the roast should quote the program's next day: %q", message.Body)
	}
}

func TestEachProgramRingsAtItsOwnTime(t *testing.T) {
	app, handler := testServer(t, "2026-11-10T05:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", programRegistration(split+","+morning))

	// 08:30 in Warsaw: only the morning program is due.
	app.now = func() time.Time { return mustTime(t, "2026-11-10T07:30:00Z") }
	app.sendDue(context.Background())
	if len(*sent) != 1 || (*sent)[0].Title != "Push-up" {
		t.Fatalf("in the morning only the morning program should ring: %+v", *sent)
	}
	// A solo program of one exercise opens that exercise's logging screen on solo sets.
	if (*sent)[0].URL != "/exercises/push-up?solo=1" {
		t.Errorf("unexpected address: %q", (*sent)[0].URL)
	}

	// 15:30 in Warsaw: now the split, and the morning program does not ring twice.
	app.now = func() time.Time { return mustTime(t, "2026-11-10T14:30:00Z") }
	app.sendDue(context.Background())
	if len(*sent) != 2 || (*sent)[1].Title != "Three-day split" {
		t.Errorf("in the afternoon the split should ring once: %+v", *sent)
	}
}

func TestAProgramMovedByASkippedDayRingsOnItsNewDays(t *testing.T) {
	app, handler := testServer(t, "2026-11-10T06:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", programRegistration(split))

	// The 12th was skipped and the program done on the 13th, so the app sends the schedule
	// again, counted from the 15th.
	moved := strings.Replace(split, "2026-11-10", "2026-11-15", 1)
	app.now = func() time.Time { return mustTime(t, "2026-11-13T18:00:00Z") }
	call(handler, "PUT", "/api/reminders/device", programRegistration(moved))

	for _, now := range []string{"2026-11-14T14:30:00Z", "2026-11-15T14:30:00Z"} {
		app.now = func() time.Time { return mustTime(t, now) }
		app.sendDue(context.Background())
	}

	if len(*sent) != 1 {
		t.Errorf("sent %d notifications, want 1 (on the 15th)", len(*sent))
	}
}

func TestSendingThePlanAgainKeepsTodaysProgramMark(t *testing.T) {
	app, handler := testServer(t, "2026-11-10T06:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", programRegistration(split))

	app.now = func() time.Time { return mustTime(t, "2026-11-10T14:30:00Z") }
	app.sendDue(context.Background())
	// The app sends the plan again after every change of the hype.
	call(handler, "PUT", "/api/reminders/device", programRegistration(strings.Replace(split, "30 kg", "32.5 kg", 1)))
	app.sendDue(context.Background())

	if len(*sent) != 1 {
		t.Errorf("sent %d notifications, want 1", len(*sent))
	}
}

func TestRemovingTheLastProgramStopsIt(t *testing.T) {
	app, handler := testServer(t, "2026-11-10T06:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", programRegistration(split))
	call(handler, "PUT", "/api/reminders/device", programRegistration(""))

	app.now = func() time.Time { return mustTime(t, "2026-11-10T14:30:00Z") }
	app.sendDue(context.Background())

	if len(*sent) != 0 {
		t.Errorf("sent %d notifications, want none", len(*sent))
	}
}

func TestATestNotificationIsTheFirstProgramsAndDoesNotUseUpTheDay(t *testing.T) {
	app, handler := testServer(t, "2026-11-10T06:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", programRegistration(split))

	if response := call(handler, "POST", "/api/reminders/test", `{"endpoint":"`+endpoint+`"}`); response.Code != http.StatusNoContent {
		t.Fatalf("got status %d: %s", response.Code, response.Body)
	}
	app.now = func() time.Time { return mustTime(t, "2026-11-10T14:30:00Z") }
	app.sendDue(context.Background())

	if len(*sent) != 2 || (*sent)[0].Title != "Three-day split" {
		t.Errorf("want the test and then the day's reminder: %+v", *sent)
	}
}

func TestProgramRemindersAreValidated(t *testing.T) {
	_, handler := testServer(t, "2026-11-10T06:00:00Z")
	for name, programs := range map[string]string{
		"an id with a slash":  strings.Replace(split, `"id":"split"`, `"id":"a/b"`, 1),
		"no title":            strings.Replace(split, `"title":"Three-day split"`, `"title":" "`, 1),
		"a bad time":          strings.Replace(split, `"time":"15:00"`, `"time":"3pm"`, 1),
		"a bad schedule":      strings.Replace(split, `"everyDays":2`, `"everyDays":0`, 1),
		"the same id twice":   split + "," + split,
		"an address in open":  strings.Replace(morning, `"open":"push-up"`, `"open":"../settings"`, 1),
		"an empty hype field": strings.Replace(split, `"last":"25 kg"`, `"last":""`, 1),
	} {
		if response := call(handler, "PUT", "/api/reminders/device", programRegistration(programs)); response.Code != http.StatusBadRequest {
			t.Errorf("%s: got status %d, want 400", name, response.Code)
		}
	}
}
