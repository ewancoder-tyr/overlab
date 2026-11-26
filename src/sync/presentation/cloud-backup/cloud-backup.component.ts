import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { EventLog } from '@shared/application/event-log.service';
import { LocalText, Localized, plural } from '@shared/domain/language';
import {
    LocalDatePipe,
    LocalizePipe,
    currentLanguage,
    translations,
} from '@shared/presentation/i18n';
import { GoogleSignIn } from '@sync/application/sync-ports';
import { SyncService } from '@sync/application/sync.service';
import { emailInIdToken } from '@sync/domain/id-token';

const events = {
    en: (count: number) => `${count} ${plural('en', count, { one: 'event', other: 'events' })}`,
    ru: (count: number) =>
        `${count} ${plural('ru', count, { one: 'событие', few: 'события', many: 'событий', other: 'события' })}`,
};

const TEXT = {
    en: {
        heading: 'Cloud backup',
        intro: 'Sign in with Google to keep a copy of your log in the cloud and share it between your devices. It is optional: signed out, everything stays on this device, and the app works the same either way, with or without internet.',
        noGoogle:
            'Google sign-in needs an internet connection. Come back to this page when you are online.',
        uploadWarning: (count: number, email: string) =>
            `This device holds ${events.en(count)}. Signing in adds them to the cloud copy of ${email}, merged with whatever is already there, and that cannot be undone except by deleting everything.`,
        uploadConfirm: 'Sign in and upload',
        cancel: 'Cancel',
        signedInAs: 'Signed in as',
        backedUp: 'Everything on this device is backed up.',
        lastSync: 'Last synced',
        syncing: (count: number) => `Backing up ${events.en(count)}…`,
        offline: (count: number) =>
            `Offline. ${events.en(count)} will be backed up when you are connected.`,
        expired: (count: number) =>
            `Your sign-in has expired. Sign in again to back up ${events.en(count)}; they are safe on this device meanwhile.`,
        failed: (count: number) =>
            `The server had a problem. ${events.en(count)} will be backed up on the next try.`,
        paused: (count: number) =>
            `Paused while the test date is on: what you log on a test date stays on this device. ${events.en(count)} waiting.`,
        signOut: 'Sign out',
        signOutNote:
            'Signing out keeps your data on this device and the cloud copy as they are. To erase either, use the buttons below.',
    },
    ru: {
        heading: 'Облачная копия',
        intro: 'Войдите через Google, чтобы хранить копию журнала в облаке и видеть его на всех своих устройствах. Это необязательно: без входа всё остаётся на этом устройстве, а приложение работает одинаково — с интернетом и без.',
        noGoogle:
            'Для входа через Google нужен интернет. Вернитесь на эту страницу, когда будете в сети.',
        uploadWarning: (count: number, email: string) =>
            `На этом устройстве ${events.ru(count)}. После входа они добавятся в облачную копию ${email} вместе с тем, что там уже есть, и убрать их можно будет только удалив всё.`,
        uploadConfirm: 'Войти и загрузить',
        cancel: 'Отмена',
        signedInAs: 'Вход выполнен:',
        backedUp: 'Всё на этом устройстве сохранено в облаке.',
        lastSync: 'Последняя синхронизация',
        syncing: (count: number) => `Сохраняем в облако: ${events.ru(count)}…`,
        offline: (count: number) =>
            `Нет сети. Сохраним в облако, когда появится интернет: ${events.ru(count)}.`,
        expired: (count: number) =>
            `Вход истёк. Войдите снова, чтобы сохранить в облако ${events.ru(count)}; пока они в безопасности на этом устройстве.`,
        failed: (count: number) =>
            `На сервере ошибка. Попробуем снова чуть позже: ${events.ru(count)}.`,
        paused: (count: number) =>
            `Пауза, пока включена тестовая дата: записанное с ней остаётся на этом устройстве. Ожидают: ${events.ru(count)}.`,
        signOut: 'Выйти',
        signOutNote:
            'При выходе данные на этом устройстве и облачная копия остаются как есть. Стереть их можно кнопками ниже.',
    },
} satisfies Localized<unknown>;

/**
 * The "Cloud backup" part of the Data page: Google sign-in, the sync status and signing out.
 * Erasing (this device, or everything) is the Data page's own, below it.
 *
 * It belongs to the `sync` context, so the Data page only places `<olab-cloud-backup />`, and
 * removing sync removes this part with it.
 */
@Component({
    selector: 'olab-cloud-backup',
    imports: [LocalizePipe, LocalDatePipe],
    templateUrl: './cloud-backup.component.html',
    styleUrl: './cloud-backup.component.scss',
})
export class CloudBackupComponent {
    private readonly sync = inject(SyncService);
    private readonly log = inject(EventLog);
    private readonly signIn = inject(GoogleSignIn);
    private readonly language = currentLanguage();

    protected readonly t = translations(TEXT);
    protected readonly account = this.sync.account;
    protected readonly status = this.sync.status;
    /** Google's button is shown when signed out, and again when the sign-in has expired. */
    protected readonly showsButton = computed(() => {
        const status = this.status();
        return (
            status.kind === 'signed-out' ||
            (status.kind === 'waiting' && status.reason === 'expired')
        );
    });

    /** A sign-in waiting for the user to accept that this device's data goes up with it. */
    protected readonly awaitingUpload = signal<{ credential: string; email: string } | undefined>(
        undefined,
    );
    protected readonly googleUnavailable = signal(false);
    protected readonly error = signal<LocalText | undefined>(undefined);
    protected readonly busy = signal(false);

    /** `viewChild` as a signal: undefined until the element is in the view. */
    private readonly buttonHost = viewChild<ElementRef<HTMLElement>>('googleButton');

    protected readonly eventCount = computed(() => this.log.events().length);

    constructor() {
        // Draws Google's button whenever its placeholder appears, and again on a language change.
        effect(() => {
            const host = this.buttonHost()?.nativeElement;
            const language = this.language();
            if (host === undefined) {
                return;
            }
            void this.signIn
                .renderButton(host, language, (credential) => {
                    this.chosen(credential);
                })
                .then((shown) => {
                    this.googleUnavailable.set(!shown);
                });
        });
    }

    protected async confirmUpload(): Promise<void> {
        const waiting = this.awaitingUpload();
        this.awaitingUpload.set(undefined);
        if (waiting !== undefined) {
            await this.complete(waiting.credential);
        }
    }

    protected cancelUpload(): void {
        this.awaitingUpload.set(undefined);
    }

    /** Signs out and keeps this device's data; "Erase this device" is the way to drop it. */
    protected async signOut(): Promise<void> {
        this.busy.set(true);
        await this.sync.signOut(false);
        this.busy.set(false);
    }

    /** Google answered: warn first when this device has data that would go up with the sign-in. */
    private chosen(credential: string): void {
        this.error.set(undefined);
        if (this.log.events().length > 0) {
            this.awaitingUpload.set({ credential, email: emailInIdToken(credential) ?? '' });
        } else {
            void this.complete(credential);
        }
    }

    private async complete(credential: string): Promise<void> {
        this.busy.set(true);
        const result = await this.sync.signIn(credential);
        this.busy.set(false);
        this.error.set(result.ok ? undefined : result.error);
    }
}
