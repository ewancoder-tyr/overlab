import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { ExperienceCelebrationComponent } from '@gamification/presentation/experience-celebration/experience-celebration.component';
import { ExperienceLinesComponent } from '@gamification/presentation/experience-lines/experience-lines.component';
import { SettingsService } from '@settings/application/settings.service';
import { Clock } from '@shared/application/clock.service';
import { EventLog } from '@shared/application/event-log.service';
import { Localized } from '@shared/domain/language';
import { LocalDatePipe, translations } from '@shared/presentation/i18n';
import { SwitchOnTouchDirective } from './switch-on-touch.directive';

const TEXT = {
    en: {
        home: 'OverLab home',
        newVersion: 'A new version is ready.',
        update: 'Update',
        testDate: 'Test date:',
        inThePast: 'Logging in the past:',
        backToNow: 'Back to now',
        realTime: 'Real time',
        loadFailed: 'Your data could not be loaded',
        loadFailedDetail:
            'The app could not read its storage on this device. Nothing has been deleted. Close and reopen the app; if this keeps happening, do not log new sets until it is resolved.',
        main: 'Main',
        week: 'Week',
        train: 'Train',
        catalog: 'Catalog',
        data: 'Data',
        settings: 'Settings',
    },
    ru: {
        home: 'OverLab, главная',
        newVersion: 'Готова новая версия.',
        update: 'Обновить',
        testDate: 'Тестовая дата:',
        inThePast: 'Запись в прошлом:',
        backToNow: 'К настоящему',
        realTime: 'Настоящее время',
        loadFailed: 'Не удалось загрузить ваши данные',
        loadFailedDetail:
            'Приложение не смогло прочитать хранилище на этом устройстве. Ничего не удалено. Закройте и снова откройте приложение; если это повторяется, не записывайте новые подходы, пока проблема не решится.',
        main: 'Главное меню',
        week: 'Неделя',
        // "Зал" (gym): "Тренировка" is too long for a fifth of a narrow phone.
        train: 'Зал',
        catalog: 'Каталог',
        data: 'Данные',
        settings: 'Настройки',
    },
} satisfies Localized<unknown>;

/** The application shell: header, navigation and the routed page. */
@Component({
    selector: 'olab-root',
    imports: [
        ExperienceCelebrationComponent,
        ExperienceLinesComponent,
        LocalDatePipe,
        RouterLink,
        RouterLinkActive,
        RouterOutlet,
        SwitchOnTouchDirective,
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class App {
    private readonly clock = inject(Clock);
    private readonly settings = inject(SettingsService);
    protected readonly t = translations(TEXT);

    protected readonly status = inject(EventLog).status;
    /** True while a test date is set in the developer settings; the shell then says so on every page. */
    protected readonly pretending = this.clock.pretending;
    /** True while the user logs something done earlier (History, "Log on this day"). */
    protected readonly inThePast = this.clock.inThePast;
    protected readonly now = this.clock.now;
    /**
     * Gamification is a preference. While it is on, the shell hosts its "+XP" and level-up
     * animations and the two experience lines on the screen's edges, so they show on every
     * page, whichever one the experience was earned on.
     */
    protected readonly gamification = computed(() => this.settings.preferences().gamification);

    private readonly updates = inject(SwUpdate);
    private readonly router = inject(Router);
    /**
     * True once a newer version of the app has been downloaded and is waiting.
     *
     * The service worker keeps serving the version the app started with, so that its files
     * always match each other; the new one takes over on the next start. The shell offers to
     * do that now rather than reloading by itself, which could interrupt logging a set.
     *
     * The one exception is the "What's new" page. A tap on the "new version" notification
     * opens it in the OLD version, which would list everything except the news. Nothing can be
     * lost on that page, so there the app switches over by itself.
     */
    protected readonly updateReady = signal(false);

    constructor() {
        // No service worker in development or in the single-file build: nothing to update.
        if (!this.updates.isEnabled) {
            return;
        }
        // `versionUpdates` is an RxJS stream of what the service worker is doing. The shell
        // lives as long as the app does, so the subscription never needs to be closed.
        this.updates.versionUpdates.subscribe((event) => {
            if (event.type !== 'VERSION_READY') {
                return;
            }
            if (this.router.url.startsWith('/whats-new')) {
                void this.update();
            } else {
                this.updateReady.set(true);
            }
        });
        // Ask at once instead of waiting for the worker's own schedule: the app may have been
        // opened from a "new version" notification. And ask again every time the app comes
        // back to the foreground: a phone keeps an app alive for days without restarting it,
        // and an app that never restarts would otherwise never look.
        const check = (): void => {
            void this.updates.checkForUpdate().catch(() => false);
        };
        check();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                check();
            }
        });
    }

    /** Switches to the downloaded version and restarts the app on it. */
    protected async update(): Promise<void> {
        await this.updates.activateUpdate();
        location.reload();
    }

    protected backToRealTime(): void {
        this.clock.backToRealTime();
    }
}
