package main

import (
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// A SoloReminder is an alarm for one exercise the user does outside workouts (push-ups every
// morning): its own schedule and its own time of day, in the device's time zone. See "Solo
// reminder rule" in docs/reminders.md.
//
// It is a calendar rule and nothing else. The server never learns whether the exercise was done,
// so nothing is ever "missed": the alarm simply rings on its days.
type SoloReminder struct {
	// ID is the exercise's catalog id ("push-up"). It names the alarm on this device and is the
	// page a tap opens.
	ID string `json:"id"`
	// Exercise is the exercise's name in the user's language: the notification's title.
	Exercise string `json:"exercise"`
	// Schedule has the same shape and rule as the gym schedule, counted on its own.
	Schedule Schedule `json:"schedule"`
	// Time is the local time of day, HH:MM in 24-hour form.
	Time string `json:"time"`
	// Hype is what was last done on the exercise outside workouts and the number to go for.
	// Absent until there is a solo set to quote.
	Hype *HypeFact `json:"hype,omitempty"`
	// LastSentDate is the local date of the last alarm sent, so each day rings once. Kept by
	// the server; whatever a client puts here is overwritten.
	LastSentDate string `json:"lastSentDate,omitempty"`
}

// maxSoloReminders matches MAX_SOLO_REMINDERS in the web app.
const maxSoloReminders = 10

// soloIDPattern keeps the id safe to put into the URL a tap opens. The web app applies the same
// pattern (src/settings/domain/solo-reminder.ts).
var soloIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func validateSolo(reminders []SoloReminder) error {
	if len(reminders) > maxSoloReminders {
		return fmt.Errorf("solo: at most %d reminders", maxSoloReminders)
	}
	seen := map[string]bool{}
	for _, reminder := range reminders {
		if !soloIDPattern.MatchString(reminder.ID) {
			return errors.New("solo: the id must be 1 to 64 letters, digits, dashes or underscores")
		}
		if seen[reminder.ID] {
			return fmt.Errorf("solo: %q is listed twice", reminder.ID)
		}
		seen[reminder.ID] = true
		if strings.TrimSpace(reminder.Exercise) == "" || utf8.RuneCountInString(reminder.Exercise) > maxHypeFieldLen {
			return fmt.Errorf("solo: the exercise name needs 1 to %d characters", maxHypeFieldLen)
		}
		if err := reminder.Schedule.Validate(); err != nil {
			return fmt.Errorf("solo: %w", err)
		}
		if _, err := time.Parse(timeLayout, reminder.Time); err != nil {
			return errors.New("solo: time must look like 08:00")
		}
		if reminder.Hype != nil {
			if err := validateHype([]HypeFact{*reminder.Hype}); err != nil {
				return fmt.Errorf("solo: %w", err)
			}
		}
	}
	return nil
}

// in gives the solo reminder the device's time zone, which makes it a Reminder: the "is it due"
// rule (once a day, never more than three hours late) is then the gym reminder's, unchanged.
func (r SoloReminder) in(timeZone string) Reminder {
	return Reminder{Schedule: r.Schedule, Time: r.Time, TimeZone: timeZone}
}

// carrySoloSent prepares the solo reminders a client just sent for storing: each keeps the
// "last sent" mark of the stored reminder it replaces.
//
// A reminder that is new, or whose schedule or time changed, is treated like a new device: if
// its time has already passed today it waits for its next day instead of ringing at once.
func carrySoloSent(stored, incoming []SoloReminder, timeZone string, now time.Time) []SoloReminder {
	if len(incoming) == 0 {
		return nil
	}
	before := map[string]SoloReminder{}
	for _, reminder := range stored {
		before[reminder.ID] = reminder
	}
	result := make([]SoloReminder, 0, len(incoming))
	for _, reminder := range incoming {
		old, known := before[reminder.ID]
		// DeepEqual, because a schedule holds a slice of weekdays, which == cannot compare.
		if known && old.Time == reminder.Time && reflect.DeepEqual(old.Schedule, reminder.Schedule) {
			reminder.LastSentDate = old.LastSentDate
		} else {
			reminder.LastSentDate = reminder.in(timeZone).PassedToday(now)
		}
		result = append(result, reminder)
	}
	return result
}

// soloMessage is the notification of one solo reminder. Its tag carries the exercise, so two
// alarms never replace each other, nor the gym day reminder. A tap opens the exercise's logging
// screen on solo sets.
func soloMessage(reminder SoloReminder, body string) Message {
	return Message{
		Title:  reminder.Exercise,
		Body:   body,
		Tag:    "solo-reminder-" + reminder.ID,
		URL:    "/exercises/" + reminder.ID + "?solo=1",
		TTL:    maxLateness,
		Urgent: true,
	}
}
