package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"overlab/reminder-server/leaderboard"
)

// VAPID keys identify this server to the push services (Google, Mozilla, Apple). The browser
// ties each subscription to the public key, so only the holder of the private key can push to
// it. They are generated once and must then stay the same: with new keys every existing
// subscription stops working.
type vapidKeys struct {
	Public  string `json:"publicKey"`
	Private string `json:"privateKey"`
}

func loadOrCreateVAPIDKeys(path string) (vapidKeys, error) {
	var keys vapidKeys
	data, err := os.ReadFile(path)
	if err == nil {
		return keys, json.Unmarshal(data, &keys)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return keys, err
	}
	keys.Private, keys.Public, err = webpush.GenerateVAPIDKeys()
	if err != nil {
		return keys, err
	}
	data, err = json.Marshal(keys)
	if err != nil {
		return keys, err
	}
	return keys, os.WriteFile(path, data, 0o600)
}

// pushHosts are the push services this server agrees to call. Clients hand us the URL to post
// to; without this list anyone could make the server send requests to an address of their
// choosing (for instance one inside the private network).
var pushHosts = []string{
	"fcm.googleapis.com",         // Chrome, Edge and other Chromium browsers
	".push.services.mozilla.com", // Firefox
	".push.apple.com",            // Safari
	".notify.windows.com",        // older Edge
}

func isPushEndpoint(endpoint string) bool {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" {
		return false
	}
	host := parsed.Hostname()
	for _, allowed := range pushHosts {
		// An entry starting with a dot allows any subdomain of it.
		if host == allowed || (strings.HasPrefix(allowed, ".") && strings.HasSuffix(host, allowed)) {
			return true
		}
	}
	return false
}

// errGone means the push service says the subscription no longer exists (the app was
// uninstalled or notifications were switched off). The device should be forgotten.
var errGone = errors.New("subscription is gone")

type Sender struct {
	keys vapidKeys
	// subject is a contact URL the push services can use if this server misbehaves.
	subject string
}

// A Message is one notification, whatever it is about.
type Message struct {
	Title string
	Body  string
	// Tag groups notifications: a new one replaces an unread older one with the same tag
	// instead of piling up. Reminders and announcements have different tags, so neither
	// replaces the other.
	Tag string
	// URL is the page of the app a tap opens.
	URL string
	// TTL is how long the push service keeps the message for a phone that is offline.
	TTL time.Duration
	// Urgent asks the push service to deliver immediately, waking a phone that is asleep.
	// Without it, Android holds the message while the phone is idle (Doze mode) and hands it
	// over when the phone is next used: far too late for a reminder, fine for news.
	Urgent bool
}

// reminderMessage is a gym day reminder. After three hours "go to the gym" is stale.
func reminderMessage(title, body string) Message {
	return Message{Title: title, Body: body, Tag: "gym-reminder", URL: "/exercises", TTL: maxLateness, Urgent: true}
}

// buddyMessage is the news that a buddy just did a set. It is about this very moment, so it
// wakes the phone, and an hour later it is not worth delivering. A tap opens the leaderboard.
func buddyMessage(notice leaderboard.Notice) Message {
	return Message{Title: notice.Title, Body: notice.Body, Tag: notice.Tag, URL: "/leaderboard", TTL: time.Hour, Urgent: true}
}

// The payload in the shape Angular's service worker understands: it shows `notification` as
// is, and `data.onActionClick` tells it what a tap should do, with no code of our own in the
// worker.
func notificationPayload(message Message) ([]byte, error) {
	return json.Marshal(map[string]any{
		"notification": map[string]any{
			"title": message.Title,
			"body":  message.Body,
			"icon":  "icons/icon-192x192.png",
			"tag":   message.Tag,
			"data": map[string]any{
				"onActionClick": map[string]any{
					"default": map[string]any{"operation": "navigateLastFocusedOrOpen", "url": message.URL},
				},
			},
		},
	})
}

func (s Sender) Send(ctx context.Context, device Device, message Message) error {
	payload, err := notificationPayload(message)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	urgency := webpush.UrgencyNormal
	if message.Urgent {
		urgency = webpush.UrgencyHigh
	}

	response, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: device.Endpoint,
		Keys:     webpush.Keys{P256dh: device.P256dh, Auth: device.Auth},
	}, &webpush.Options{
		Subscriber:      s.subject,
		VAPIDPublicKey:  s.keys.Public,
		VAPIDPrivateKey: s.keys.Private,
		TTL:             int(message.TTL.Seconds()),
		Urgency:         urgency,
	})
	if err != nil {
		return err
	}
	defer response.Body.Close()

	switch {
	case response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone:
		return errGone
	case response.StatusCode >= 300:
		detail, _ := io.ReadAll(io.LimitReader(response.Body, 300))
		return fmt.Errorf("push service answered %d: %s", response.StatusCode, detail)
	}
	return nil
}
