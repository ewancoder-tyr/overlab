import { Language, Localized, formatNumber } from '@shared/domain/language';
import { CardioMeasures, CardioTotals, cardioTotals } from '@training/domain/cardio';
import { CardioAxis, CardioComparison, speedKmh } from './cardio-progression';
import { CardioRecordKind } from './cardio-records';

/*
 * How cardio numbers are worded. Kept in the domain (not in a component) because the reminder
 * hype needs the same wording, and the domain may not import presentation code.
 *
 * Every function takes the language first: the units differ (km, км) and so does the decimal
 * separator (5.25 km, 5,25 км).
 */

const UNITS: Localized<{ m: string; km: string; kmh: string; kcal: string; perMinute: string }> = {
    en: { m: 'm', km: 'km', kmh: 'km/h', kcal: 'kcal', perMinute: 'kcal/min' },
    ru: { m: 'м', km: 'км', kmh: 'км/ч', kcal: 'ккал', perMinute: 'ккал/мин' },
};

const RECORD_NAMES: Localized<Readonly<Record<CardioRecordKind, string>>> = {
    en: {
        distance: 'Distance record',
        speed: 'Speed record',
        climb: 'Climb record',
        calories: 'Calories record',
        'burn-rate': 'Burn rate record',
        duration: 'Duration record',
    },
    ru: {
        distance: 'Рекорд дистанции',
        speed: 'Рекорд скорости',
        climb: 'Рекорд набора высоты',
        calories: 'Рекорд калорий',
        'burn-rate': 'Рекорд расхода калорий',
        duration: 'Рекорд времени',
    },
};

/** `Distance record`, `Рекорд скорости`. */
export function cardioRecordName(language: Language, kind: CardioRecordKind): string {
    return RECORD_NAMES[language][kind];
}

/**
 * A record with the number it is about: `Distance record: 5.5 km`, `Speed record: 12.5 km/h`.
 * Without the number when the totals lack it (they never should for a record).
 */
export function describeCardioRecord(
    language: Language,
    kind: CardioRecordKind,
    totals: CardioTotals,
): string {
    const { distanceMeters, durationSeconds, calories } = totals;
    const speed = speedKmh(totals);
    const value = {
        distance:
            distanceMeters === undefined ? undefined : formatDistance(language, distanceMeters),
        speed: speed === undefined ? undefined : formatSpeed(language, speed),
        climb:
            totals.climbMeters === undefined
                ? undefined
                : formatClimb(language, totals.climbMeters),
        duration: durationSeconds === undefined ? undefined : formatDuration(durationSeconds),
        calories: calories === undefined ? undefined : formatCalories(language, calories),
        'burn-rate':
            calories === undefined || durationSeconds === undefined || durationSeconds === 0
                ? undefined
                : formatBurnRate(language, calories, durationSeconds),
    }[kind];
    const name = cardioRecordName(language, kind);
    return value === undefined ? name : `${name}: ${value}`;
}

/** `800 m`, `5 km`, `5.25 km`: metres below a kilometre, then kilometres without padding zeros. */
export function formatDistance(language: Language, meters: number): string {
    const units = UNITS[language];
    if (meters < 1000) {
        return `${meters} ${units.m}`;
    }
    // At most two decimals, and no padding zeros: 5000 m is "5 km", 5200 m is "5.2 km".
    return `${formatNumber(language, meters / 1000)} ${units.km}`;
}

/** `31:20`, or `1:05:00` from an hour up. The same in every language. */
export function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
        : `${minutes}:${seconds}`;
}

export function formatSpeed(language: Language, kmh: number): string {
    return `${formatNumber(language, kmh, 1)} ${UNITS[language].kmh}`;
}

/** `120 m`: metres climbed, to the whole metre. */
export function formatClimb(language: Language, meters: number): string {
    return `${Math.round(meters)} ${UNITS[language].m}`;
}

/** `6%`, `2.5%`: an incline as the treadmill shows it. */
export function formatIncline(language: Language, incline: number): string {
    return `${formatNumber(language, incline)}%`;
}

const CLIMB: Localized<(amount: string) => string> = {
    en: (amount) => `${amount} climb`,
    ru: (amount) => `набор ${amount}`,
};

export function formatCalories(language: Language, calories: number): string {
    return `${calories} ${UNITS[language].kcal}`;
}

/** A whole session on one line: `5 km · 30:00 · 10.0 km/h · 412 kcal`, skipping what is unknown. */
export function describeCardio(language: Language, totals: CardioTotals): string {
    const speed = speedKmh(totals);
    return [
        totals.distanceMeters === undefined
            ? undefined
            : formatDistance(language, totals.distanceMeters),
        totals.durationSeconds === undefined ? undefined : formatDuration(totals.durationSeconds),
        speed === undefined ? undefined : formatSpeed(language, speed),
        totals.calories === undefined ? undefined : formatCalories(language, totals.calories),
        // A flat session says nothing about climb: "0 m climb" on every line would be noise.
        totals.climbMeters === undefined || totals.climbMeters === 0
            ? undefined
            : CLIMB[language](formatClimb(language, totals.climbMeters)),
    ]
        .filter((part) => part !== undefined)
        .join(' · ');
}

/**
 * One bout or treadmill segment on one line. Like `describeCardio`, but a segment says its
 * incline (what was set on the machine) rather than the climb worked out from it:
 * `1.2 km · 10:00 · 7.2 km/h · 6%`.
 */
export function describeBout(language: Language, bout: CardioMeasures): string {
    // Without its incline the bout has no climb, so `describeCardio` leaves the climb out.
    const { incline, ...measures } = bout;
    const words = describeCardio(language, cardioTotals([measures]));
    return incline === undefined || incline === 0
        ? words
        : `${words} · ${formatIncline(language, incline)}`;
}

