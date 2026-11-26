package leaderboard

import (
	"strings"
	"testing"
)

func lists(set roastSet) map[string][]string {
	return map[string][]string{"lifting": set.lifting, "cardio": set.cardio, "record": set.record}
}

func TestEveryLanguageHasTwentyLiftingTenCardioAndSixRecordRoasts(t *testing.T) {
	for language, set := range roastSets {
		if len(set.lifting) != 20 || len(set.cardio) != 10 || len(set.record) != 6 {
			t.Errorf("%s: %d lifting, %d cardio, %d record", language, len(set.lifting), len(set.cardio), len(set.record))
		}
		if set.anonymous == "" {
			t.Errorf("%s: no title for a buddy without a name", language)
		}
	}
}

func TestEveryRoastQuotesTheExerciseAndWhatWasDone(t *testing.T) {
	for language, set := range roastSets {
		for list, wordings := range lists(set) {
			for _, wording := range wordings {
				if !strings.Contains(strings.ToLower(wording), "{exercise}") || !strings.Contains(wording, "{done}") {
					t.Errorf("%s %s: %q", language, list, wording)
				}
			}
		}
	}
}

func TestEveryRoastRendersWithoutLeftoverPlaceholders(t *testing.T) {
	for language, set := range roastSets {
		total := len(set.lifting) + len(set.cardio) + len(set.record)
		for _, fact := range []roastFact{
			{Exercise: "Bench press", Done: "80 kg × 8"},
			{Exercise: "Running", Done: "5 km · 30:00", Cardio: true},
			{Exercise: "Bench press", Done: "80 kg × 8", Record: true},
		} {
			for index := range total {
				body, _ := composeRoast(fact, language, -1, func(n int) int { return index % n })
				if strings.ContainsAny(body, "{}") || !strings.Contains(body, fact.Done) {
					t.Errorf("%s: %q", language, body)
				}
			}
		}
	}
}

func TestCardioAndRecordsHaveTheirOwnRoasts(t *testing.T) {
	first := func(int) int { return 0 }
	lifting, liftingIndex := composeRoast(roastFact{Exercise: "Running", Done: "5 km"}, "en", -1, first)
	cardio, cardioIndex := composeRoast(roastFact{Exercise: "Running", Done: "5 km", Cardio: true}, "en", -1, first)
	// A record wins over cardio: a record run is told as a record.
	record, recordIndex := composeRoast(roastFact{Exercise: "Running", Done: "5 km", Cardio: true, Record: true}, "en", -1, first)
	if lifting == cardio || cardio == record || liftingIndex != 0 || cardioIndex != 20 || recordIndex != 30 {
		t.Fatalf("%q (%d), %q (%d), %q (%d)", lifting, liftingIndex, cardio, cardioIndex, record, recordIndex)
	}
}

func TestTheExerciseNameIsLowercasedMidSentence(t *testing.T) {
	body, _ := composeRoast(roastFact{Exercise: "Bench press", Done: "80 kg × 8"}, "en", -1, func(int) int { return 0 })
	if body != "80 kg × 8 on bench press. And you? Sofa again?" {
		t.Fatalf("%q", body)
	}
}

func TestABuddyWithoutANameStillHasATitle(t *testing.T) {
	if got := buddyTitle("  ", "ru"); got != russianRoasts.anonymous {
		t.Fatalf("%q", got)
	}
	if got := buddyTitle("Alice", "ru"); got != "Alice" {
		t.Fatalf("%q", got)
	}
	// A device without a language, or with one there are no roasts in, is told in English.
	if got := buddyTitle("", "de"); got != englishRoasts.anonymous {
		t.Fatalf("%q", got)
	}
}
