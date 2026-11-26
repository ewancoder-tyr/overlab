import { describe, expect, it } from 'vitest';
import { LeaderboardEntry, reportableXp, standings } from './leaderboard';

const entry = (name: string, xp: number, you = false): LeaderboardEntry => ({
    id: name,
    name,
    picture: '',
    xp,
    you,
    following: false,
});

describe('leaderboard standings', () => {
    it('numbers the board in the order the server sent it', () => {
        const board = standings([entry('Bob', 1200), entry('Alice', 500), entry('Carol', 20)]);
        expect(board.map((row) => [row.name, row.place])).toEqual([
            ['Bob', 1],
            ['Alice', 2],
            ['Carol', 3],
        ]);
    });

    it('gives equal experience the same place and skips the next', () => {
        const board = standings([entry('A', 900), entry('B', 500), entry('C', 500), entry('D', 1)]);
        expect(board.map((row) => row.place)).toEqual([1, 2, 2, 4]);
    });

    it("derives the level and title on the character's curve, as the Week card does", () => {
        // Level L needs 50 × (L − 1)²: 450 reaches level 4, 449 does not.
        const [reached, short] = standings([entry('A', 450), entry('B', 449)]);
        expect(reached?.level).toBe(4);
        expect(short?.level).toBe(3);
        expect(standings([entry('New', 0)])[0]?.title.en).toBe('Fresh Meat');
    });

    it('keeps the row of whoever asked marked', () => {
        expect(standings([entry('A', 10), entry('Me', 5, true)])[1]?.you).toBe(true);
    });
});

describe('reportable experience', () => {
    it('is whole points, rounded down, never negative', () => {
        expect(reportableXp(4049.5)).toBe(4049);
        expect(reportableXp(0)).toBe(0);
        expect(reportableXp(-3)).toBe(0);
    });
});
