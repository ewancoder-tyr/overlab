import { LocalText } from '@shared/domain/language';
import { BUILT_IN_FORM } from './built-in-form';
import { BUILT_IN_RUSSIAN, COMPOUND_WARM_UP_RUSSIAN } from './built-in-russian';
import { CardioKind, Exercise, ExerciseId, LoadType } from './exercise';
import { MuscleGroupId } from './muscle-group';

/** Compact notation for the table below: `[muscle group, ratio]`. */
type InvolvementTuple = readonly [MuscleGroupId, number];

interface ExerciseOptions {
    readonly loadType?: LoadType;
    readonly perSide?: boolean;
    readonly warmUp?: LocalText;
    readonly cardioKind?: CardioKind;
}

function exercise(
    id: string,
    name: string,
    involvements: readonly InvolvementTuple[],
    options: ExerciseOptions = {},
): Exercise {
    const english = BUILT_IN_FORM[id];
    const russian = BUILT_IN_RUSSIAN[id];
    // A test checks that both tables cover every exercise; the fallbacks only keep a missing
    // entry from breaking the app.
    const form = english === undefined ? undefined : { en: english, ru: russian?.form ?? english };
    return {
        id: id as ExerciseId,
        name: { en: name, ru: russian?.name ?? name },
        loadType: options.loadType ?? 'external',
        perSide: options.perSide ?? false,
        involvements: involvements
            .map(([muscleGroupId, ratio]) => ({ muscleGroupId, ratio }))
            .sort((a, b) => b.ratio - a.ratio),
        // Spread conditionally: with `exactOptionalPropertyTypes` an optional property must be
        // absent rather than explicitly `undefined`.
        ...(form === undefined ? {} : { form }),
        ...(options.warmUp === undefined ? {} : { warmUp: options.warmUp }),
        ...(options.cardioKind === undefined ? {} : { cardioKind: options.cardioKind }),
    };
}

const COMPOUND_WARM_UP: LocalText = {
    en: 'Two or three lighter sets, adding weight each time, stopping well short of fatigue.',
    ru: COMPOUND_WARM_UP_RUSSIAN,
};
const BODYWEIGHT = { loadType: 'bodyweight' } as const;
const PER_SIDE = { perSide: true } as const;

/**
 * Exercises shipped with the app.
 *
 * Involvement ratios follow the "fractional" way of counting sets, which predicted muscle growth
 * best in the largest dose-response meta-regression so far (Pelland et al.): a set counts 1 for
 * the muscles the exercise trains directly and 0.5 for muscles that work hard but are not the
 * limiting factor. Values between and below those are judgement calls for stabilisers and grip.
 *
 * Where a ratio departs from what muscle activation alone would suggest, a comment names the
 * measured-growth study behind it. Growth measurements (MRI, ultrasound) outrank EMG.
 *
 * Ids are stored in events forever: never rename or reuse one. Ratios and names may be tuned
 * freely, because volume is always recalculated from the event log.
 */
