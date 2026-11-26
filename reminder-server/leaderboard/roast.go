package leaderboard

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// What a buddy is told when someone they follow logs a set: the gym day reminder's roast
// (../wording.go), turned on the one who is NOT training. The rules are the reminder's: the
// phone words the numbers, the wordings live only here, every language has the same number of
// them, and the same one never comes twice in a row on a device.

// A roastFact is what was just done, already worded by the phone in the receiver's language:
// {"Bench press", "80 kg × 8"} or, for cardio, {"Running", "5 km · 30:00 · 10.0 km/h"}.
type roastFact struct {
	Exercise string
	Done     string
	Cardio   bool
	Record   bool
}

// A roastSet is everything a buddy notification can say, in one language. Placeholders:
// {exercise} (as written mid-sentence: "bench press"), {Exercise} (capitalised, to start a
// sentence) and {done} ("80 kg × 8"). The buddy's name is the notification's title, so no
// wording repeats it.
type roastSet struct {
	// anonymous is the title when the buddy's Google account shares no name.
	anonymous string
	// lifting roasts a set.
	lifting []string
	// cardio roasts a bout. {done} is several numbers ("5 km · 30:00 · 10.0 km/h"), so every
	// wording quotes it after a colon or a comma, never as "{done} on {exercise}".
	cardio []string
	// record is for a set or a cardio session that is a personal record.
	record []string
}

var englishRoasts = roastSet{
	anonymous: "Your gym buddy",
	lifting: []string{
		"{done} on {exercise}. And you? Sofa again?",
		"{Exercise}: {done}. Meanwhile you're reading notifications.",
		"Just logged {done} on {exercise}. Your move. Any move.",
		"{done} on {exercise}, while you were doing nothing on anything.",
		"{Exercise}, {done}. That's one more set than you've done today.",
		"Another set in: {done} on {exercise}. The gap between you two just grew.",
		"{done} on {exercise}. Somebody is getting stronger, and it isn't you.",
		"{Exercise}: {done}. Your sofa says hi, by the way.",
		"Breaking news: {done} on {exercise}. In other news, you: nothing.",
		"{done} on {exercise}. Don't worry, scrolling burns calories too. It doesn't.",
		"{Exercise}: {done}. You could be there. You're here instead.",
		"Still training. {done} on {exercise}. Still sitting?",
		"{done} on {exercise}. Reply with a set, not an emoji.",
		"{Exercise}, {done}. Feel that? That's you falling behind.",
		"{done} on {exercise}. The leaderboard is watching you do nothing.",
		"Set done: {done} on {exercise}. Your excuse had better be good.",
		"{Exercise}: {done}. Rest day again, or just a rest life?",
		"{done} on {exercise}. One of you two is at the gym. Guess which.",
		"{Exercise}, {done}. Your muscles saw this and sighed.",
		"{done} on {exercise}. Imagine being outworked by someone you know. Oh wait.",
	},
	cardio: []string{
		"{Exercise}: {done}. And you? Walked to the fridge?",
		"{Exercise}, {done}. Your longest run today was to the sofa.",
		"{Exercise}: {done}. Somebody's heart is working. Yours is idling.",
		"Cardio done. {Exercise}: {done}. Your turn, legs.",
		"{Exercise}: {done}. You'd be out of breath just reading this.",
		"{Exercise}, {done}. Meanwhile your step count is embarrassing.",
		"{Exercise}: {done}. Lungs like that aren't built on the sofa.",
		"{Exercise}: {done}. Still sitting? Thought so.",
		"{Exercise}, {done}. The gap between you two just got longer.",
		"{Exercise}: {done}. Shoes on. Yes, yours.",
	},
	record: []string{
		"New record. {Exercise}: {done}. When was your last one?",
		"Personal best! {Exercise}: {done}. Remember what those feel like?",
		"{Exercise}: {done}. A record. Yours is days without one.",
		"Record alert. {Exercise}: {done}. You're being left behind in real time.",
		"{Exercise}: {done}, a new best. Say congratulations. Then go and beat yours.",
		"{Exercise}: {done}. That's a record. What have you broken lately, besides promises?",
	},
}

