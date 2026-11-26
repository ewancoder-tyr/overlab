import { PARTIAL, reps, setAt } from '../../testing/fixtures';
import { groupSetsByLoad } from './set-rows';

describe('groupSetsByLoad', () => {
    it('puts sets at the same load on one row, in the order performed', () => {
        const rows = groupSetsByLoad([
            setAt('2026-11-11T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-11T10:03:00Z', [reps(7, 20)]),
            setAt('2026-11-11T10:06:00Z', [reps(6, 22.5)]),
            setAt('2026-11-11T10:09:00Z', [reps(6, 20)]),
        ]);

        expect(rows.map((row) => row.loads.map((load) => load.value))).toEqual([[20], [22.5]]);
        expect(rows.map((row) => row.cells.map((cell) => cell.repsByTechnique[0]?.reps))).toEqual([
            [8, 7, 6],
            [6],
        ]);
    });

    it('shows full reps and partials of a set as separate counts in one cell', () => {
        const [row] = groupSetsByLoad([
            setAt('2026-11-11T10:00:00Z', [reps(5, 20), reps(3, 20, { technique: PARTIAL })]),
        ]);

        expect(row?.cells[0]?.repsByTechnique).toEqual([
            { technique: 'full', reps: 5 },
            { technique: 'long-length-partial', reps: 3 },
        ]);
    });

    it('totals an alternating pattern per technique', () => {
        const [row] = groupSetsByLoad([
            setAt('2026-11-11T10:00:00Z', [
                reps(1, 20),
                reps(1, 20, { technique: PARTIAL }),
                reps(1, 20),
                reps(1, 20, { technique: PARTIAL }),
            ]),
        ]);

        expect(row?.cells[0]?.repsByTechnique.map((entry) => entry.reps)).toEqual([2, 2]);
    });

    it('gives a set with a load change (drop set) its own row', () => {
        const rows = groupSetsByLoad([
            setAt('2026-11-11T10:00:00Z', [reps(8, 20)]),
            setAt('2026-11-11T10:03:00Z', [reps(6, 20), reps(6, 15)]),
        ]);

        expect(rows.map((row) => row.loads.map((load) => load.value))).toEqual([[20], [20, 15]]);
    });
});
