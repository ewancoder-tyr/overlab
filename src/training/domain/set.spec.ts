import { ExerciseId } from '@catalog/domain/exercise';
import { TechniqueId } from '@catalog/domain/technique';
import {
    CURL,
    HAMMER_CURL,
    PARTIAL,
    PULL_UP,
    RUNNING,
    catalog,
    contextAt,
    reps,
    setAt,
} from '../../testing/fixtures';
import { SetDraft, activeSets, performSet, primaryExerciseId, voidSet } from './set';

const NOW = '2026-11-11T18:00:00Z';

function attempt(draft: Partial<SetDraft>): ReturnType<typeof performSet> {
    return performSet(
        { kind: 'working', repGroups: [reps(8, 20)], ...draft },
        catalog,
        contextAt(NOW),
    );
}

describe('performSet', () => {
    it('records a plain set as a single rep group, with the load exactly as entered', () => {
        const result = attempt({ repGroups: [reps(8, 22.5)] });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.type).toBe('SetPerformed');
            expect(result.value.version).toBe(1);
            expect(result.value.repGroups).toEqual([
                { exerciseId: CURL, technique: 'full', load: { value: 22.5, unit: 'kg' }, reps: 8 },
            ]);
        }
    });

    it('keeps mixed techniques and mixed exercises in the order performed', () => {
        const result = attempt({
            repGroups: [
                reps(5, 20),
                reps(3, 20, { technique: PARTIAL }),
                reps(2, 20, { exerciseId: HAMMER_CURL }),
            ],
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.repGroups.map((group) => group.technique)).toEqual([
                'full',
                'long-length-partial',
                'full',
            ]);
            expect(primaryExerciseId(result.value)).toBe(CURL);
        }
    });

    it('allows a negative load for bodyweight exercises (assisted pull-ups)', () => {
        expect(attempt({ repGroups: [reps(6, -20, { exerciseId: PULL_UP })] }).ok).toBe(true);
    });

    it('rejects a negative load for externally loaded exercises', () => {
        expect(attempt({ repGroups: [reps(6, -20)] }).ok).toBe(false);
    });

    it('records failure, light and reps in reserve as effort', () => {
        const failure = attempt({ effort: { kind: 'failure' } });
        const light = attempt({ effort: { kind: 'light' } });
        const reserve = attempt({ effort: { kind: 'reps-in-reserve', repsInReserve: 2 } });

        expect(failure.ok && failure.value.effort).toEqual({ kind: 'failure' });
        expect(light.ok && light.value.effort).toEqual({ kind: 'light' });
        expect(reserve.ok && reserve.value.effort).toEqual({
            kind: 'reps-in-reserve',
            repsInReserve: 2,
        });
    });

    it.each([
        ['no rep groups', { repGroups: [] }],
        ['zero reps', { repGroups: [reps(0, 20)] }],
        ['fractional reps', { repGroups: [reps(7.5, 20)] }],
        ['a load that is not a number', { repGroups: [reps(8, Number.NaN)] }],
        ['an unknown exercise', { repGroups: [reps(8, 20, { exerciseId: 'nope' as ExerciseId })] }],
        [
            'an unknown technique',
            { repGroups: [reps(8, 20, { technique: 'nope' as TechniqueId })] },
        ],
        ['negative reps in reserve', { effort: { kind: 'reps-in-reserve', repsInReserve: -1 } }],
        ['a time in the future', { occurredAt: new Date('2026-11-12T18:00:00Z') }],
    ] satisfies [string, Partial<SetDraft>][])('rejects %s', (_name, draft) => {
        expect(attempt(draft).ok).toBe(false);
    });

    it('rejects a cardio exercise: cardio is not logged as sets', () => {
        expect(attempt({ repGroups: [reps(22, 0, { exerciseId: RUNNING })] })).toEqual({
            ok: false,
            error: expect.objectContaining({
                en: 'Running is cardio: log its distance, time or calories instead.',
            }) as unknown,
        });
    });

    it('accepts a time in the past (backfilling)', () => {
        const result = attempt({ occurredAt: new Date('2026-11-01T08:00:00Z') });

        expect(result.ok && result.value.occurredAt).toBe('2026-11-01T08:00:00.000Z');
        expect(result.ok && result.value.recordedAt).toBe('2026-11-11T18:00:00.000Z');
    });
});

describe('activeSets', () => {
    it('returns performed sets in order of occurrence, whatever the storage order', () => {
        const first = setAt('2026-11-11T10:00:00Z', [reps(8, 20)]);
        const second = setAt('2026-11-11T10:05:00Z', [reps(7, 20)]);

        expect(activeSets([second, first])).toEqual([first, second]);
    });

    it('leaves out voided sets, even when the void event is stored before the set', () => {
        const mistake = setAt('2026-11-11T10:00:00Z', [reps(80, 20)]);
        const kept = setAt('2026-11-11T10:05:00Z', [reps(8, 20)]);
        const voided = voidSet(mistake.id, contextAt('2026-11-11T10:06:00Z'));

        expect(activeSets([voided, mistake, kept])).toEqual([kept]);
    });

    it('treats voiding the same set twice like voiding it once', () => {
        const mistake = setAt('2026-11-11T10:00:00Z', [reps(80, 20)]);
        const context = contextAt('2026-11-11T10:06:00Z');

        expect(
            activeSets([mistake, voidSet(mistake.id, context), voidSet(mistake.id, context)]),
        ).toEqual([]);
    });

    it('ignores events of unknown types', () => {
        const set = setAt('2026-11-11T10:00:00Z', [reps(8, 20)]);
        const unknown = { ...set, id: 'other', type: 'SomethingFromTheFuture' };

        expect(activeSets([set, unknown as never])).toEqual([set]);
    });
});
