import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BuddiesService } from '@leaderboard/application/buddies.service';
import { LeaderboardService } from '@leaderboard/application/leaderboard.service';
import { Standing } from '@leaderboard/domain/leaderboard';
import { Language, LocalText, Localized } from '@shared/domain/language';
import { Result } from '@shared/domain/result';
import {
    LocalDatePipe,
    LocalizePipe,
    currentLanguage,
    translations,
} from '@shared/presentation/i18n';

const TEXT = {
    en: {
        lv: 'Lv',
        you: 'You',
        anonymous: 'Anonymous lifter',
        loading: 'Fetching the leaderboard…',
        notJoined:
            'You are not on the leaderboard. Turn it on under Settings, Experience, to see everyone who is.',
        settings: 'Settings',
        offline: 'Offline. This is the leaderboard as it was at',
        failed: 'The leaderboard could not be fetched. This is how it was at',
        expired: 'Your sign-in has expired; sign in again on the Data page. This is how it was at',
        alone: 'Nobody else has joined yet. You lead.',
        label: (place: number, name: string, level: number, title: string, xp: string) =>
            `Place ${place}: ${name}, level ${level}, ${title}, ${xp} experience`,
        buddies:
            "Tap a bell to follow someone. You are told about each other's sets only once you both follow each other, and nobody is ever shown who follows them.",
        follow: (name: string) => `Follow ${name}`,
        unfollow: (name: string) => `Stop following ${name}`,
        offHere: 'Notifications about the people you follow are not set up on this device.',
        turnOn: 'Turn on here',
        blockedHere:
            'Notifications are blocked for OverLab on this device, so you will not hear about the people you follow here. Allow them in the browser settings.',
        unsupportedHere:
            'This browser cannot show notifications, so you will not hear about the people you follow here. Install OverLab as an app.',
    },
    ru: {
        lv: 'Ур.',
        you: 'Вы',
        anonymous: 'Аноним',
        loading: 'Загружаем таблицу лидеров…',
        notJoined:
            'Вас нет в таблице лидеров. Включите её в «Настройки» → «Опыт», чтобы видеть всех участников.',
        settings: 'Настройки',
        offline: 'Нет сети. Таблица такая, какой была в',
        failed: 'Не удалось загрузить таблицу. Такой она была в',
        expired: 'Вход истёк, войдите снова на странице «Данные». Такой таблица была в',
        alone: 'Больше никто пока не участвует. Вы лидер.',
        label: (place: number, name: string, level: number, title: string, xp: string) =>
            `Место ${place}: ${name}, уровень ${level}, ${title}, опыт ${xp}`,
        buddies:
            'Нажмите на колокольчик, чтобы подписаться. Уведомления о подходах друг друга приходят, только когда вы оба подписаны друг на друга, и никому не показывают, кто на него подписан.',
        follow: (name: string) => `Подписаться: ${name}`,
        unfollow: (name: string) => `Отписаться: ${name}`,
        offHere: 'На этом устройстве уведомления о тех, на кого вы подписаны, не настроены.',
        turnOn: 'Включить здесь',
        blockedHere:
            'Уведомления для OverLab на этом устройстве заблокированы, поэтому о тех, на кого вы подписаны, здесь вы не узнаете. Разрешите их в настройках браузера.',
        unsupportedHere:
            'Этот браузер не показывает уведомления, поэтому о тех, на кого вы подписаны, здесь вы не узнаете. Установите OverLab как приложение.',
    },
} satisfies Localized<unknown>;

function wholeXp(language: Language, xp: number): string {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(xp);
}

/**
 * The leaderboard itself: everyone who takes part, most experience first, with their Google
 * picture and name, level and title. Fetched afresh each time it is shown; offline it shows the
 * last board fetched and says when that was.
 *
 * Every row but your own has a bell: following it is your half of becoming buddies (see
 * `BuddiesService`).
 */
@Component({
    selector: 'olab-leaderboard-board',
    imports: [RouterLink, LocalDatePipe, LocalizePipe],
    templateUrl: './leaderboard-board.component.html',
    styleUrl: './leaderboard-board.component.scss',
})
export class LeaderboardBoardComponent {
    private readonly leaderboard = inject(LeaderboardService);
    private readonly buddies = inject(BuddiesService);
    private readonly language = currentLanguage();
    protected readonly t = translations(TEXT);

    protected readonly joined = this.leaderboard.joined;
    protected readonly connection = this.leaderboard.connection;
    protected readonly board = this.leaderboard.board;

    /**
     * Pictures that failed to load (offline, or Google refused): their rows show an initial
     * instead. Google's image links are not cached for offline use, deliberately: they are
     * other people's pictures, and the service worker caches only the app.
     */
    private readonly brokenPictures = signal<ReadonlySet<string>>(new Set());

    protected readonly rows = computed(() => {
        const language = this.language();
        const broken = this.brokenPictures();
        return (this.board()?.standings ?? []).map((row: Standing) => {
            const name = row.name === '' ? this.t().anonymous : row.name;
            const title = row.title[language];
            const xp = wholeXp(language, row.xp);
            return {
                ...row,
                name,
                titleText: title,
                xpText: xp,
                initial: firstLetter(name),
                showsPicture: row.picture !== '' && !broken.has(row.picture),
                label: this.t().label(row.place, name, row.level, title, xp),
                bellLabel: row.following ? this.t().unfollow(name) : this.t().follow(name),
            };
        });
    });

    protected readonly alone = computed(() => this.rows().length === 1);

    /** The id of the row whose bell is being answered by the server, or `'device'`. */
    protected readonly busy = signal<string | undefined>(undefined);
    protected readonly error = signal<LocalText | undefined>(undefined);

    /**
     * What to say about notifications on this device, and only while it matters: when you
     * follow someone and this device could not show what they do.
     */
    protected readonly hint = computed(() => {
        const state = this.buddies.notifications();
        return this.buddies.followsAnyone() && state !== 'on' ? state : undefined;
    });

    constructor() {
        void this.leaderboard.refresh();
    }

    protected toggle(row: { readonly id: string; readonly following: boolean }): Promise<void> {
        return this.run(row.id, () =>
            row.following ? this.buddies.unfollow(row.id) : this.buddies.follow(row.id),
        );
    }

    protected turnOn(): Promise<void> {
        return this.run('device', () => this.buddies.turnOnHere());
    }

    /** One request at a time: the bells wait while one is being answered. */
    private async run(what: string, action: () => Promise<Result<void>>): Promise<void> {
        if (this.busy() !== undefined) {
            return;
        }
        this.busy.set(what);
        this.error.set(undefined);
        const result = await action();
        this.error.set(result.ok ? undefined : result.error);
        this.busy.set(undefined);
    }

    protected pictureFailed(picture: string): void {
        this.brokenPictures.update((set) => new Set([...set, picture]));
    }
}

/**
 * The first letter of a name, for a row without a picture. `Intl.Segmenter` splits text into
 * what a reader sees as single characters, so an accented letter or an emoji stays whole.
 */
function firstLetter(name: string): string {
    const [first] = new Intl.Segmenter().segment(name);
    return first?.segment.toLocaleUpperCase() ?? '?';
}