export const BUILT_IN_EXERCISES: readonly Exercise[] = [
    // --- Chest ---
    exercise(
        'bench-press',
        'Bench press',
        [
            ['chest', 1],
            ['triceps', 0.5],
            ['front-delts', 0.5],
        ],
        { warmUp: COMPOUND_WARM_UP },
    ),
    exercise(
        'incline-bench-press',
        'Incline bench press',
        [
            ['chest', 1],
            ['front-delts', 0.6],
            ['triceps', 0.5],
        ],
        { warmUp: COMPOUND_WARM_UP },
    ),
    exercise(
        'dumbbell-bench-press',
        'Dumbbell bench press',
        [
            ['chest', 1],
            ['triceps', 0.4],
            ['front-delts', 0.5],
        ],
        { ...PER_SIDE, warmUp: COMPOUND_WARM_UP },
    ),
    exercise('dumbbell-fly', 'Dumbbell fly', [['chest', 1]], PER_SIDE),
    exercise('cable-fly', 'Cable fly', [['chest', 1]], PER_SIDE),
    // The two angled flies are separate exercises, not setups of the cable fly: they are done
    // in the same workout and each needs its own history.
    exercise(
        'low-to-high-cable-fly',
        'Low-to-high cable fly',
        [
            ['chest', 1],
            // The upward sweep is also shoulder flexion, which the front delts assist.
            ['front-delts', 0.4],
        ],
        PER_SIDE,
    ),
    exercise('high-to-low-cable-fly', 'High-to-low cable fly', [['chest', 1]], PER_SIDE),
    exercise('pec-deck', 'Pec deck', [['chest', 1]]),
    exercise(
        'dip',
        'Dip',
        [
            ['chest', 0.8],
            ['triceps', 0.8],
            ['front-delts', 0.4],
        ],
        BODYWEIGHT,
    ),
    // The same press as the bench press, with the floor instead of the bench, so the same
    // involvements. The added load is signed like any bodyweight exercise: a plate on the back
    // is above 0, push-ups from the knees can be logged below it.
    exercise(
        'push-up',
        'Push-up',
        [
            ['chest', 1],
            ['triceps', 0.5],
            ['front-delts', 0.5],
        ],
        BODYWEIGHT,
    ),

    // --- Shoulders ---
    exercise(
        'overhead-press',
        'Overhead press',
        [
            ['front-delts', 1],
            ['triceps', 0.5],
            // Side-delt activation in the press is close to that of a lateral raise
            // (Campos et al. 2020, EMG), so it counts as a full indirect set.
            ['side-delts', 0.5],
        ],
        { warmUp: COMPOUND_WARM_UP },
    ),
    exercise(
        'dumbbell-shoulder-press',
        'Seated dumbbell shoulder press',
        [
            ['front-delts', 1],
            ['triceps', 0.5],
            ['side-delts', 0.5],
        ],
        { ...PER_SIDE, warmUp: COMPOUND_WARM_UP },
    ),
    exercise('lateral-raise', 'Lateral raise', [['side-delts', 1]], PER_SIDE),
    exercise('face-pull', 'Face pull', [
        ['rear-delts', 1],
        ['back', 0.4],
    ]),
    exercise('reverse-fly', 'Reverse fly', [['rear-delts', 1]], PER_SIDE),
    exercise(
        'cable-rear-delt-fly',
        'Cable rear delt fly',
        [
            ['rear-delts', 1],
            ['back', 0.3],
        ],
        PER_SIDE,
    ),
    exercise('machine-rear-delt-fly', 'Machine rear delt fly', [
        ['rear-delts', 1],
        ['back', 0.3],
    ]),

    // --- Back ---
    exercise(
        'pull-up',
        'Pull-up',
        [
            ['back', 1],
            ['biceps', 0.5],
            ['forearms', 0.3],
        ],
        BODYWEIGHT,
    ),
    exercise('lat-pulldown', 'Lat pulldown', [
        ['back', 1],
        ['biceps', 0.5],
        ['forearms', 0.2],
    ]),
    // The lats move the straight arm on their own here: no elbow bend, so no biceps.
    exercise('lat-prayer', 'Lat prayer', [
        ['back', 1],
        ['triceps', 0.2],
    ]),
    exercise(
        'barbell-row',
        'Barbell row',
        [
            ['back', 1],
            ['biceps', 0.5],
            ['rear-delts', 0.4],
            ['lower-back', 0.3],
        ],
        { warmUp: COMPOUND_WARM_UP },
    ),
    exercise('seated-cable-row', 'Seated cable row', [
        ['back', 1],
        ['biceps', 0.5],
        ['rear-delts', 0.4],
    ]),
    exercise(
        'single-arm-dumbbell-row',
        'Single-arm dumbbell row',
        [
            ['back', 1],
            ['biceps', 0.5],
            ['rear-delts', 0.4],
        ],
        PER_SIDE,
    ),
    exercise(
        'deadlift',
        'Deadlift',
        [
            // Glutes and spinal erectors do the lifting. The hamstrings work less than in a
            // Romanian deadlift because the knees bend, and the lats and traps only hold the bar
            // in place without changing length, so the back counts as an indirect set.
            ['glutes', 1],
            ['lower-back', 1],
            ['hamstrings', 0.6],
            ['back', 0.5],
            ['forearms', 0.5],
            ['quads', 0.4],
        ],
        { warmUp: COMPOUND_WARM_UP },
    ),

    // --- Arms ---
    exercise(
        'bicep-curl',
        'Bicep curl',
        [
            ['biceps', 1],
            ['forearms', 0.3],
        ],
        PER_SIDE,
    ),
    exercise(
        'hammer-curl',
        'Hammer curl',
        [
            ['biceps', 0.8],
            ['forearms', 0.7],
        ],
        PER_SIDE,
    ),
    exercise(
        'incline-dumbbell-curl',
        'Incline dumbbell curl',
        [
            ['biceps', 1],
            ['forearms', 0.3],
        ],
        PER_SIDE,
    ),
    exercise(
        'cross-body-hammer-curl',
        'Cross-body hammer curl',
        [
            ['biceps', 0.8],
            ['forearms', 0.7],
        ],
        PER_SIDE,
    ),
    // One arm at a time, so the load is per side like every other dumbbell curl.
    exercise(
        'preacher-curl',
        'Single-arm preacher curl',
        [
            ['biceps', 1],
            ['forearms', 0.3],
        ],
        PER_SIDE,
    ),
    exercise('cable-curl', 'Cable curl', [
        ['biceps', 1],
        ['forearms', 0.3],
    ]),
    exercise('wrist-curl', 'Wrist curl', [['forearms', 1]], PER_SIDE),
    exercise('tricep-pushdown', 'Tricep pushdown', [['triceps', 1]]),
    exercise('overhead-tricep-extension', 'Overhead tricep extension', [['triceps', 1]]),
    exercise(
        'cross-body-tricep-extension',
        'Cross-body cable tricep extension',
        [['triceps', 1]],
        PER_SIDE,
    ),
    exercise('katana-tricep-extension', 'Katana tricep extension', [['triceps', 1]], PER_SIDE),
    // A timed hold. There is no "seconds" in the domain, so the seconds held are logged as the
    // reps of the set: 45 seconds is 45 reps. Progression then works unchanged (hold longer),
    // at the price of the screens saying "reps".
    exercise('dead-hang', 'Dead hang', [['forearms', 1]], BODYWEIGHT),

    // --- Legs ---
    exercise(
        'squat',
        'Squat',
        [
            // Deep squats grow the glutes about as much as hip thrusts do (Plotkin et al. 2023)
            // and by more than they grow the quads (Kubo et al. 2019), both measured with MRI.
            ['quads', 1],
            ['glutes', 1],
            ['lower-back', 0.3],
            // No hamstrings: neither study found them growing from squats. They cross both the
            // hip and the knee, so they barely change length as the two joints bend together.
        ],
        { warmUp: COMPOUND_WARM_UP },
    ),
    exercise(
        'smith-machine-squat',
        'Smith machine squat',
        [
            ['quads', 1],
            ['glutes', 1],
        ],
        // Logged as the plates on one end of the bar. The bar's own weight differs from
        // machine to machine and is often counterbalanced, so the plates are the honest number.
        { ...PER_SIDE, warmUp: COMPOUND_WARM_UP },
    ),
    exercise(
        'bulgarian-split-squat',
        'Bulgarian split squat',
        [
            ['quads', 1],
            ['glutes', 1],
        ],
        PER_SIDE,
    ),
    exercise(
        'leg-press',
        'Leg press',
        [
            ['quads', 1],
            ['glutes', 0.5],
        ],
        { warmUp: COMPOUND_WARM_UP },
    ),
    exercise('leg-extension', 'Leg extension', [['quads', 1]]),
    exercise(
        'romanian-deadlift',
        'Romanian deadlift',
        [
            ['hamstrings', 1],
            ['glutes', 0.7],
            ['lower-back', 0.5],
            ['forearms', 0.3],
        ],
        { warmUp: COMPOUND_WARM_UP },
    ),
    exercise('leg-curl', 'Leg curl', [['hamstrings', 1]]),
    exercise('hip-thrust', 'Hip thrust', [
        ['glutes', 1],
        // Hamstrings showed little to no growth from hip thrusts (Plotkin et al. 2023).
        ['hamstrings', 0.2],
    ]),
    exercise('calf-raise', 'Calf raise', [['calves', 1]]),

    // --- Core ---
    exercise('cable-crunch', 'Cable crunch', [
        ['abs', 1],
        ['obliques', 0.3],
    ]),
    exercise('cable-woodchop', 'Cable woodchop', [
        ['obliques', 1],
        ['abs', 0.5],
    ]),
    exercise(
        'hanging-leg-raise',
        'Hanging leg raise',
        [
            ['abs', 1],
            ['obliques', 0.4],
            ['forearms', 0.3],
        ],
        BODYWEIGHT,
    ),
    // The two standing knee raises train the waist with nothing but the body, so they suit solo
    // sets at home. No hip flexor muscle group exists here, so the muscle lifting the knee is
    // not counted; what is counted is the torso bending (side) or twisting (cross) to meet it.
    exercise(
        'side-knee-raise',
        'Side knee raise',
        [
            ['obliques', 1],
            ['abs', 0.3],
        ],
        BODYWEIGHT,
    ),
    exercise(
        'cross-knee-raise',
        'Cross knee raise',
        [
            ['obliques', 1],
            // Each rep is also a small crunch: the ribs come down to meet the knee.
            ['abs', 0.5],
        ],
        BODYWEIGHT,
    ),
    exercise(
        'back-extension',
        'Back extension',
        [
            ['lower-back', 1],
            ['glutes', 0.5],
            ['hamstrings', 0.4],
        ],
        BODYWEIGHT,
    ),

    // --- Cardio ---
    // No involvements: cardio is not hypertrophy work, so it must never count towards a muscle
    // group's weekly volume. Having none is also what makes an exercise cardio (`isCardio`),
    // which is logged as distance, time and calories instead of sets. The load type is unused.
    exercise('running', 'Running', [], BODYWEIGHT),
    exercise('walking', 'Walking', [], BODYWEIGHT),
    exercise('cycling', 'Cycling', [], BODYWEIGHT),
    exercise('elliptical', 'Elliptical', [], BODYWEIGHT),
    exercise('rowing-machine', 'Rowing machine', [], BODYWEIGHT),
    exercise('stair-climber', 'Stair climber', [], BODYWEIGHT),
    exercise('jump-rope', 'Jump rope', [], BODYWEIGHT),
    exercise('swimming', 'Swimming', [], BODYWEIGHT),
    // A treadmill is logged in segments, each with its incline (see "Treadmill rule" in
    // docs/rules/cardio.md). Running and walking above stay for the road and the park.
    exercise('treadmill', 'Treadmill', [], { ...BODYWEIGHT, cardioKind: 'treadmill' }),
    // Not exercise at all, but part of many gym visits. Only its time is recorded, and it stays
    // out of the weekly cardio goal (see "Timed exercise rule").
    exercise('sauna', 'Sauna', [], { ...BODYWEIGHT, cardioKind: 'timed' }),
];