type AxisWords = Readonly<Record<CardioAxis, readonly [up: string, same: string, down: string]>>;

/** How each axis reads when it went up, stayed the same or went down. */
const AXIS_WORDS: Localized<AxisWords> = {
    en: {
        distance: ['farther', 'same distance', 'shorter'],
        speed: ['faster', 'same speed', 'slower'],
        climb: ['more climb', 'same climb', 'less climb'],
        duration: ['longer', 'same time', 'shorter'],
        calories: ['more calories', 'same calories', 'fewer calories'],
        'burn-rate': ['higher burn rate', 'same burn rate', 'lower burn rate'],
    },
    ru: {
        distance: ['дальше', 'та же дистанция', 'ближе'],
        speed: ['быстрее', 'та же скорость', 'медленнее'],
        climb: ['набор больше', 'тот же набор', 'набор меньше'],
        duration: ['дольше', 'то же время', 'короче'],
        calories: ['больше калорий', 'те же калории', 'меньше калорий'],
        'burn-rate': ['выше расход', 'тот же расход', 'ниже расход'],
    },
};

const BUT: Localized<string> = { en: ' but ', ru: ', но ' };

/**
 * The verdict in words: `farther, same speed` or, for a trade, `farther but slower`. A trade
 * says what held up first and what gave way after the "but": `farther, more climb but slower`.
 */
export function describeComparison(language: Language, comparison: CardioComparison): string {
    const word = ({ axis, direction }: CardioComparison['axes'][number]): string => {
        const [up, same, down] = AXIS_WORDS[language][axis];
        return direction === 'up' ? up : direction === 'same' ? same : down;
    };
    if (comparison.outcome !== 'mixed') {
        return comparison.axes.map(word).join(', ');
    }
    const held = comparison.axes.filter((axis) => axis.direction !== 'down').map(word);
    const lost = comparison.axes.filter((axis) => axis.direction === 'down').map(word);
    return `${held.join(', ')}${BUT[language]}${lost.join(', ')}`;
}

/** `10.0 kcal/min`: calories per minute, the rate a stair climber is judged on. */
export function formatBurnRate(language: Language, calories: number, seconds: number): string {
    return `${formatNumber(language, (calories / seconds) * 60, 1)} ${UNITS[language].perMinute}`;
}

const GOALS: Localized<{
    /** Prefix of every goal: the aim is to match last time (see "Cardio match rule"). */
    match: string;
    atLeast: (amount: string) => string;
    atLeastAt: (amount: string, rate: string) => string;
    /** Added to a goal whose session climbed: the third thing to match on a treadmill. */
    climbing: (amount: string) => string;
}> = {
    en: {
        match: 'Match it:',
        atLeast: (amount) => `at least ${amount}.`,
        atLeastAt: (amount, rate) => `at least ${amount} at ${rate} or faster.`,
        climbing: (amount) => `Climb ${amount} or more.`,
    },
    ru: {
        match: 'Повторите:',
        atLeast: (amount) => `не меньше ${amount}.`,
        atLeastAt: (amount, rate) => `не меньше ${amount}, не медленнее ${rate}.`,
        climbing: (amount) => `Набор не меньше ${amount}.`,
    },
};

/**
 * What it takes to match a session, in one sentence with its numbers:
 * `Match it: at least 5 km at 10.0 km/h or faster.` The measures are those the progression rule
 * would compare on, from what that session recorded. Matching both is enough (see "Cardio match
 * rule" in docs/rules/cardio.md); beating one of them is what the verdict then calls beaten.
 */
export function describeGoal(language: Language, previous: CardioTotals): string {
    const goals = GOALS[language];
    const { distanceMeters, durationSeconds: seconds, calories } = previous;
    const hasTime = seconds !== undefined && seconds > 0;
    const speed = speedKmh(previous);

    let words: string;
    if (distanceMeters !== undefined) {
        const distance = formatDistance(language, distanceMeters);
        words =
            speed === undefined
                ? goals.atLeast(distance)
                : goals.atLeastAt(distance, formatSpeed(language, speed));
    } else if (hasTime && calories !== undefined) {
        words = goals.atLeastAt(
            formatCalories(language, calories),
            formatBurnRate(language, calories, seconds),
        );
    } else if (seconds !== undefined) {
        words = goals.atLeast(formatDuration(seconds));
    } else {
        words = goals.atLeast(formatCalories(language, calories ?? 0));
    }
    const { climbMeters } = previous;
    const climb =
        distanceMeters === undefined || climbMeters === undefined || climbMeters === 0
            ? ''
            : ` ${goals.climbing(formatClimb(language, climbMeters))}`;
    return `${goals.match} ${words}${climb}`;
}

const IN: Localized<string> = { en: 'in', ru: 'за' };

/**
 * The session to match, short enough for a reminder: `5 km in 30:00`, `300 kcal in 20:00`,
 * `30:00`, `5 km`. A time goes with the distance (or the calories) because together they say
 * how fast; on its own it is the amount. `undefined` when the session recorded nothing.
 */
export function describeTarget(language: Language, totals: CardioTotals): string | undefined {
    const { distanceMeters, durationSeconds, calories } = totals;
    const amount =
        distanceMeters !== undefined
            ? formatDistance(language, distanceMeters)
            : calories !== undefined
              ? formatCalories(language, calories)
              : undefined;
    const time = durationSeconds === undefined ? undefined : formatDuration(durationSeconds);
    if (amount !== undefined && time !== undefined) {
        return `${amount} ${IN[language]} ${time}`;
    }
    return amount ?? time;
}
