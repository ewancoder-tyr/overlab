package main

import (
	"testing"
	"time"
)

func mustTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func day(t *testing.T, value string) time.Time {
	return mustTime(t, value+"T12:00:00Z")
}

func TestWeekdaysScheduleMatchesOnlyTheChosenDays(t *testing.T) {
	schedule := Schedule{Kind: "weekdays", Weekdays: []int{1, 3, 5}} // Mon, Wed, Fri

	// 9 November 2026 is a Monday.
	want := map[string]bool{
		"2026-11-09": true, "2026-11-10": false, "2026-11-11": true,
		"2026-11-12": false, "2026-11-13": true, "2026-11-14": false, "2026-11-15": false,
	}
	for date, expected := range want {
		if got := schedule.IsGymDay(day(t, date)); got != expected {
			t.Errorf("%s: got %v, want %v", date, got, expected)
		}
	}
}

func TestSundayIsWeekdaySeven(t *testing.T) {
	schedule := Schedule{Kind: "weekdays", Weekdays: []int{7}}

	if !schedule.IsGymDay(day(t, "2026-11-15")) {
		t.Error("Sunday 15 November should be a gym day")
	}
}

func TestEverySecondDayAlternatesWeekdaysFromWeekToWeek(t *testing.T) {
	// Starting on Monday: Mon, Wed, Fri, Sun, then Tue, Thu, Sat.
	schedule := Schedule{Kind: "interval", EveryDays: 2, StartDate: "2026-11-09"}

	gymDays := []string{
		"2026-11-09", "2026-11-11", "2026-11-13", "2026-11-15",
		"2026-11-17", "2026-11-19", "2026-11-21",
	}
	for _, date := range gymDays {
		if !schedule.IsGymDay(day(t, date)) {
			t.Errorf("%s should be a gym day", date)
		}
	}
	for _, date := range []string{"2026-11-10", "2026-11-16", "2026-11-18"} {
		if schedule.IsGymDay(day(t, date)) {
			t.Errorf("%s should be a rest day", date)
		}
	}
}

func TestIntervalHasNoGymDaysBeforeItsStartDate(t *testing.T) {
	schedule := Schedule{Kind: "interval", EveryDays: 2, StartDate: "2026-11-09"}

	if schedule.IsGymDay(day(t, "2026-11-07")) {
		t.Error("a date before the start date must not be a gym day")
	}
}

func TestIntervalCountsCalendarDaysAcrossDaylightSaving(t *testing.T) {
	// Clocks go forward in Warsaw on 28 March 2027, making that day 23 hours long.
	schedule := Schedule{Kind: "interval", EveryDays: 3, StartDate: "2027-03-26"}
	warsaw, err := time.LoadLocation("Europe/Warsaw")
	if err != nil {
		t.Fatal(err)
	}

	if !schedule.IsGymDay(time.Date(2027, 3, 29, 0, 30, 0, 0, warsaw)) {
		t.Error("29 March, three days after the start, should be a gym day")
	}
}

func reminder() Reminder {
	return Reminder{
		Schedule: Schedule{Kind: "weekdays", Weekdays: []int{3}}, // Wednesday
		Time:     "15:00",
		TimeZone: "Europe/Warsaw", // UTC+1 in November
	}
}

func TestReminderIsDueFromItsLocalTimeOnAGymDay(t *testing.T) {
	// 13:59 UTC is 14:59 in Warsaw: one minute too early.
	if _, due := reminder().DueDate(mustTime(t, "2026-11-11T13:59:00Z"), ""); due {
		t.Error("must not be due before 15:00 local time")
	}

	date, due := reminder().DueDate(mustTime(t, "2026-11-11T14:00:00Z"), "")
	if !due || date != "2026-11-11" {
		t.Errorf("got (%q, %v), want it due for 2026-11-11", date, due)
	}
}

func TestReminderIsSentOnlyOncePerDay(t *testing.T) {
	if _, due := reminder().DueDate(mustTime(t, "2026-11-11T14:30:00Z"), "2026-11-11"); due {
		t.Error("must not be due again on a day that was already notified")
	}
}

func TestReminderIsNotDueOnARestDay(t *testing.T) {
	if _, due := reminder().DueDate(mustTime(t, "2026-11-12T14:30:00Z"), ""); due {
		t.Error("Thursday is not a gym day")
	}
}

func TestReminderIsDroppedWhenMoreThanThreeHoursLate(t *testing.T) {
	// 17:01 UTC is 18:01 in Warsaw, just past the three-hour window.
	if _, due := reminder().DueDate(mustTime(t, "2026-11-11T17:01:00Z"), ""); due {
		t.Error("a reminder more than three hours late must be dropped")
	}
}

func TestTheGymDayIsDecidedInTheUsersTimeZone(t *testing.T) {
	// 23:30 UTC on Tuesday is already 08:30 on Wednesday in Tokyo.
	tokyo := Reminder{
		Schedule: Schedule{Kind: "weekdays", Weekdays: []int{3}},
		Time:     "08:00",
		TimeZone: "Asia/Tokyo",
	}

	date, due := tokyo.DueDate(mustTime(t, "2026-11-10T23:30:00Z"), "")
	if !due || date != "2026-11-11" {
		t.Errorf("got (%q, %v), want it due for Wednesday 2026-11-11", date, due)
	}
}

func TestPassedTodayIsSetOnlyAfterTheReminderTime(t *testing.T) {
	if got := reminder().PassedToday(mustTime(t, "2026-11-11T13:00:00Z")); got != "" {
		t.Errorf("before the reminder time: got %q, want empty", got)
	}
	if got := reminder().PassedToday(mustTime(t, "2026-11-11T16:00:00Z")); got != "2026-11-11" {
		t.Errorf("after the reminder time: got %q, want 2026-11-11", got)
	}
}

func TestValidateRejectsBadInput(t *testing.T) {
	bad := []Reminder{
		{Schedule: Schedule{Kind: "weekdays"}, Time: "15:00", TimeZone: "UTC"},
		{Schedule: Schedule{Kind: "weekdays", Weekdays: []int{8}}, Time: "15:00", TimeZone: "UTC"},
		{Schedule: Schedule{Kind: "interval", EveryDays: 0, StartDate: "2026-11-09"}, Time: "15:00", TimeZone: "UTC"},
		{Schedule: Schedule{Kind: "interval", EveryDays: 2, StartDate: "soon"}, Time: "15:00", TimeZone: "UTC"},
		{Schedule: Schedule{Kind: "weekdays", Weekdays: []int{1}}, Time: "3pm", TimeZone: "UTC"},
		{Schedule: Schedule{Kind: "weekdays", Weekdays: []int{1}}, Time: "15:00", TimeZone: "Mars/Olympus"},
		{Schedule: Schedule{Kind: "monthly"}, Time: "15:00", TimeZone: "UTC"},
	}
	for index, reminder := range bad {
		if reminder.Validate() == nil {
			t.Errorf("case %d: expected a validation error", index)
		}
	}
	if err := reminder().Validate(); err != nil {
		t.Errorf("a valid reminder was rejected: %v", err)
	}
}