// The Russian wordings follow the rule of the reminder's (see `russian` in ../wording.go): no
// gendered forms. Here that covers two people, the buddy and the reader, so nothing is said
// in the past tense about either ("сделал", "сделала") and neither is given an adjective.
var russianRoasts = roastSet{
	anonymous: "Напарник по залу",
	lifting: []string{
		"{Exercise}: {done}. А ты? Опять на диване?",
		"{Exercise}: {done}. А ты тем временем читаешь уведомления.",
		"Новый подход — {exercise}, {done}. Твой ход. Хоть какой-нибудь.",
		"{Exercise}: {done}. А у тебя сегодня — ничего и нигде.",
		"{Exercise}, {done}. Это на один подход больше, чем у тебя сегодня.",
		"Ещё подход: {exercise}, {done}. Разрыв между вами только что вырос.",
		"{Exercise}: {done}. Кто-то становится сильнее. И это не ты.",
		"{Exercise}: {done}. Диван, кстати, передаёт тебе привет.",
		"Срочные новости: {exercise}, {done}. Другие новости: у тебя — ноль.",
		"{Exercise}: {done}. Не переживай, листание ленты тоже сжигает калории. Нет.",
		"{Exercise}: {done}. Тебе бы тоже туда. Но ты здесь.",
		"Тренировка идёт. {Exercise}: {done}. А ты всё сидишь?",
		"{Exercise}: {done}. Отвечай подходом, а не смайликом.",
		"{Exercise}, {done}. Чувствуешь? Это ты отстаёшь.",
		"{Exercise}: {done}. Таблица лидеров смотрит, как ты ничего не делаешь.",
		"Подход записан: {exercise}, {done}. Надеюсь, отговорка у тебя хорошая.",
		"{Exercise}: {done}. У тебя опять день отдыха или уже жизнь отдыха?",
		"{Exercise}: {done}. Один из вас двоих сейчас в зале. Угадай кто.",
		"{Exercise}, {done}. Твои мышцы это увидели и вздохнули.",
		"{Exercise}: {done}. Тебя обходят знакомые люди. Каково?",
	},
	cardio: []string{
		"{Exercise}: {done}. А ты? Прогулка до холодильника?",
		"{Exercise}, {done}. Твой самый длинный забег сегодня — до дивана.",
		"{Exercise}: {done}. Чьё-то сердце работает. Твоё — на холостом ходу.",
		"Кардио готово. {Exercise}: {done}. Твоя очередь, ноги.",
		"{Exercise}: {done}. У тебя одышка уже от чтения этого.",
		"{Exercise}, {done}. А твой счётчик шагов тем временем краснеет.",
		"{Exercise}: {done}. Такие лёгкие на диване не вырастают.",
		"{Exercise}: {done}. Всё сидишь? Так и думали.",
		"{Exercise}, {done}. Разрыв между вами стал ещё длиннее.",
		"{Exercise}: {done}. Обувайся. Да, ты.",
	},
	record: []string{
		"Новый рекорд. {Exercise}: {done}. А когда был твой последний?",
		"Личный рекорд! {Exercise}: {done}. Помнишь, каково это?",
		"{Exercise}: {done}. Это рекорд. Твой рекорд — дни без рекордов.",
		"Рекорд. {Exercise}: {done}. Тебя обгоняют в прямом эфире.",
		"{Exercise}: {done} — новый рекорд. Поздравь. А потом иди и побей свой.",
		"{Exercise}: {done}. Это рекорд. А что в последнее время побито у тебя, кроме обещаний?",
	},
}

// roastSets holds every language the roasts exist in, by the code the app registers with.
var roastSets = map[string]roastSet{"en": englishRoasts, "ru": russianRoasts}

// supportedLanguage returns `language` if there are roasts in it, and "" (meaning English)
// otherwise.
func supportedLanguage(language string) string {
	if _, known := roastSets[language]; known {
		return language
	}
	return ""
}

func roastsFor(language string) roastSet {
	if set, known := roastSets[language]; known {
		return set
	}
	return englishRoasts
}

// buddyTitle is the notification's title: who did it.
func buddyTitle(name, language string) string {
	if strings.TrimSpace(name) == "" {
		return roastsFor(language).anonymous
	}
	return name
}

// lowerFirst turns "Bench press" into "bench press" for use in the middle of a sentence.
func lowerFirst(text string) string {
	first, size := utf8.DecodeRuneInString(text)
	return string(unicode.ToLower(first)) + text[size:]
}

// pickExcluding picks an index below n that differs from `previous`, so that the same wording
// never comes twice in a row. `previous` may be out of range (nothing sent yet). The same
// function as the reminder's, repeated because this package imports nothing of the server's.
func pickExcluding(pick func(n int) int, n, previous int) int {
	if n <= 1 {
		return 0
	}
	if previous < 0 || previous >= n {
		return pick(n)
	}
	// Pick among the other n-1 positions, then step over the excluded one.
	index := pick(n - 1)
	if index >= previous {
		index++
	}
	return index
}

// composeRoast words one fact in `language`, with a wording that differs from the device's
// previous one. It returns the wording's number for the caller to remember.
//
// The three lists are numbered one after another (lifting first, then cardio, then record),
// so one remembered number covers them all, as in the reminder's composeReminder.
func composeRoast(fact roastFact, language string, previousWording int, pick func(n int) int) (body string, wording int) {
	set := roastsFor(language)
	wordings, offset := set.lifting, 0
	switch {
	case fact.Record:
		wordings, offset = set.record, len(set.lifting)+len(set.cardio)
	case fact.Cardio:
		wordings, offset = set.cardio, len(set.lifting)
	}
	index := pickExcluding(pick, len(wordings), previousWording-offset)
	body = strings.NewReplacer(
		"{exercise}", lowerFirst(fact.Exercise),
		"{Exercise}", fact.Exercise,
		"{done}", fact.Done,
	).Replace(wordings[index])
	return body, offset + index
}
