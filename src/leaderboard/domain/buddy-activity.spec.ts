import { describe, expect, it } from 'vitest';
import { ExerciseId } from '@catalog/domain/exercise';
import { DeviceId, IsoDateTime } from '@shared/domain/event';
import {
    CURL,
    PARTIAL,
    PULL_UP,
    RUNNING,
    cardioAt,
    catalog,
    reps,
    setAt,
} from '../../testing/fixtures';
import { cardioActivity, isFresh, news, setActivity } from './buddy-activity';

const T = '2026-11-25T10:00:00Z';

describe('what a buddy is told about a set', () => {
    it('quotes the top load and the reps at it, in every language', () => {
        const set = setAt(T, [reps(8, 22.5)]);
        expect(setActivity(set, catalog, false)).toEqual({
            tag: set.id,
            exercise: catalog.findExercise(CURL)?.name,
            done: { en: '22.5 kg × 8', ru: '22,5 кг × 8' },
            cardio: false,
            record: false,
        });
    });

    it('judges the set as the records rule does: partials and lighter reps are left out', () => {
        const set = setAt(T, [reps(6, 20), reps(4, 15), reps(3, 20, { technique: PARTIAL })]);
        expect(setActivity(set, catalog, false)?.done.en).toBe('20 kg × 6');
    });

    it('tells a bodyweight set by its reps, and added load with its sign', () => {
        const pullUps = (load: number): string | undefined =>
            setActivity(setAt(T, [reps(10, load, { exerciseId: PULL_UP })]), catalog, false)?.done
                .en;
        expect(pullUps(0)).toBe('10 reps');
        expect(pullUps(10)).toBe('+10 kg × 10');
        expect(pullUps(-20)).toContain('20 kg × 10');
    });

    it('tells a set of partials only by the reps it had', () => {
        const set = setAt(T, [reps(5, 20, { technique: PARTIAL })]);
        expect(setActivity(set, catalog, false)?.done).toEqual({ en: '5 reps', ru: '5 повторов' });
    });

    it('carries the record through', () => {
        expect(setActivity(setAt(T, [reps(8, 30)]), catalog, true)?.record).toBe(true);
    });

    it('does not tell a warm-up', () => {
        const warmUp = setAt(T, [reps(10, 10)], { kind: 'warmup' });
        expect(setActivity(warmUp, catalog, false)).toBeUndefined();
    });

    it('does not tell an exercise the catalog does not know', () => {
        const set = setAt(T, [reps(8, 20)]);
        const unknown = {
            ...set,
            repGroups: set.repGroups.map((group) => ({
                ...group,
                exerciseId: 'gone' as ExerciseId,
            })),
        };
        expect(setActivity(unknown, catalog, false)).toBeUndefined();
    });
});

describe('what a buddy is told about cardio', () => {
    it('quotes the bout on one line, in every language, and marks it as cardio', () => {
        const bout = cardioAt(T, { meters: 5000, seconds: 1800 });
        const activity = cardioActivity(bout, catalog, false);
        expect(activity?.tag).toBe(bout.id);
        expect(activity?.exercise).toEqual(catalog.findExercise(RUNNING)?.name);
        expect(activity?.cardio).toBe(true);
        expect(activity?.done.en).toContain('5 km');
        expect(activity?.done.en).toContain('30:00');
        expect(activity?.done.ru).toContain('5 км');
    });
});

describe('only fresh sets are told', () => {
    const now = new Date('2026-11-25T10:10:00Z');

    it('a set of the last ten minutes is news', () => {
        expect(isFresh('2026-11-25T10:09:30Z' as IsoDateTime, now)).toBe(true);
        expect(isFresh('2026-11-25T10:00:00Z' as IsoDateTime, now)).toBe(true);
    });

    it('an older one is not: a set logged offline is not told an hour later', () => {
        expect(isFresh('2026-11-25T09:59:59Z' as IsoDateTime, now)).toBe(false);
    });

    it('nor is one from the future, beyond a clock a little ahead', () => {
        expect(isFresh('2026-11-25T10:10:30Z' as IsoDateTime, now)).toBe(true);
        expect(isFresh('2026-11-25T11:00:00Z' as IsoDateTime, now)).toBe(false);
    });
});

describe('which sets are news', () => {
    const now = new Date('2026-11-25T10:10:00Z');
    // The fixtures log everything on this device.
    const here = 'test-device' as DeviceId;
    const fresh = setAt('2026-11-25T10:08:00Z', [reps(8, 20)]);
    const old = setAt('2026-11-25T08:00:00Z', [reps(8, 20)]);

    it('a fresh set logged on this device is', () => {
        expect(news([old, fresh], new Set(), here, now)).toEqual([fresh]);
    });

    it('a set another device logged is not: it only arrived here by sync', () => {
        const elsewhere = { ...fresh, deviceId: 'another-phone' as DeviceId };
        expect(news([elsewhere], new Set(), here, now)).toEqual([]);
    });

    it('a set already told is not told again', () => {
        expect(news([fresh], new Set([fresh.id]), here, now)).toEqual([]);
    });
});
