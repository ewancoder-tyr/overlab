import { Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { GamificationService } from '@gamification/application/gamification.service';
import { reportableXp, standings } from '@leaderboard/domain/leaderboard';
import { Clock } from '@shared/application/clock.service';
import { LocalText } from '@shared/domain/language';
import { Result, fail, ok } from '@shared/domain/result';
import { SyncService } from '@sync/application/sync.service';
import {
    CachedBoard,
    LeaderboardAnswer,
    LeaderboardCache,
    LeaderboardRemote,
} from './leaderboard-ports';

/** How long experience must stay put before it is reported, so a workout is not a request a set. */
const SETTLE_MS = 5_000;

/** What the last talk with the server came to, for the page to explain. */
export type LeaderboardConnection = 'idle' | 'loading' | 'offline' | 'failed' | 'expired';

export const PROBLEM: Record<Exclude<LeaderboardAnswer<unknown>['kind'], 'ok'>, LocalText> = {
    offline: {
        en: 'The leaderboard needs an internet connection. Try again when you are online.',
        ru: 'Для таблицы лидеров нужен интернет. Попробуйте снова, когда будете в сети.',
    },
    'signed-out': {
        en: 'Your sign-in has expired. Sign in again on the Data page.',
        ru: 'Вход истёк. Войдите снова на странице «Данные».',
    },
    'wrong-account': {
        en: 'Choose the Google account this device backs up to.',
        ru: 'Выберите тот аккаунт Google, в который сохраняется это устройство.',
    },
    'not-joined': {
        en: 'You are not on the leaderboard.',
        ru: 'Вас нет в таблице лидеров.',
    },
    'too-many': {
        en: 'You follow as many people as you can. Stop following someone first.',
        ru: 'Больше подписок сделать нельзя. Сначала отпишитесь от кого-нибудь.',
    },
    left: {
        en: 'They are no longer on the leaderboard.',
        ru: 'Этого участника больше нет в таблице лидеров.',
    },
    failed: {
        en: 'The server could not do this right now. Try again later.',
        ru: 'Сервер сейчас не смог это сделать. Попробуйте позже.',
    },
};

/**
 * The leaderboard: everyone who chose to take part, ranked by experience. See docs/leaderboard.md,
 * "Leaderboard".
 *
 * Unlike everything else in the app it is online-first, because it shows what was never on
 * this phone. It keeps no events: taking part is a row on the server, per Google account, so
 * every signed-in device of the account agrees on it without syncing anything. The last board
 * fetched is cached on the device, only to have something to show offline.
 *
 * It sits on top of two contexts: sync, for the account and its sign-in, and gamification, for
 * the experience it reports. Whether gamification is on is a preference, which `app.config.ts`
 * passes in (`setEnabled`), as it does for every context.
 */
@Service()
export class LeaderboardService {
    private readonly sync = inject(SyncService);
    private readonly gamification = inject(GamificationService);
    private readonly clock = inject(Clock);
    private readonly remote = inject(LeaderboardRemote);
    private readonly cache = inject(LeaderboardCache);

    /** Whether gamification is on. Off, nothing here talks to the server, except to leave. */
    private readonly enabled = signal(false);
    /** What the server last said about this account, and for which account it said it. */
    private readonly confirmed = signal<{ account: string; joined: boolean } | undefined>(
        undefined,
    );
    private readonly cached = signal<CachedBoard | undefined>(this.cache.load());

    readonly connection = signal<LeaderboardConnection>('idle');
    /** The account this device syncs with: the leaderboard needs one. */
    readonly account = computed(() => this.sync.account()?.email);

    /**
     * Whether this account is on the board: as the server last said, or, before it has said
     * anything since start-up, as the cache suggests (the cache exists only while joined). So an
     * offline start still shows the last board.
     */
    readonly joined = computed(() => {
        const account = this.account();
        if (account === undefined) {
            return false;
        }
        const confirmed = this.confirmed();
        return confirmed?.account === account
            ? confirmed.joined
            : this.cached()?.account === account;
    });

    /** The board to show, ranked, and when it was fetched; undefined while not joined. */
    readonly board = computed(() => {
        const cached = this.cached();
        if (!this.joined() || cached === undefined || cached.account !== this.account()) {
            return undefined;
        }
        return { standings: standings(cached.entries), fetchedAt: new Date(cached.fetchedAt) };
    });

    /**
     * Whether this device tells the server what happens on it: on the board, the game on, and
     * the clock real. A test date's fake sets must not reach the board or anyone's buddies, as
     * they never reach the cloud copy; nor do sets logged in the past.
     */
    readonly reporting = computed(
        () =>
            this.joined() && this.enabled() && !this.clock.pretending() && !this.clock.inThePast(),
    );

    /** The experience the server last acknowledged, so the same number is not sent twice. */
    private reported: number | undefined;
    private reportTimer: ReturnType<typeof setTimeout> | undefined;
    /** Set when leaving failed (offline): `retry` tries again. */
    private leaveOwed = false;

    constructor() {
        // Asks the server once per account, as soon as both an account and the game are there
        // (the account is read from storage after start-up, so it may come second).
        effect(() => {
            const account = this.account();
            if (account === undefined || !this.enabled()) {
                return;
            }
            if (untracked(this.confirmed)?.account !== account) {
                untracked(() => void this.refresh());
            }
        });

        // Reports experience while on the board. Reading `experience` only in here, and only
        // while joined, keeps it from being computed for anyone who does not take part.
        effect(() => {
            if (!this.reporting()) {
                return;
            }
            const xp = reportableXp(this.gamification.experience().progress.xp);
            untracked(() => {
                this.reportSoon(xp);
            });
        });
    }

    /**
     * Gamification switched on or off. Switching it off takes the account off the board: the
     * board is of people playing the game. Switching it on does not join; that takes a choice.
     */
    setEnabled(on: boolean): void {
        const was = this.enabled();
        this.enabled.set(on);
        if (was && !on && this.joined()) {
            void this.leave();
        }
    }

    /** Fetches the board (and whether this account is on it). Silent: the result shows. */
    async refresh(): Promise<void> {
        const account = this.account();
        if (account === undefined || !this.enabled()) {
            return;
        }
        this.connection.set('loading');
        const answer = await this.remote.board();
        if (this.account() !== account) {
            return; // Signed out or switched account meanwhile: the answer is not for this one.
        }
        if (answer.kind !== 'ok') {
            this.connection.set(problemConnection(answer.kind));
            return;
        }
        this.confirmed.set({ account, joined: answer.value.joined });
        this.keep(
            answer.value.joined
                ? {
                      account,
                      entries: answer.value.entries,
                      fetchedAt: this.clock.currentTime().toISOString(),
                  }
                : undefined,
        );
        this.reported = answer.value.entries.find((entry) => entry.you)?.xp;
        this.connection.set('idle');
    }

    /** Joins with a fresh Google ID token: the server takes the name and picture from it. */
    async join(credential: string): Promise<Result<void>> {
        const account = this.account();
        if (account === undefined) {
            return fail(PROBLEM['signed-out']);
        }
        const xp = reportableXp(this.gamification.experience().progress.xp);
        const answer = await this.remote.join(credential, xp);
        if (answer.kind !== 'ok') {
            return fail(PROBLEM[answer.kind]);
        }
        this.confirmed.set({ account, joined: true });
        this.reported = xp;
        await this.refresh();
        return ok(undefined);
    }

    /** Leaves the board. The row on the server goes; so does the board cached here. */
    async leave(): Promise<Result<void>> {
        const account = this.account();
        if (account === undefined) {
            return fail(PROBLEM['signed-out']);
        }
        clearTimeout(this.reportTimer);
        const answer = await this.remote.leave();
        // Not being on it is what leaving wanted.
        if (answer.kind !== 'ok' && answer.kind !== 'not-joined') {
            this.leaveOwed = true;
            return fail(PROBLEM[answer.kind]);
        }
        this.leaveOwed = false;
        this.confirmed.set({ account, joined: false });
        this.keep(undefined);
        this.reported = undefined;
        return ok(undefined);
    }

    /** Called when the network returns: finishes a leave that could not reach the server. */
    retry(): void {
        if (this.leaveOwed && this.account() !== undefined) {
            void this.leave();
        }
    }

    private reportSoon(xp: number): void {
        clearTimeout(this.reportTimer);
        if (xp === this.reported) {
            return;
        }
        this.reportTimer = setTimeout(() => {
            void this.report(xp);
        }, SETTLE_MS);
    }

    private async report(xp: number): Promise<void> {
        const account = this.account();
        const answer = await this.remote.reportXp(xp);
        if (answer.kind === 'ok') {
            this.reported = xp;
        } else if (answer.kind === 'not-joined' && account !== undefined) {
            // Left on another device, or the account deleted everything: stop reporting.
            this.confirmed.set({ account, joined: false });
            this.keep(undefined);
        }
        // Offline or failed: the next change of experience, or the next start, tries again.
    }

    private keep(board: CachedBoard | undefined): void {
        this.cached.set(board);
        this.cache.save(board);
    }
}

function problemConnection(
    kind: Exclude<LeaderboardAnswer<unknown>['kind'], 'ok'>,
): LeaderboardConnection {
    switch (kind) {
        case 'offline':
            return 'offline';
        case 'signed-out':
            return 'expired';
        default:
            return 'failed';
    }
}
