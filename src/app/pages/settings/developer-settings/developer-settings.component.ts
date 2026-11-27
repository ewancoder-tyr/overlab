import { Component, computed, inject, signal } from '@angular/core';
import { CatalogService } from '@catalog/application/catalog.service';
import { DiagnosticsCardComponent } from '@diagnostics/presentation/diagnostics-card/diagnostics-card.component';
import { RemindersService } from '@settings/application/reminders.service';
import { toLocalDate } from '@shared/domain/schedule';
import { Clock } from '@shared/application/clock.service';
import { EventLog } from '@shared/application/event-log.service';
import { LocalText, Localized } from '@shared/domain/language';
import { LocalizePipe, translations } from '@shared/presentation/i18n';
import { generateDemoEvents } from '../../../demo/demo-data';

const TEXT = {
    en: {
        heading: 'Developer settings',
        intro: 'Tools for trying the app out and tracking down problems.',
        demoHeading: 'Demo data',
        demoIntro:
            'Demo data adds about two months of generated workouts (a program of three days, one every second day, each ending with a run or a ride) and stars their exercises, so you can see the app with history in it, a few stalled exercises included. It mixes with your own sets and cannot be taken out again; erasing removes everything, demo and real. Signed in, it goes to your cloud copy too, and only "Delete everything" on the Data page takes it out.',
        demoConfirm: 'Tap again to add demo data',
        demo: 'Load demo data',
        demoAdded: (count: number) => `Added ${count} demo events.`,
        testDateHeading: 'Test date',
        testDateIntro:
            'A test date makes the whole app believe it is another day, so you can log several workouts in a row and see how they play out. Sets logged meanwhile are real and keep that date. Reloading the app returns to the real date.',
        pretend: 'Pretend today is',
        onTestDate: 'The app is on a test date.',
        backToReal: 'Back to real time',
        notificationHeading: 'Test notification',
        notificationIntro:
            'Sends a reminder to this device straight away, worded as the real one on a day of a program would be.',
        sendTest: 'Send a test',
        remindersOff: 'Turn on reminders in Settings first.',
        sent: 'Sent. It should arrive in a few seconds.',
    },
    ru: {
        heading: 'Для разработчиков',
        intro: 'Инструменты, чтобы опробовать приложение и найти проблему.',
        demoHeading: 'Демо-данные',
        demoIntro:
            'Демо-данные добавляют около двух месяцев сгенерированных тренировок (программа из трёх дней, через день, каждая заканчивается бегом или велосипедом) и отмечают их упражнения звёздочкой, чтобы посмотреть приложение с историей, включая несколько упражнений в застое. Они смешиваются с вашими подходами, и убрать их потом нельзя; стирание удаляет всё — и демо, и настоящее. После входа они попадут и в облачную копию, и убрать их оттуда можно только кнопкой «Удалить всё» на странице «Данные».',
        demoConfirm: 'Нажмите ещё раз, чтобы добавить',
        demo: 'Добавить демо-данные',
        demoAdded: (count: number) => `Добавлено демо-событий: ${count}.`,
        testDateHeading: 'Тестовая дата',
        testDateIntro:
            'Тестовая дата заставляет всё приложение думать, что сегодня другой день, — можно записать несколько тренировок подряд и посмотреть, что получится. Записанные при этом подходы настоящие и сохраняют эту дату. После перезагрузки вернётся настоящая дата.',
        pretend: 'Пусть сегодня будет',
        onTestDate: 'Приложение работает с тестовой датой.',
        backToReal: 'Вернуть настоящее время',
        notificationHeading: 'Тестовое уведомление',
        notificationIntro:
            'Сразу присылает на это устройство напоминание — такое же, как настоящее в день тренировки.',
        sendTest: 'Прислать тестовое',
        remindersOff: 'Сначала включите напоминания в настройках.',
        sent: 'Отправлено. Должно прийти через несколько секунд.',
    },
} satisfies Localized<unknown>;

/**
 * The developer section of Settings, revealed by tapping the About heading ten times (see
 * `DeveloperMode`). It lives in `app` because it composes several contexts: the demo data needs
 * the catalog and the event log, the test notification the reminders, and the diagnostics card
 * is the `diagnostics` context's own.
 */
@Component({
    selector: 'olab-developer-settings',
    imports: [DiagnosticsCardComponent, LocalizePipe],
    templateUrl: './developer-settings.component.html',
    styleUrl: './developer-settings.component.scss',
})
export class DeveloperSettingsComponent {
    private readonly log = inject(EventLog);
    private readonly catalog = inject(CatalogService).catalog;
    private readonly clock = inject(Clock);
    private readonly reminders = inject(RemindersService);

    protected readonly t = translations(TEXT);

    /** True while the app pretends it is another day. */
    protected readonly pretending = this.clock.pretending;
    /** The app's idea of today as `YYYY-MM-DD`, the format a date field holds. */
    protected readonly today = computed(() => toLocalDate(this.clock.now()));

    /** A test can only be sent to a device that has a push subscription, i.e. reminders on. */
    protected readonly remindersOn = computed(() => this.reminders.state() === 'on');

    /** The demo data waits for a confirming second tap: it can never be taken out again. */
    protected readonly demoArmed = signal(false);
    protected readonly demoMessage = signal<LocalText | undefined>(undefined);

    /** The outcome of the last test notification, and whether it failed. */
    protected readonly notice = signal<{ text: LocalText; failed: boolean } | undefined>(undefined);
    /** True while the test is on its way to the server, to prevent double taps. */
    protected readonly sending = signal(false);

    /**
     * Adds about two months of generated workouts, for exploring the app with data in it.
     * They mix with the user's own sets and cannot be taken out again, hence the second tap.
     */
    protected async loadDemo(): Promise<void> {
        if (!this.demoArmed()) {
            this.demoArmed.set(true);
            return;
        }
        this.demoArmed.set(false);
        // The demo ends "today" as the app sees it, so it also lines up with a test date.
        const events = generateDemoEvents(this.catalog(), this.clock.currentTime());
        const added = await this.log.merge(events);
        this.demoMessage.set({ en: TEXT.en.demoAdded(added), ru: TEXT.ru.demoAdded(added) });
    }

    /** Makes the whole app believe that today is `date` (`YYYY-MM-DD`). */
    protected pretendTodayIs(date: string): void {
        this.clock.pretendTodayIs(date);
    }

    protected backToRealTime(): void {
        this.clock.backToRealTime();
    }

    protected async sendTest(): Promise<void> {
        this.sending.set(true);
        const result = await this.reminders.sendTest();
        this.sending.set(false);
        this.notice.set(
            result.ok
                ? { text: { en: TEXT.en.sent, ru: TEXT.ru.sent }, failed: false }
                : { text: result.error, failed: true },
        );
    }
}
