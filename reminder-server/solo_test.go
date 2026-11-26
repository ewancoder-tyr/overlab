package main

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

// soloRegistration is a device with no gym days and one solo reminder: push-ups every day at
// 08:00 Warsaw time, counted from 10 November 2026.
func soloRegistration(solo string) string {
	return `{"subscription":{"endpoint":"` + endpoint + `","keys":{"p256dh":"key","auth":"secret"}},
		"time":"15:00","timeZone":"Europe/Warsaw","language":"en","solo":[` + solo + `]}`
}

const pushUps = `{"id":"push-up","exercise":"Push-up","time":"08:00",
	"schedule":{"kind":"interval","everyDays":1,"startDate":"2026-11-10"},
	"hype":{"exercise":"Push-up","last":"10 reps","target":"11 reps"}}`

// capturePushes makes the server record what it would have sent.
func capturePushes(app *server) *[]Message {
	sent := []Message{}
	app.push = func(_ context.Context, _ Device, message Message) error {
		sent = append(sent, message)
		return nil
	}
	return &sent
}

func TestASoloReminderRingsOnItsOwnScheduleWithoutAnyGymDays(t *testing.T) {
	// 07:30 UTC is 08:30 in Warsaw: half an hour after the alarm.
	app, handler := testServer(t, "2026-11-11T06:00:00Z")
	sent := capturePushes(app)
	if response := call(handler, "PUT", "/api/reminders/device", soloRegistration(pushUps)); response.Code != http.StatusNoContent {
		t.Fatalf("got status %d: %s", response.Code, response.Body)
	}

	app.now = func() time.Time { return mustTime(t, "2026-11-11T07:30:00Z") }
	app.sendDue(context.Background())
	app.sendDue(context.Background()) // The next minute's tick must not ring again.

	if len(*sent) != 1 {
		t.Fatalf("sent %d notifications, want 1", len(*sent))
	}
	message := (*sent)[0]
	if message.Title != "Push-up" || message.URL != "/exercises/push-up?solo=1" || message.Tag != "solo-reminder-push-up" {
		t.Errorf("unexpected message: %+v", message)
	}
	if !strings.Contains(message.Body, "10 reps") {
		t.Errorf("the roast should quote the last solo set: %q", message.Body)
	}
}

func TestASoloReminderRingsAgainTheNextDay(t *testing.T) {
	app, handler := testServer(t, "2026-11-11T06:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", soloRegistration(pushUps))

	for _, now := range []string{"2026-11-11T07:00:00Z", "2026-11-12T07:00:00Z"} {
		app.now = func() time.Time { return mustTime(t, now) }
		app.sendDue(context.Background())
	}

	if len(*sent) != 2 {
		t.Errorf("sent %d notifications over two days, want 2", len(*sent))
	}
}

func TestASoloReminderSkipsTheDaysBetween(t *testing.T) {
	everySecondDay := strings.Replace(pushUps, `"everyDays":1`, `"everyDays":2`, 1)
	app, handler := testServer(t, "2026-11-10T06:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", soloRegistration(everySecondDay))

	// 10 November is a day of the cycle, the 11th is not, the 12th is again.
	for _, now := range []string{"2026-11-10T07:00:00Z", "2026-11-11T07:00:00Z", "2026-11-12T07:00:00Z"} {
		app.now = func() time.Time { return mustTime(t, now) }
		app.sendDue(context.Background())
	}

	if len(*sent) != 2 {
		t.Errorf("sent %d notifications over three days, want 2", len(*sent))
	}
}

func TestASoloReminderAddedAfterItsTimeWaitsForItsNextDay(t *testing.T) {
	// 09:00 UTC is 10:00 in Warsaw, two hours after the 08:00 alarm: still within the three
	// hours a late reminder is sent in, so only the mark keeps it quiet.
	app, handler := testServer(t, "2026-11-11T09:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", soloRegistration(pushUps))

	app.sendDue(context.Background())

	if len(*sent) != 0 {
		t.Errorf("an alarm set after today's time must not ring today, sent %+v", *sent)
	}
}

