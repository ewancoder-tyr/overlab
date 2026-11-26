package main

import (
	"errors"
	"fmt"
	"time"
)

// A Schedule says on which days the user goes to the gym. It mirrors the GymSchedule type of the
// web app (src/settings/domain/gym-schedule.ts): the two must apply the same rule, because the
// app shows the upcoming gym days and this service sends the reminders for them.
type Schedule struct {
	// Kind is "weekdays" (fixed days of the week) or "interval" (every N days).
	Kind string `json:"kind"`
	// Weekdays lists ISO weekday numbers, 1 = Monday to 7 = Sunday. Used by "weekdays".
	Weekdays []int `json:"weekdays,omitempty"`
	// EveryDays is the length of the cycle: 2 means every second day. Used by "interval".
	EveryDays int `json:"everyDays,omitempty"`
	// StartDate is a gym day that anchors the cycle, as YYYY-MM-DD. Used by "interval".
	StartDate string `json:"startDate,omitempty"`
}

const (
	dateLayout = "2006-01-02" // Go spells layouts with this reference date instead of yyyy-MM-dd.
	timeLayout = "15:04"
	// maxEveryDays is a sanity limit, matching the web app.
	maxEveryDays = 14
)

// Validate reports why a schedule received from a client cannot be used.
func (s Schedule) Validate() error {
	switch s.Kind {
	case "weekdays":
		if len(s.Weekdays) == 0 {
			return errors.New("weekdays: pick at least one day")
		}
		for _, day := range s.Weekdays {
			if day < 1 || day > 7 {
				return fmt.Errorf("weekdays: %d is not a weekday number (1 to 7)", day)
			}
		}
		return nil
	case "interval":
		if s.EveryDays < 1 || s.EveryDays > maxEveryDays {
			return fmt.Errorf("interval: everyDays must be from 1 to %d", maxEveryDays)
		}
		if _, err := time.Parse(dateLayout, s.StartDate); err != nil {
			return errors.New("interval: startDate must be a date like 2026-11-12")
		}
		return nil
	default:
		return fmt.Errorf("unknown schedule kind %q", s.Kind)
	}
}

// isoWeekday converts Go's weekday (Sunday = 0) to the ISO number (Monday = 1, Sunday = 7).
func isoWeekday(day time.Weekday) int {
	if day == time.Sunday {
		return 7
	}
	return int(day)
}

// IsGymDay reports whether the calendar date of `local` is a gym day. Only the year, month and
// day of `local` are used, so pass a time already converted to the user's time zone.
func (s Schedule) IsGymDay(local time.Time) bool {
	switch s.Kind {
	case "weekdays":
		today := isoWeekday(local.Weekday())
		for _, day := range s.Weekdays {
			if day == today {
				return true
			}
		}
		return false
	case "interval":
		start, err := time.Parse(dateLayout, s.StartDate)
		if err != nil || s.EveryDays < 1 {
			return false
		}
		// Count whole calendar days between the two dates. Both are rebuilt as midnight UTC
		// so that daylight saving changes cannot make a day 23 or 25 hours long.
		date := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
		days := int(date.Sub(start).Hours() / 24)
		// Before the start date there are no gym days yet.
		return days >= 0 && days%s.EveryDays == 0
	default:
		return false
	}
}

// A Reminder is a schedule plus when on a gym day to send the notification.
type Reminder struct {
	Schedule Schedule `json:"schedule"`
	// Time is the local time of day, HH:MM in 24-hour form.
	Time string `json:"time"`
	// TimeZone is an IANA name such as "Europe/Warsaw". The server runs in UTC, so it needs
	// this to know when it is 15:00 for the user.
	TimeZone string `json:"timeZone"`
}

func (r Reminder) Validate() error {
	// A device may have no gym days at all, only solo reminders (see solo.go). Such a schedule
	// has no kind, and IsGymDay answers "no" for it every day.
	if r.Schedule.Kind != "" {
		if err := r.Schedule.Validate(); err != nil {
			return err
		}
	}
	if _, err := time.Parse(timeLayout, r.Time); err != nil {
		return errors.New("time must look like 15:00")
	}
	if _, err := time.LoadLocation(r.TimeZone); err != nil || r.TimeZone == "" {
		return fmt.Errorf("unknown time zone %q", r.TimeZone)
	}
	return nil
}

// maxLateness is how long after the reminder time a reminder is still worth sending. If the
// server was down at 15:00 and comes back at 22:00, "go to the gym" is no longer useful.
const maxLateness = 3 * time.Hour

// localMoments returns "now" in the reminder's time zone and today's reminder moment there.
func (r Reminder) localMoments(now time.Time) (local, at time.Time, ok bool) {
	location, err := time.LoadLocation(r.TimeZone)
	if err != nil {
		return time.Time{}, time.Time{}, false
	}
	clock, err := time.Parse(timeLayout, r.Time)
	if err != nil {
		return time.Time{}, time.Time{}, false
	}
	local = now.In(location)
	at = time.Date(local.Year(), local.Month(), local.Day(), clock.Hour(), clock.Minute(), 0, 0, location)
	return local, at, true
}

// DueDate decides whether a reminder should be sent at `now`. It returns the local date
// (YYYY-MM-DD) the reminder is for, which the caller stores so that a day is notified only once.
func (r Reminder) DueDate(now time.Time, lastSentDate string) (date string, due bool) {
	local, at, ok := r.localMoments(now)
	if !ok || !r.Schedule.IsGymDay(local) {
		return "", false
	}
	date = local.Format(dateLayout)
	if date == lastSentDate || local.Before(at) || local.Sub(at) > maxLateness {
		return "", false
	}
	return date, true
}

// PassedToday returns today's local date if today's reminder time is already behind us, and ""
// otherwise. A device that registers at 17:00 with a 15:00 reminder is marked as already
// notified for today, so that switching reminders on does not immediately fire one.
func (r Reminder) PassedToday(now time.Time) string {
	local, at, ok := r.localMoments(now)
	if !ok || local.Before(at) {
		return ""
	}
	return local.Format(dateLayout)
}
