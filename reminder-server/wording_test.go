package main

import (
	"strings"
	"testing"
)

// always returns a picker that answers every question with the same number (clamped to range).
func always(value int) picker {
	return func(n int) int {
		if value >= n {
			return n - 1
		}
		return value
	}
}

var benchFact = []HypeFact{{Exercise: "Bench press", Last: "25 kg", Target: "30 kg"}}
var runningFact = []HypeFact{{Exercise: "Running", Last: "5 km in 30:00", Target: "5 km in 30:00", Cardio: true}}

// The same facts as the app words them for a Russian device.
var russianBenchFact = []HypeFact{{Exercise: "Жим лёжа", Last: "25 кг", Target: "30 кг"}}
var russianRunningFact = []HypeFact{{Exercise: "Бег", Last: "5 км за 30:00", Target: "5 км за 30:00", Cardio: true}}

// Every language is held to the same rules: the same number of wordings in each list, so that
// both are equally hard to wear out, and every wording renders its facts.
var languageCases = []struct {
	language      string
	lift, cardio  []HypeFact
	exercise      string
	target, cLast string
	cExercise     string
}{
	{"en", benchFact, runningFact, "bench press", "30 kg", "5 km in 30:00", "running"},
	{"ru", russianBenchFact, russianRunningFact, "жим лёжа", "30 кг", "5 км за 30:00", "бег"},
}

func TestEveryLanguageHasFortyPersonalTwentyCardioAndAllTheGenericWordings(t *testing.T) {
	for language, set := range wordingSets {
		if len(set.personal) != 40 || len(set.cardio) != 20 {
			t.Errorf("%s: %d personal and %d cardio wordings, want 40 and 20", language, len(set.personal), len(set.cardio))
		}
		if len(set.generic) != len(english.generic) || len(set.titles) != len(english.titles) {
			t.Errorf("%s: %d generic wordings and %d titles, want %d and %d", language,
				len(set.generic), len(set.titles), len(english.generic), len(english.titles))
		}
	}
}

func TestEveryWordingQuotesTheExerciseTheLastResultAndTheTarget(t *testing.T) {
	for language, set := range wordingSets {
		for index, wording := range set.personal {
			hasExercise := strings.Contains(wording, "{exercise}") || strings.Contains(wording, "{Exercise}")
			if !hasExercise || !strings.Contains(wording, "{last}") || !strings.Contains(wording, "{target}") {
				t.Errorf("%s wording %d is missing a placeholder: %s", language, index, wording)
			}
		}
	}
}

// Cardio aims to match last time, so its wordings quote the session to match and never ask
// for a bigger number. Older app versions still send a bigger {target}; it is never shown.
func TestEveryCardioWordingAsksToMatchLastTimeAndNeverQuotesATarget(t *testing.T) {
	for language, set := range wordingSets {
		for index, wording := range set.cardio {
			hasExercise := strings.Contains(wording, "{exercise}") || strings.Contains(wording, "{Exercise}")
			if !hasExercise || !strings.Contains(wording, "{last}") || strings.Contains(wording, "{target}") {
				t.Errorf("%s cardio wording %d must quote {exercise} and {last}, never {target}: %s", language, index, wording)
			}
		}
	}
}

func TestEveryWordingRendersWithoutLeftoverPlaceholders(t *testing.T) {
	for _, c := range languageCases {
		for index := range wordingsFor(c.language).personal {
			// "Previous" is the wording before this one, so the fixed picker lands on `index`.
			_, body, _, err := composeReminder(c.lift, c.language, -1, always(index))
			if err != nil || strings.ContainsAny(body, "{}") {
				t.Errorf("%s wording %d rendered badly: %q (%v)", c.language, index, body, err)
			}
			if !strings.Contains(body, c.target) || !strings.Contains(strings.ToLower(body), c.exercise) {
				t.Errorf("%s wording %d lost its facts: %q", c.language, index, body)
			}
		}
	}
}

