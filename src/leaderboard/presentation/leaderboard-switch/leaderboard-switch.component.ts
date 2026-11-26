import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeaderboardService } from '@leaderboard/application/leaderboard.service';
import { LocalText, Localized } from '@shared/domain/language';
import { LocalizePipe, currentLanguage, translations } from '@shared/presentation/i18n';
import { GoogleSignIn } from '@sync/application/sync-ports';

const TEXT = {
    en: {
        heading: 'Leaderboard',
        intro: 'Take part to see everyone else who does, ranked by experience: their Google name and picture, level and title. They see yours.',
        needsSignIn: 'Taking part needs a Google sign-in, so first sign in on the Data page.',
        dataLink: 'Go to Data',
        confirm:
            'Confirm with Google to show your name and picture. Choose the account this device backs up to.',
        noGoogle: 'Google sign-in needs an internet connection. Try again when you are online.',
        cancel: 'Cancel',
        open: 'Open the leaderboard',
        off: 'Off',
        on: 'On',
    },
    ru: {
        heading: 'Таблица лидеров',
        intro: 'Участвуйте, чтобы видеть всех остальных участников по опыту: их имя и фото из Google, уровень и звание. Они увидят ваши.',
        needsSignIn: 'Для участия нужен вход через Google: сначала войдите на странице «Данные».',
        dataLink: 'К данным',
        confirm:
            'Подтвердите через Google, чтобы показать имя и фото. Выберите аккаунт, в который сохраняется это устройство.',
        noGoogle: 'Для входа через Google нужен интернет. Попробуйте снова, когда будете в сети.',
        cancel: 'Отмена',
        open: 'Открыть таблицу лидеров',
        off: 'Выкл',
        on: 'Вкл',
    },
} satisfies Localized<unknown>;

/**
 * "Take part in the leaderboard", for the experience part of Settings (shown only while
 * gamification is on). Off and on, like the other switches there, except that on takes one
 * more step: Google's button, because the server shows only the name and picture Google signs.
 */
@Component({
    selector: 'olab-leaderboard-switch',
    imports: [RouterLink, LocalizePipe],
    templateUrl: './leaderboard-switch.component.html',
    styleUrl: './leaderboard-switch.component.scss',
})
export class LeaderboardSwitchComponent {
    private readonly leaderboard = inject(LeaderboardService);
    private readonly signIn = inject(GoogleSignIn);
    private readonly language = currentLanguage();
    protected readonly t = translations(TEXT);

    protected readonly account = this.leaderboard.account;
    protected readonly joined = this.leaderboard.joined;
    /** True after tapping On, while Google's button waits to be used. */
    protected readonly confirming = signal(false);
    protected readonly busy = signal(false);
    protected readonly googleUnavailable = signal(false);
    protected readonly error = signal<LocalText | undefined>(undefined);

    private readonly buttonHost = viewChild<ElementRef<HTMLElement>>('googleButton');

    constructor() {
        // Draws Google's button whenever its placeholder appears, as the cloud backup part does.
        effect(() => {
            const host = this.buttonHost()?.nativeElement;
            const language = this.language();
            if (host === undefined) {
                return;
            }
            void this.signIn
                .renderButton(host, language, (credential) => {
                    void this.complete(credential);
                })
                .then((shown) => {
                    this.googleUnavailable.set(!shown);
                });
        });
    }

    protected async choose(on: boolean): Promise<void> {
        this.error.set(undefined);
        if (on === this.joined()) {
            this.confirming.set(false);
            return;
        }
        if (on) {
            this.confirming.set(true);
            return;
        }
        this.busy.set(true);
        const result = await this.leaderboard.leave();
        this.busy.set(false);
        this.error.set(result.ok ? undefined : result.error);
    }

    protected cancel(): void {
        this.confirming.set(false);
    }

    private async complete(credential: string): Promise<void> {
        this.busy.set(true);
        const result = await this.leaderboard.join(credential);
        this.busy.set(false);
        this.confirming.set(!result.ok);
        this.error.set(result.ok ? undefined : result.error);
    }
}
