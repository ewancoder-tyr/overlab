package main

import (
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

// A HypeFact is the user's latest number on an exercise planned next and the number to go for
// today, already worded by the app: {"Bench press", "25 kg", "30 kg"} or
// {"Pull-up", "10 reps", "11 reps"}, or for cardio {"Running", "5 km in 30:00", "5 km in 30:00"}:
// cardio aims to match last time, so its target is the same words. The app decides what to aim
// for, and words the numbers in the user's language; this service only wraps them in a sentence.
type HypeFact struct {
	Exercise string `json:"exercise"`
	Last     string `json:"last"`
	Target   string `json:"target"`
	// Cardio picks the cardio wordings: "warm-up weight" makes no sense for a run. Absent (false)
	// in registrations from app versions older than the flag, which then get lifting wordings.
	Cardio bool `json:"cardio,omitempty"`
}

const (
	maxHypeFacts    = 20
	maxHypeFieldLen = 60
)

func validateHype(facts []HypeFact) error {
	if len(facts) > maxHypeFacts {
		return fmt.Errorf("hype: at most %d facts", maxHypeFacts)
	}
	for _, fact := range facts {
		for _, field := range []string{fact.Exercise, fact.Last, fact.Target} {
			if strings.TrimSpace(field) == "" || utf8.RuneCountInString(field) > maxHypeFieldLen {
				return fmt.Errorf("hype: every field needs 1 to %d characters", maxHypeFieldLen)
			}
		}
	}
	return nil
}

// A wordingSet is everything a reminder can say, in one language.
type wordingSet struct {
	// titles are picked independently of the body.
	titles []string
	// personal roasts the user with a fact about an exercise planned next. Placeholders:
	// {exercise} (as written mid-sentence: "bench press"), {Exercise} (capitalised, to start a
	// sentence), {last} ("25 kg", "10 reps") and {target} ("30 kg", "11 reps").
	personal []string
	// cardio roasts a cardio fact. Its goal is to MATCH last time, not to beat it (see "Cardio
	// match rule" in docs/rules/cardio.md), so these wordings quote only {last}, the session to
	// match: a distance with its time ("5 km in 30:00"), calories with a time, a time or a distance
	// alone. {target} is not used (the app sends the same words in it). {exercise} may be a run, a
	// ride, a row or a stair climber, so no wording assumes which one.
	cardio []string
	// generic is for a device that has no workout to quote yet.
	generic []string
}

// english is also what a device gets when it registered no language or one this server does
// not speak.
var english = wordingSet{
	titles: []string{
		"Gym day",
		"Lab time",
		"Overload o'clock",
		"The iron is calling",
		"No-excuses o'clock",
		"Experiment #1: you",
	},
	personal: []string{
		"{last} on {exercise}? Cute. Today it's {target}, no negotiations.",
		"Your {exercise} called. It's bored of {last}. Bring {target}.",
		"Last time: {last} on {exercise}. A decent warm-up. Today: {target}.",
		"The gym still remembers your {last} on {exercise}. It was not impressed. {target} today.",
		"{Exercise}, {last}. That was last time's you. Today's you does {target}. Allegedly.",
		"Somewhere a teenager is doing {last} on {exercise} as a warm-up. Go do {target}.",
		"Your muscles filed a complaint: {last} on {exercise} was too easy. Settle it with {target}.",
		"Sofa 1, you 0. Even the score with {target} on {exercise}. You managed {last} last time.",
		"{last} on {exercise} is not a personality. {target} might be.",
		"Breaking news: local hero still stuck at {last} on {exercise}. Change the headline to {target}.",
		"Gravity thinks it won at {last} on {exercise}. Correct it with {target}.",
		"Official notice: {last} on {exercise} is now your warm-up. Real work starts at {target}.",
		"You versus last time's you. They did {last} on {exercise}. Embarrass them with {target}.",
		"That {last} on {exercise} won't beat itself. {target}. Shoes on.",
		"The gym is open and your excuses are closed. {Exercise}: {last} then, {target} now.",
		"Progressive overload, not progressive overthinking. {Exercise}: {target}. Last time was {last}.",
		"Your {exercise} sits at {last} like it pays rent there. Evict it with {target}.",
		"Science says {last} on {exercise} followed by {target} builds muscle. Scrolling doesn't.",
		"Plot twist: you can do {target} on {exercise}. You only did {last} to be polite.",
		"{target} on {exercise}. That's the whole reminder. Yes, we all saw the {last}.",
		// The harsh half: personal insults, aimed at the user's ego rather than the numbers.
		"{last} on {exercise}. My grandmother called, she wants her warm-up weight back. {target}. Today.",
		"You did {last} on {exercise} and then had the nerve to call it a workout. Redeem yourself: {target}.",
		"Weak. That's the word for {last} on {exercise}. Prove it wrong with {target}, or don't, and stay weak.",
		"Every day you skip, someone weaker than you passes {last} on {exercise}. Get to {target} before they do.",
		"Your {exercise} at {last} is the reason the mirror looks disappointed. {target}. Go fix your face's opinion.",
		"Imagine being proud of {last} on {exercise}. Couldn't be you. Oh wait. {target}, now.",
		"{last} on {exercise}? Your excuses are stronger than you are. Make {target} the strongest thing today.",
		"The couch has your shape memorised. The barbell doesn't. {Exercise}: {last} was soft, {target} isn't.",
		"Fun fact: nobody has ever been impressed by {last} on {exercise}. Not even you. Try {target}.",
		"You're not tired, you're lazy. {Exercise}: you did {last}, you owe {target}. Pay up.",
		"{Exercise} at {last}. Spaghetti has more structural integrity. Harden up: {target}.",
		"If quitting was a lift you'd be elite. Sadly it's {exercise}, you're at {last}, and you need {target}.",
		"Your PR on {exercise} is {last}. Your PR on making excuses is undefeated. Break the right one: {target}.",
		"Hey, you. Yes, you. The one who stalled at {last} on {exercise}. {target}. Stop hiding.",
		"{last} on {exercise} is what people lift when they're filming for sympathy. Do {target} for respect.",
		"You had one job: beat {last} on {exercise}. Still unemployed. The position pays {target}.",
		"Pathetic is a strong word. So is {target} on {exercise}. Only one of them should describe your {last}.",
		"Your muscles are shrinking while you read this. {Exercise}: {last} last time. {target} or they leave you.",
		"Soft hands, soft excuses, soft {last} on {exercise}. Toughen up and hit {target}.",
		"Somewhere, your old {last} on {exercise} is laughing at you. Shut it up with {target}.",
	},
	cardio: []string{
		"Last time: {last} on {exercise}. Today, just match it. Surely that's not too much to ask.",
		"No heroics needed. {Exercise}: {last}, same as before. Think you can manage?",
		"Your {exercise} bar is {last}. Not higher, not lower. Match it.",
		"Today's {exercise} target: {last}. Yes, again. Consistency is the boring superpower.",
		"The {exercise} remembers your {last}. Show it that wasn't a fluke.",
		"Cardio doesn't need a miracle. {Exercise}: {last}, one more time.",
		"Somewhere a pensioner is repeating last week's {exercise}. Your number is {last}. Keep up.",
		"Your heart is a muscle too, and it liked {last} on {exercise}. Give it that again.",
		"Breaking news: local legend attempts to repeat {last} on {exercise}. Make it a true story.",
		"Plot twist: {last} on {exercise} won't kill you. It didn't last time. Do it again.",
		// The harsh half: personal insults, aimed at the user's ego rather than the numbers.
		"{last} on {exercise} once is luck. Twice is fitness. Prove which one you are.",
		"All you have to do is match {last} on {exercise}. If even that is too much, what are you doing?",
		"{Exercise}: {last}. Not a record, just the same again. And you're still thinking of skipping?",
		"Your phone's battery repeats itself every single day. Can you repeat {last} on {exercise}?",
		"Lazy lungs, lazy legs, and they still got {last} on {exercise}. No excuse for less today.",
		"Falling short of your own {last} on {exercise} would be a new low. Don't.",
		"Your excuses go further than your {exercise}. {last}, matched, today. Shoes on.",
		"The sofa is hoping you won't match {last} on {exercise}. Disappoint the sofa.",
		"Soft legs, soft lungs, soft excuses. {Exercise}: {last}. Match it or admit you went backwards.",
		"Every skipped session makes {last} on {exercise} harder to match. Go now, while you still can.",
	},
	generic: []string{
		"The weights won't lift themselves. Frankly, neither will you unless you go.",
		"Your muscles are on the sofa waiting for instructions. Go and give some.",
		"Forecast: 100% chance of you lifting something heavier than your phone.",
		"The gym misses you. The sofa doesn't deserve you.",
		"Nothing logged yet. The lab needs data and you're the experiment.",
		"Skipping is also a rep. A rep of regret. Go train.",
		"Future you is asking where the gains are. Awkward. Go.",
		"Motivation is a myth. Go anyway.",
		"Your excuses have better form than you ever will. Prove me wrong. Go.",
		"Nobody is coming to make you strong. Least of all the sofa. Move.",
		"Weak today, weaker tomorrow. That's the plan if you stay home.",
		"You said you'd start. That was a while ago. Liar. Go.",
		"Your phone has done more reps today than you have. Embarrassing.",
		"Soft is a choice. Stop choosing it. Gym.",
	},
}

// russian follows the English lists in spirit, not word for word. Russian makes two things
// hard that English does not, and every wording is built around them:
//
//   - {last} and {target} arrive as finished phrases in the nominative ("25 кг", "10 повторов",
//     "5,5 км"), so they only stand where that case fits: after a colon or a dash, as a subject,
//     or as the object of "сделай". A preposition that needs another case would break them.
//   - Past-tense verbs and adjectives agree with gender, and the server knows nobody's. So no
//     wording says "you did" ("ты сделал"); they talk about the numbers, the sofa and the gym,
//     and they never make a verb agree with the exercise, whose gender varies too.
//
// The exercise name goes after a colon or inside «quotes», where it can stay in the nominative.
var russian = wordingSet{
	titles: []string{
		"День тренировки",
		"Время лаборатории",
		"Час перегрузки",
		"Железо зовёт",
		"Время без отговорок",
		"Эксперимент №1: ты",
	},
	personal: []string{
		"{Exercise}: {last}? Мило. Сегодня {target}, без разговоров.",
		"{Exercise}: {last} надоели даже железу. Неси {target}.",
		"В прошлый раз: {exercise}, {last}. Неплохая разминка. Сегодня — {target}.",
		"Зал до сих пор помнит твои {last} в «{exercise}». Зал не впечатлён. Сегодня {target}.",
		"{Exercise}: {last} — это прошлая версия тебя. Новая делает {target}. Говорят.",
		"Где-то школьник делает {last} в «{exercise}» на разминке. Иди и сделай {target}.",
		"Мышцы подали жалобу: {exercise}, {last} — слишком легко. Уладь вопрос: {target}.",
		"Диван 1, ты 0. Сравняй счёт: {exercise}, {target}. В прошлый раз было {last}.",
		"{last} в «{exercise}» — это не характер. А вот {target} — может быть.",
		"Срочные новости: {exercise} всё ещё на отметке {last}. Поменяй заголовок на {target}.",
		"Гравитация думает, что победила: {exercise}, {last}. Поправь её: {target}.",
		"Официально: {last} в «{exercise}» теперь твоя разминка. Настоящая работа — {target}.",
		"Реванш с прошлым разом: {exercise}, было {last}. Сегодня победа — это {target}.",
		"Эти {last} в «{exercise}» сами себя не побьют. {target}. Обувайся.",
		"Зал открыт, отговорки закрыты. {Exercise}: тогда {last}, сейчас {target}.",
		"Прогрессия нагрузок, а не прогрессия раздумий. {Exercise}: {target}. В прошлый раз было {last}.",
		"На отметке {last} в «{exercise}» пора уже платить аренду. Съезжай: {target}.",
		"Наука говорит: {last}, а потом {target} в «{exercise}» строят мышцы. Листание ленты — нет.",
		"Поворот сюжета: ты можешь {target} в «{exercise}». {last} было из вежливости.",
		"{Exercise}: {target}. Это всё напоминание. Да, все видели те {last}.",
		// The harsh half: personal insults, aimed at the user's ego rather than the numbers.
		"{Exercise}: {last}. Бабушка звонила, просит вернуть её разминочный вес. {target}. Сегодня.",
		"Сделать {last} в «{exercise}» и назвать это тренировкой — смело. Искупи вину: {target}.",
		"Слабо. Именно так выглядят {last} в «{exercise}». Докажи обратное: {target}. Или не доказывай, и всё останется слабо.",
		"Каждый пропущенный день кто-то слабее тебя обходит твои {last} в «{exercise}». Дойди до {target} раньше него.",
		"{Exercise} на {last} — вот почему зеркало смотрит с разочарованием. {target}. Исправь его мнение.",
		"Кто-то гордится результатом «{exercise}: {last}». Не ты же? Ой. {target}, сейчас же.",
		"{Exercise}: {last}? Твои отговорки сильнее тебя. Пусть сегодня самым сильным будет {target}.",
		"Диван запомнил твою форму. Штанга — нет. {Exercise}: {last} — мягко, {target} — нет.",
		"Факт: {last} в «{exercise}» ещё никого не впечатлили. Даже тебя. Попробуй {target}.",
		"Это не усталость, это лень. {Exercise}: было {last}, с тебя {target}. Плати.",
		"{Exercise} на {last}. У варёных макарон больше жёсткости. Соберись: {target}.",
		"Если бы сдаваться было упражнением, тут был бы мировой рекорд. Но это {exercise}, у тебя {last}, а нужно {target}.",
		"Твой рекорд в «{exercise}» — {last}. Твой рекорд в отговорках непобедим. Побей правильный: {target}.",
		"Эй, ты. Да, ты. {Exercise}, {last} и полный застой. {target}. Хватит прятаться.",
		"{Exercise}: {last} — это для видео ради жалости. Ради уважения — {target}.",
		"Одна задача: побить {last} в «{exercise}». Вакансия всё ещё открыта. Зарплата — {target}.",
		"Жалко — сильное слово. {target} в «{exercise}» — тоже. Только одно из них должно описывать твои {last}.",
		"Пока ты это читаешь, мышцы уменьшаются. {Exercise}: в прошлый раз {last}. {target}, или они от тебя уйдут.",
		"Мягкие руки, мягкие отговорки, мягкие {last} в «{exercise}». Стань жёстче: {target}.",
		"Где-то твои старые {last} в «{exercise}» смеются над тобой. Заткни их: {target}.",
	},
	cardio: []string{
		"{Exercise}: в прошлый раз {last}. Сегодня просто повтори. Это ведь не слишком много?",
		"Без геройства. {Exercise}: {last}, как в прошлый раз. Справишься?",
		"Планка на сегодня — {last} («{exercise}»). Не выше, не ниже. Повтори.",
		"Цель на сегодня («{exercise}»): {last}. Да, снова. Постоянство — скучная суперсила.",
		"«{Exercise}» помнит прошлый раз: {last}. Докажи, что это не случайность.",
		"Кардио не нужно чудо. {Exercise}: {last}, ещё раз.",
		"Где-то пенсионер повторяет свою прошлую тренировку. Твоя планка: {last} («{exercise}»). Не отставай.",
		"Сердце — тоже мышца, и ему понравилось: {exercise}, {last}. Дай ему это снова.",
		"Срочные новости: местная легенда пытается повторить результат. {Exercise}: {last}. Сделай это правдой.",
		"Поворот сюжета: {exercise}, {last} — это не смертельно. В прошлый раз не убило. Повтори.",
		// The harsh half: personal insults, aimed at the user's ego rather than the numbers.
		"{Exercise}: {last} один раз — это удача. Два раза — форма. Покажи, что из этого про тебя.",
		"Задача — всего лишь повторить прошлое. {Exercise}: {last}. Если и это не по силам, зачем всё это?",
		"{Exercise}: {last}. Не рекорд, просто то же самое. И всё равно хочется пропустить?",
		"Батарейка телефона каждый день выдаёт одно и то же. А у тебя получится? {Exercise}: {last}.",
		"Ленивые лёгкие, ленивые ноги — и всё равно было {last} («{exercise}»). Меньше сегодня — без оправданий.",
		"Не дотянуть до собственных прошлых цифр — новое дно. {Exercise}: {last}. Не падай ниже.",
		"Отговорки уходят дальше, чем «{exercise}». Сегодня {last}, не меньше. Обувайся.",
		"Диван надеется, что {last} («{exercise}») сегодня не повторится. Разочаруй диван.",
		"Мягкие ноги, мягкие лёгкие, мягкие отговорки. {Exercise}: {last}. Повтори — или признай, что откатываешься назад.",
		"С каждой пропущенной тренировкой планка уходит всё дальше. {Exercise}: {last}. Иди сейчас, пока можешь.",
	},
	generic: []string{
		"Гантели сами себя не поднимут. Честно говоря, ты тоже, если не пойдёшь.",
		"Мышцы лежат на диване и ждут указаний. Иди и дай им их.",
		"Прогноз: 100% вероятность, что ты поднимешь что-то тяжелее телефона.",
		"Зал по тебе скучает. Диван тебя не заслуживает.",
		"Пока ничего не записано. Лаборатории нужны данные, а эксперимент — это ты.",
		"Пропуск — это тоже повтор. Повтор сожаления. Иди тренируйся.",
		"Ты из будущего интересуется, где результаты. Неловко. Иди.",
		"Мотивация — миф. Иди всё равно.",
		"У твоих отговорок техника лучше, чем у тебя. Докажи, что это не так. Иди.",
		"Никто не придёт и не накачается за тебя. Диван тем более. Вставай.",
		"Слабее сегодня, ещё слабее завтра. Таков план, если остаться дома.",
		"Было сказано «начну». Это было давно. Врунишка. Иди.",
		"Телефон сегодня сделал больше повторов, чем ты. Позор.",
		"Мягкость — это выбор. Хватит его делать. В зал.",
	},
}

// wordingSets holds every language the server speaks, by the code the app registers with.
var wordingSets = map[string]wordingSet{"en": english, "ru": russian}

// supportedLanguage returns `language` if the server speaks it, and "" (meaning English)
// otherwise.
func supportedLanguage(language string) string {
	if _, known := wordingSets[language]; known {
		return language
	}
	return ""
}

// wordingsFor returns the wordings of `language`, or English for any language it does not know.
func wordingsFor(language string) wordingSet {
	if set, known := wordingSets[language]; known {
		return set
	}
	return english
}

// lowerFirst turns "Bench press" into "bench press" for use in the middle of a sentence.
func lowerFirst(text string) string {
	first, size := utf8.DecodeRuneInString(text)
	return string(unicode.ToLower(first)) + text[size:]
}

// A picker returns a random number from 0 up to, not including, n. It is a parameter so that
// tests can make "random" choices predictable.
type picker func(n int) int

// pickExcluding picks an index below n that differs from `previous`, so that the same wording
// never comes twice in a row. `previous` may be out of range (nothing sent yet).
func pickExcluding(pick picker, n, previous int) int {
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

var errNoWording = errors.New("no wording available")

// composeReminder builds one notification for a device, in its language: a random title, a
// random hype fact to roast (when the device has any) and a random wording that suits it and
// differs from the previous one. It returns the wording's index for the caller to remember.
//
// Cardio wordings are numbered after the personal ones (wording 40 is cardio[0]), so one
// remembered index covers both lists and a cardio line never repeats either. After a change of
// language the remembered index points into the other language's lists; at worst the next
// wording is the one at that position, which is harmless.
func composeReminder(facts []HypeFact, language string, previousWording int, pick picker) (title, body string, wording int, err error) {
	set := wordingsFor(language)
	title = set.titles[pick(len(set.titles))]
	if len(facts) == 0 {
		wording = pickExcluding(pick, len(set.generic), previousWording)
		return title, set.generic[wording], wording, nil
	}
	fact := facts[pick(len(facts))]
	wordings, offset := set.personal, 0
	if fact.Cardio {
		wordings, offset = set.cardio, len(set.personal)
	}
	if len(wordings) == 0 {
		return "", "", 0, errNoWording
	}
	index := pickExcluding(pick, len(wordings), previousWording-offset)
	wording = offset + index
	body = strings.NewReplacer(
		"{exercise}", lowerFirst(fact.Exercise),
		"{Exercise}", fact.Exercise,
		"{last}", fact.Last,
		"{target}", fact.Target,
	).Replace(wordings[index])
	return title, body, wording, nil
}