func TestEveryCardioWordingRendersTheCardioFact(t *testing.T) {
	for _, c := range languageCases {
		set := wordingsFor(c.language)
		for index, wording := range set.cardio {
			_, body, got, err := composeReminder(c.cardio, c.language, -1, always(index))
			if err != nil || strings.ContainsAny(body, "{}") || body == "" {
				t.Errorf("%s cardio wording %d rendered badly: %q (%v)", c.language, index, body, err)
			}
			if !strings.Contains(body, c.cLast) || !strings.Contains(strings.ToLower(body), c.cExercise) {
				t.Errorf("%s cardio wording %d lost its facts: %q (template %s)", c.language, index, body, wording)
			}
			if got != len(set.personal)+index {
				t.Errorf("%s cardio wording %d reported as index %d", c.language, index, got)
			}
		}
	}
}

func TestACardioFactIsNeverRoastedInLiftingWords(t *testing.T) {
	for choice := range len(english.personal) {
		_, body, wording, _ := composeReminder(runningFact, "en", -1, always(choice))
		if wording < len(english.personal) {
			t.Fatalf("a cardio fact got lifting wording %d: %q", wording, body)
		}
	}
}

func TestTheSameCardioWordingNeverComesTwiceInARow(t *testing.T) {
	for previous := range english.cardio {
		remembered := len(english.personal) + previous
		for choice := range len(english.cardio) - 1 {
			if _, _, got, _ := composeReminder(runningFact, "en", remembered, always(choice)); got == remembered {
				t.Fatalf("picked cardio wording %d again", previous)
			}
		}
	}
}

func TestTheExerciseNameIsLowercasedMidSentence(t *testing.T) {
	_, body, _, _ := composeReminder(benchFact, "en", -1, always(0))

	if body != "25 kg on bench press? Cute. Today it's 30 kg, no negotiations." {
		t.Errorf("got %q", body)
	}
}

func TestARussianDeviceIsRoastedInRussian(t *testing.T) {
	title, body, _, _ := composeReminder(russianBenchFact, "ru", -1, always(2))

	if title != russian.titles[2] {
		t.Errorf("got the title %q", title)
	}
	if body != "В прошлый раз: жим лёжа, 25 кг. Неплохая разминка. Сегодня — 30 кг." {
		t.Errorf("got %q", body)
	}
}

func TestAnUnknownOrMissingLanguageFallsBackToEnglish(t *testing.T) {
	for _, language := range []string{"", "de"} {
		_, body, _, _ := composeReminder(nil, language, -1, always(0))
		if body != english.generic[0] {
			t.Errorf("language %q got %q", language, body)
		}
	}
	if supportedLanguage("de") != "" || supportedLanguage("ru") != "ru" {
		t.Error("only languages with wordings are kept")
	}
}

func TestTheSameWordingNeverComesTwiceInARow(t *testing.T) {
	for previous := range english.personal {
		for choice := range len(english.personal) - 1 {
			if got := pickExcluding(always(choice), len(english.personal), previous); got == previous {
				t.Fatalf("picked wording %d again", previous)
			}
		}
	}
}

func TestWithoutAWorkoutToQuoteTheReminderIsGeneric(t *testing.T) {
	_, body, _, err := composeReminder(nil, "ru", -1, always(0))

	if err != nil || body != russian.generic[0] {
		t.Errorf("got %q (%v)", body, err)
	}
}

func TestHypeFactsAreLimitedInNumberAndLength(t *testing.T) {
	if validateHype(benchFact) != nil {
		t.Error("a normal fact was rejected")
	}
	if validateHype(make([]HypeFact, maxHypeFacts+1)) == nil {
		t.Error("too many facts were accepted")
	}
	long := []HypeFact{{Exercise: strings.Repeat("x", maxHypeFieldLen+1), Last: "1", Target: "2"}}
	if validateHype(long) == nil {
		t.Error("an overlong field was accepted")
	}
	if validateHype([]HypeFact{{Exercise: "Squat", Last: "", Target: "2"}}) == nil {
		t.Error("an empty field was accepted")
	}
}
