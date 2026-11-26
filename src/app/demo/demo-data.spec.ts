import { activeSets } from '@training/domain/set';
import { activeCardio } from '@training/domain/cardio';
import { favoriteExerciseIds } from '@catalog/domain/favorites';
import { ExerciseId } from '@catalog/domain/exercise';
import {
    cardioSessions,
    exerciseSessions,
    exercisesOf,
    groupIntoWorkouts,
} from '@training/domain/workout';
import { weeklyVolume } from '@analytics/domain/weekly-volume';
import { weeklyCardio } from '@analytics/domain/weekly-cardio';
import { exerciseProgress } from '@analytics/domain/exercise-progress';
import { cardioHistory, matchedOrBeaten } from '@analytics/domain/cardio-progression';
import { muscleStalls } from '@analytics/domain/muscle-stall';
import { DEFAULT_STALL_THRESHOLD, isStalled, stalledForNow } from '@analytics/domain/stall';
import { catalog } from '../../testing/fixtures';
import { generateDemoEvents } from './demo-data';

describe('demo data', () => {
    const now = new Date(2026, 10, 11, 20, 0, 0);
    const events = generateDemoEvents(catalog, now);
    const sets = activeSets(events);
    const cardio = activeCardio(events);
    const workouts = groupIntoWorkouts(sets, cardio);
    const inProgressSince = workouts.at(-1)?.startedAt;

    /** Every lift stalled at the default threshold, as the app judges it today. Cardio never stalls. */
    function stalledExercises(): ReadonlySet<ExerciseId> {
        const ids = new Set(sets.flatMap((set) => set.repGroups.map((group) => group.exerciseId)));
        return new Set(
            [...ids].filter((id) => {
                const entries = exerciseProgress(exerciseSessions(workouts, id), catalog);
                return isStalled(stalledForNow(entries, inProgressSince), DEFAULT_STALL_THRESHOLD);
            }),
        );
    }

    it('covers about two months of workouts, several per week', () => {
        const workouts = groupIntoWorkouts(sets);
        const spanDays = (now.getTime() - Date.parse(workouts[0]?.startedAt ?? '')) / 86_400_000;

        expect(workouts.length).toBeGreaterThan(25);
        expect(spanDays).toBeGreaterThan(55);
    });

    it('opens with a workout in progress today', () => {
        const latest = groupIntoWorkouts(sets).at(-1);

        expect(now.getTime() - Date.parse(latest?.endedAt ?? '')).toBeLessThan(60 * 60 * 1000);
    });

    it('never places a set in the future', () => {
        expect(sets.every((set) => Date.parse(set.occurredAt) <= now.getTime())).toBe(true);
    });

    it('rotates between three distinct workouts, one every second day', () => {
        const workouts = groupIntoWorkouts(sets).slice(0, -1); // Today's is only half done.
        const first = workouts.map((workout) => exercisesOf(workout)[0]);

        expect(new Set(first)).toEqual(new Set(['dumbbell-bench-press', 'deadlift', 'pull-up']));
        // Every workout opens like the one three workouts before it, and unlike the last one.
        expect(first.every((id, index) => index < 3 || id === first[index - 3])).toBe(true);
        expect(first.every((id, index) => index < 1 || id !== first[index - 1])).toBe(true);

        const gapsInDays = workouts
            .slice(1)
            .map((workout, index) =>
                Math.round(
                    (Date.parse(workout.startedAt) - Date.parse(workouts[index]?.startedAt ?? '')) /
                        86_400_000,
                ),
            );
        // Two days apart, or four where a workout was missed.
        expect(gapsInDays.every((gap) => gap % 2 === 0 && gap >= 2)).toBe(true);
    });

    it('stars every exercise it uses, cardio included', () => {
        const favorites = favoriteExerciseIds(events);
        const used = new Set([
            ...sets.flatMap((set) => set.repGroups.map((group) => group.exerciseId)),
            ...cardio.map((bout) => bout.exerciseId),
        ]);

        expect(favorites).toEqual(used);
    });

    it('shows progressive overload: bench press ends heavier than it started', () => {
        const loads = sets
            .filter((set) => set.repGroups[0]?.exerciseId === 'dumbbell-bench-press')
            .map((set) => set.repGroups[0]?.load.value ?? 0);

        expect(loads.at(-1)).toBeGreaterThan(loads[0] ?? Infinity);
    });

    it('fills the weekly volume view', () => {
        const trained = weeklyVolume(sets, catalog, now).filter((volume) => volume.sets > 0);

        expect(trained.length).toBeGreaterThan(10);
    });

    it('has stalled lifts: lateral raise, preacher curl and leg curl, and among lifts nothing else', () => {
        const lifts = [...stalledExercises()];

        expect(new Set(lifts)).toEqual(new Set(['lateral-raise', 'preacher-curl', 'leg-curl']));
    });

    it('a plateau repeats the previous session reps exactly', () => {
        const sessions = exerciseSessions(workouts, 'preacher-curl' as ExerciseId);
        const repsOf = (index: number): readonly number[] =>
            sessions.at(index)?.sets.map((set) => set.repGroups[0]?.reps ?? 0) ?? [];

        expect(repsOf(-1)).toEqual(repsOf(-2));
        expect(repsOf(-1)).toEqual(repsOf(-5));
        expect(exerciseProgress(sessions, catalog).at(-1)?.verdict).toBe('same');
    });

    it('shows each kind of advice: add sets for side delts and hamstrings, only the exercise for biceps', () => {
        const stalls = muscleStalls(weeklyVolume(sets, catalog, now), stalledExercises(), catalog);
        const sideDelts = stalls.find((stall) => stall.volume.muscleGroup.id === 'side-delts');

        expect(sideDelts?.advice).toBe('add-sets');
        expect(sideDelts?.stalled.map((entry) => entry.exerciseId)).toEqual(['lateral-raise']);

        const advice = new Map(stalls.map((stall) => [stall.volume.muscleGroup.id, stall.advice]));
        expect(advice).toEqual(
            new Map([
                ['side-delts', 'add-sets'],
                ['biceps', 'exercise'],
                ['hamstrings', 'add-sets'],
            ]),
        );
    });

    it('has cardio: running and cycling bouts at the end of their workouts', () => {
        expect(new Set(cardio.map((bout) => bout.exerciseId))).toEqual(
            new Set(['running', 'cycling']),
        );
        // Every bout falls inside a workout that also has sets.
        expect(workouts.every((workout) => workout.sets.length > 0)).toBe(true);
    });

    it('ends cycling on rides that match the one before, which is the aim of cardio', () => {
        const rides = cardioHistory(cardioSessions(workouts, 'cycling' as ExerciseId)).slice(-3);

        expect(rides.map((ride) => ride.comparison?.outcome)).toEqual(['same', 'same', 'same']);
        expect(
            rides.every((ride) => ride.comparison && matchedOrBeaten(ride.comparison.outcome)),
        ).toBe(true);
    });

    it('weekly cardio is under the goal, with two exercises in its breakdown', () => {
        const week = weeklyCardio(events, catalog, now);

        expect(week.status).toBe('under');
        expect(week.totalSeconds).toBeGreaterThan(60 * 60);
        expect(week.byExercise.map((entry) => entry.exerciseId).toSorted()).toEqual([
            'cycling',
            'running',
        ]);
    });

    it('is deterministic for a given day, so loading it twice adds nothing new', () => {
        const again = generateDemoEvents(catalog, new Date(2026, 10, 11, 21, 30, 0));

        expect(again.map((event) => event.id)).toEqual(events.map((event) => event.id));
    });
});