func TestSendingThePlanAgainKeepsTodaysSoloMark(t *testing.T) {
	app, handler := testServer(t, "2026-11-11T06:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", soloRegistration(pushUps))
	app.now = func() time.Time { return mustTime(t, "2026-11-11T07:10:00Z") }
	app.sendDue(context.Background())

	// The app re-sends its plan whenever anything in it changes (a new hype number).
	call(handler, "PUT", "/api/reminders/device", soloRegistration(strings.Replace(pushUps, "10 reps", "12 reps", 1)))
	app.sendDue(context.Background())

	if len(*sent) != 1 {
		t.Errorf("sent %d notifications, want 1", len(*sent))
	}
}

func TestASoloAndAGymReminderBothRingOnTheSameDay(t *testing.T) {
	// Wednesday 11 November, gym at 15:00 Warsaw and push-ups at 08:00.
	app, handler := testServer(t, "2026-11-11T06:00:00Z")
	sent := capturePushes(app)
	both := strings.Replace(registration(endpoint), `"time"`, `"solo":[`+pushUps+`],"time"`, 1)
	call(handler, "PUT", "/api/reminders/device", both)

	for _, now := range []string{"2026-11-11T07:00:00Z", "2026-11-11T14:00:00Z"} {
		app.now = func() time.Time { return mustTime(t, now) }
		app.sendDue(context.Background())
	}

	if len(*sent) != 2 || (*sent)[0].Tag == (*sent)[1].Tag {
		t.Errorf("want one solo and one gym notification, got %+v", *sent)
	}
}

func TestASoloReminderWithoutASetToQuoteStillRings(t *testing.T) {
	withoutHype := pushUps[:strings.Index(pushUps, `,
	"hype"`)] + "}"
	app, handler := testServer(t, "2026-11-11T06:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", soloRegistration(withoutHype))

	app.now = func() time.Time { return mustTime(t, "2026-11-11T07:00:00Z") }
	app.sendDue(context.Background())

	if len(*sent) != 1 || (*sent)[0].Title != "Push-up" || (*sent)[0].Body == "" {
		t.Errorf("unexpected notifications: %+v", *sent)
	}
}

func TestRemovingTheLastSoloReminderStopsIt(t *testing.T) {
	app, handler := testServer(t, "2026-11-11T06:00:00Z")
	sent := capturePushes(app)
	call(handler, "PUT", "/api/reminders/device", soloRegistration(pushUps))

	// The app sends an empty plan: no gym days, no solo reminders.
	if response := call(handler, "PUT", "/api/reminders/device", soloRegistration("")); response.Code != http.StatusNoContent {
		t.Fatalf("got status %d: %s", response.Code, response.Body)
	}
	app.now = func() time.Time { return mustTime(t, "2026-11-11T07:00:00Z") }
	app.sendDue(context.Background())

	if len(*sent) != 0 {
		t.Errorf("a removed alarm rang: %+v", *sent)
	}
}

func TestSoloRemindersAreValidated(t *testing.T) {
	_, handler := testServer(t, "2026-11-11T06:00:00Z")
	bad := map[string]string{
		"an id that could change the URL": strings.Replace(pushUps, `"id":"push-up"`, `"id":"../settings"`, 1),
		"a time that is not a time":       strings.Replace(pushUps, `"time":"08:00"`, `"time":"8 am"`, 1),
		"no schedule":                     strings.Replace(pushUps, `"kind":"interval"`, `"kind":""`, 1),
		"no exercise name":                strings.Replace(pushUps, `"exercise":"Push-up","time"`, `"exercise":" ","time"`, 1),
		"the same exercise twice":         pushUps + "," + pushUps,
		"more than ten":                   strings.Repeat(pushUps+",", 10) + pushUps,
	}
	for name, solo := range bad {
		if response := call(handler, "PUT", "/api/reminders/device", soloRegistration(solo)); response.Code != http.StatusBadRequest {
			t.Errorf("%s: got status %d, want 400", name, response.Code)
		}
	}
}
