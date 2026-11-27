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

// A ProgramReminder is the reminder of one program: a list of exercises the user prepared, done
// on its own days (a gym split on Monday, Wednesday and Friday; push-ups every morning). Each
// program has its own schedule and its own time of day, in the device's time zone. See
// docs/reminders.md.
//
// It is a calendar rule and nothing else. The server never learns what was done: when a skipped
// day moves an "every N days" program, the app sends the schedule again with a new start date.
//
// Programs replaced the single gym day reminder and the solo reminders (solo.go) of earlier
// versions of the app. A device that has not updated yet still registers those, and they still
// ring; an updated device sends neither, only programs.
type ProgramReminder struct {
	// ID is the program's id. It names the alarm on this device.
	ID string `json:"id"`
	// Title is the program's name in the user's words: the notification's title.
	Title string `json:"title"`
	// Schedule has the same shape and rule as every schedule (schedule.go).
	Schedule Schedule `json:"schedule"`
	// Time is the local time of day, HH:MM in 24-hour form.
	Time string `json:"time"`
	// Hype holds what was last done on the exercises of the program's next day and the numbers
	// to go for; one of them is picked for the roast. Empty until there is a set to quote.
	Hype []HypeFact `json:"hype,omitempty"`
	// Open is set for a solo program of a single exercise: that exercise's catalog id, so a tap
	// opens its logging screen on solo sets. Otherwise a tap opens the Train page.
	Open string `json:"open,omitempty"`
	// LastSentDate is the local date of the last reminder sent, so each day rings once. Kept by
	// the server; whatever a client puts here is overwritten.
	LastSentDate string `json:"lastSentDate,omitempty"`
}

// maxProgramReminders matches MAX_PROGRAMS in the web app (src/training/domain/program.ts).
const maxProgramReminders = 20

// programIDPattern keeps ids to plain characters. The web app applies the same pattern
// (ID_PATTERN in src/training/domain/program.ts).
var programIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)

func validatePrograms(reminders []ProgramReminder) error {
	if len(reminders) > maxProgramReminders {
		return fmt.Errorf("programs: at most %d reminders", maxProgramReminders)
	}
	seen := map[string]bool{}
	for _, reminder := range reminders {
		if !programIDPattern.MatchString(reminder.ID) {
			return errors.New("programs: the id must be 1 to 80 letters, digits, dashes or underscores")
		}
		if seen[reminder.ID] {
			return fmt.Errorf("programs: %q is listed twice", reminder.ID)
		}
		seen[reminder.ID] = true
		if strings.TrimSpace(reminder.Title) == "" || utf8.RuneCountInString(reminder.Title) > maxHypeFieldLen {
			return fmt.Errorf("programs: the title needs 1 to %d characters", maxHypeFieldLen)
		}
		if err := reminder.Schedule.Validate(); err != nil {
			return fmt.Errorf("programs: %w", err)
		}
		if _, err := time.Parse(timeLayout, reminder.Time); err != nil {
			return errors.New("programs: time must look like 08:00")
		}
		if err := validateHype(reminder.Hype); err != nil {
			return fmt.Errorf("programs: %w", err)
		}
		// The id goes into the URL a tap opens, so it gets the pattern solo ids always had.
		if reminder.Open != "" && !soloIDPattern.MatchString(reminder.Open) {
			return errors.New("programs: open must be an exercise id")
		}
	}
	return nil
}

// in gives the program reminder the device's time zone, which makes it a Reminder: the "is it
// due" rule (once a day, never more than three hours late) then applies unchanged.
func (r ProgramReminder) in(timeZone string) Reminder {
	return Reminder{Schedule: r.Schedule, Time: r.Time, TimeZone: timeZone}
}

// carryProgramSent prepares the program reminders a client just sent for storing: each keeps
// the "last sent" mark of the stored reminder it replaces.
//
// A reminder that is new, or whose schedule or time changed, is treated like a new device: if
// its time has already passed today it waits for its next day instead of ringing at once.
func carryProgramSent(stored, incoming []ProgramReminder, timeZone string, now time.Time) []ProgramReminder {
	if len(incoming) == 0 {
		return nil
	}
	before := map[string]ProgramReminder{}
	for _, reminder := range stored {
		before[reminder.ID] = reminder
	}
	result := make([]ProgramReminder, 0, len(incoming))
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

// programMessage is the notification of one program. Its tag carries the program, so two
// programs never replace each other's notification.
func programMessage(reminder ProgramReminder, body string) Message {
	url := "/exercises"
	if reminder.Open != "" {
		url = "/exercises/" + reminder.Open + "?solo=1"
	}
	return Message{
		Title:  reminder.Title,
		Body:   body,
		Tag:    "program-reminder-" + reminder.ID,
		URL:    url,
		TTL:    maxLateness,
		Urgent: true,
	}
}
