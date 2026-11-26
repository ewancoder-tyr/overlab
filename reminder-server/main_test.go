package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testServer(t *testing.T, now string) (*server, http.Handler) {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "devices.json"))
	if err != nil {
		t.Fatal(err)
	}
	app := &server{store: store, now: func() time.Time { return mustTime(t, now) }, pick: always(0)}
	return app, app.routes()
}

const endpoint = "https://fcm.googleapis.com/fcm/send/abc"

func registration(endpoint string) string {
	return `{"subscription":{"endpoint":"` + endpoint + `","keys":{"p256dh":"key","auth":"secret"}},
		"schedule":{"kind":"weekdays","weekdays":[3]},"time":"15:00","timeZone":"Europe/Warsaw"}`
}

func call(handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(method, path, strings.NewReader(body)))
	return recorder
}

func TestRegisteringADeviceStoresItsReminder(t *testing.T) {
	app, handler := testServer(t, "2026-11-11T09:00:00Z")

	response := call(handler, "PUT", "/api/reminders/device", registration(endpoint))

	if response.Code != http.StatusNoContent {
		t.Fatalf("got status %d: %s", response.Code, response.Body)
	}
	device, known := app.store.Get(endpoint)
	if !known || device.Reminder.Time != "15:00" || device.LastSentDate != "" {
		t.Errorf("unexpected stored device: %+v (known: %v)", device, known)
	}
}

func TestRegisteringAfterTheReminderTimeDoesNotNotifyToday(t *testing.T) {
	// 16:00 UTC is 17:00 in Warsaw, two hours after the 15:00 reminder.
	app, handler := testServer(t, "2026-11-11T16:00:00Z")

	call(handler, "PUT", "/api/reminders/device", registration(endpoint))

	device, _ := app.store.Get(endpoint)
	if _, due := device.Reminder.DueDate(app.now(), device.LastSentDate); due {
		t.Error("a device registered after today's reminder time must wait for the next gym day")
	}
}

func TestOnlyKnownPushServicesAreAccepted(t *testing.T) {
	_, handler := testServer(t, "2026-11-11T09:00:00Z")

	for _, bad := range []string{"https://example.com/hook", "http://fcm.googleapis.com/x", "https://10.0.0.5/"} {
		response := call(handler, "PUT", "/api/reminders/device", registration(bad))
		if response.Code != http.StatusBadRequest {
			t.Errorf("%s: got status %d, want 400", bad, response.Code)
		}
	}
}

func TestDeletingADeviceForgetsIt(t *testing.T) {
	app, handler := testServer(t, "2026-11-11T09:00:00Z")
	call(handler, "PUT", "/api/reminders/device", registration(endpoint))

	response := call(handler, "DELETE", "/api/reminders/device", `{"endpoint":"`+endpoint+`"}`)

	if _, known := app.store.Get(endpoint); known || response.Code != http.StatusNoContent {
		t.Errorf("device still known: %v, status %d", known, response.Code)
	}
}

func TestDevicesSurviveARestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "devices.json")
	first, _ := OpenStore(path)
	if err := first.Upsert(Device{Endpoint: endpoint, Reminder: reminder()}, "2026-11-11", time.Time{}); err != nil {
		t.Fatal(err)
	}

	second, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	device, known := second.Get(endpoint)
	if !known || device.LastSentDate != "2026-11-11" {
		t.Errorf("after reopening: %+v (known: %v)", device, known)
	}
}

func TestRegisteringStoresTheLanguageTheServerSpeaksAndDropsOthers(t *testing.T) {
	app, handler := testServer(t, "2026-11-11T09:00:00Z")
	withLanguage := func(endpoint, language string) string {
		return strings.Replace(registration(endpoint), `"time"`, `"language":"`+language+`","time"`, 1)
	}

	call(handler, "PUT", "/api/reminders/device", withLanguage(endpoint, "ru"))
	call(handler, "PUT", "/api/reminders/device", withLanguage(endpoint+"2", "klingon"))

	inRussian, _ := app.store.Get(endpoint)
	unknown, _ := app.store.Get(endpoint + "2")
	if inRussian.Language != "ru" || unknown.Language != "" {
		t.Errorf("stored %q and %q", inRussian.Language, unknown.Language)
	}
}

func TestRegisteringStoresHypeFactsAndRejectsOversizedOnes(t *testing.T) {
	app, handler := testServer(t, "2026-11-11T09:00:00Z")
	withHype := strings.Replace(registration(endpoint), `"time"`,
		`"hype":[{"exercise":"Bench press","last":"25 kg","target":"30 kg"}],"time"`, 1)

	response := call(handler, "PUT", "/api/reminders/device", withHype)

	device, _ := app.store.Get(endpoint)
	if response.Code != http.StatusNoContent || len(device.Hype) != 1 || device.Hype[0].Target != "30 kg" {
		t.Errorf("status %d, stored hype %+v", response.Code, device.Hype)
	}

	tooLong := strings.Replace(withHype, "Bench press", strings.Repeat("x", 100), 1)
	if call(handler, "PUT", "/api/reminders/device", tooLong).Code != http.StatusBadRequest {
		t.Error("an overlong hype fact must be rejected")
	}
}
