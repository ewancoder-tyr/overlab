import { CHARACTER_SCALE, levelOf } from '@gamification/domain/level';
import { titleOf } from '@gamification/domain/title';
import { LocalText } from '@shared/domain/language';

/**
 * One row of the leaderboard as the server sends it: what Google shows for the account and the
 * experience its devices last reported. No account id: the server never hands one out.
 */
export interface LeaderboardEntry {
    /** The row's public id: a random name for it, which is what following it sends back. */
    readonly id: string;
    /** May be empty, when the Google account shares no name. */
    readonly name: string;
    /** A Google image URL, or empty. */
    readonly picture: string;
    /** Whole experience points. */
    readonly xp: number;
    /** True on the row of whoever asked. */
    readonly you: boolean;
    /**
     * True when whoever asked follows this row. Whether the row follows back is never sent:
     * see the buddies rule in docs/leaderboard.md.
     */
    readonly following: boolean;
}

/** A row ready to show: its place, and the level and title its experience reaches. */
export interface Standing extends LeaderboardEntry {
    /** 1 for the most experience. Equal experience shares a place (1, 2, 2, 4). */
    readonly place: number;
    readonly level: number;
    readonly title: LocalText;
}

/**
 * Ranks the board. The server already sends it most first (ties to whoever joined earlier);
 * this only numbers it and derives the level and title, which live in the app, not the server.
 * They follow the character's own curve (`levelOf`), so the board shows the same level as each
 * person's Week card.
 */
export function standings(entries: readonly LeaderboardEntry[]): readonly Standing[] {
    let place = 0;
    return entries.map((entry, index) => {
        // "Competition" ranking: a tie shares a place, and the next one skips a number.
        if (index === 0 || entries[index - 1]?.xp !== entry.xp) {
            place = index + 1;
        }
        const level = levelOf(entry.xp, CHARACTER_SCALE).level;
        return { ...entry, place, level, title: titleOf(level) };
    });
}

/**
 * The experience a device reports: whole points, rounded down like the Week card shows them.
 * Inside, experience is fractional (a mixed set splits its 10 points); the server takes whole
 * numbers only.
 */
export function reportableXp(xp: number): number {
    return Math.max(0, Math.floor(xp));
}
