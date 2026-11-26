import { LocationStrategy } from '@angular/common';
import {
    ApplicationConfig,
    effect,
    inject,
    isDevMode,
    provideAppInitializer,
    provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
    PreloadAllModules,
    TitleStrategy,
    provideRouter,
    withComponentInputBinding,
    withHashLocation,
    withPreloading,
} from '@angular/router';
import { ReplaceOnlyLocationStrategy, handleBack } from './back-navigation';
import { provideServiceWorker } from '@angular/service-worker';
import { AnalyticsService } from '@analytics/application/analytics.service';
import { volumeTarget } from '@analytics/domain/weekly-volume';
import { CatalogService } from '@catalog/application/catalog.service';
import { ExerciseId } from '@catalog/domain/exercise';
import { GamificationService } from '@gamification/application/gamification.service';
import { RemindersService } from '@settings/application/reminders.service';
import { SettingsService } from '@settings/application/settings.service';
import { Clock } from '@shared/application/clock.service';
import { EventLog } from '@shared/application/event-log.service';
import { Locale } from '@shared/application/locale.service';
import { ColorSchemes } from '@shared/application/color-scheme.service';
import { provideReminders } from '@settings/infrastructure/reminder.providers';
import { provideBrowserStorage } from '@shared/infrastructure/storage.providers';
import { provideSync } from '@sync/infrastructure/sync.providers';
import { LeaderboardService } from '@leaderboard/application/leaderboard.service';
import { provideLeaderboard } from '@leaderboard/infrastructure/leaderboard.providers';
import { provideDiagnostics } from '@diagnostics/infrastructure/diagnostics.providers';
import { loadExtras } from './extras';
import { TrainingService } from '@training/application/training.service';
import { Buzzer } from '@training/application/buzzer';
import { RestAlert } from '@training/application/rest-alert.service';
import { VibrationBuzzer } from '@training/infrastructure/vibration-buzzer';
import { ScreenWakeLock } from '@shared/infrastructure/screen-wake-lock';
import { routes } from './app.routes';
import { LocalizedTitleStrategy } from './localized-title.strategy';
import { generateDemoEvents } from './demo/demo-data';
import { holdWakeLockWhile } from './wake-lock';

/**
 * True when the app runs from a single local HTML file (`pnpm build:single`) instead of a web
 * server. A file has no server to answer `/exercises`, so routes go after a `#` instead, and
 * service workers are not available.
 */
const RUNS_FROM_FILE = !location.protocol.startsWith('http');

/**
 * Loads the event log. The single-file build is a demo, so when it starts with nothing stored it
 * fills itself with generated history; the hosted app always starts empty.
 */
async function loadEventLog(): Promise<void> {
    const log = inject(EventLog);
    const catalog = inject(CatalogService).catalog;
    const clock = inject(Clock);
    await log.load();
    if (RUNS_FROM_FILE && log.status() === 'ready' && log.events().length === 0) {
        await log.merge(generateDemoEvents(catalog(), clock.currentTime()));
    }
}

/**
 * The workout rotation is a preference (settings), but the plan it produces belongs to
 * training, and those two contexts must not know each other. The shell passes the number across.
 */
function feedWorkoutRotation(): void {
    const settings = inject(SettingsService);
    const training = inject(TrainingService);
    effect(() => {
        training.setRotation(settings.preferences().workoutRotation);
    });
}

/**
 * The language is a preference (settings), but every context speaks it, and `shared` cannot know
 * settings. The shell passes the choice to `Locale`; `undefined` (never chosen) means that the
 * app follows the browser's language.
 */
function feedLanguage(): void {
    const settings = inject(SettingsService);
    const locale = inject(Locale);
    effect(() => {
        locale.use(settings.preferences().language);
    });
}

/**
 * The colour scheme is a preference (settings), and `ColorSchemes` (shared) puts it on the page;
 * `shared` cannot know settings, so the shell passes the choice across, like the language.
 */
function feedColorScheme(): void {
    const settings = inject(SettingsService);
    const schemes = inject(ColorSchemes);
    effect(() => {
        schemes.choose(settings.preferences().colorScheme);
    });
}

/**
 * Reminders tease the user with numbers for the exercises planned next. The settings context
 * must not know about training, so the shell, which knows both, passes the lines across. The
 * effect re-runs whenever the lines change.
 */
function feedReminderHype(): void {
    const analytics = inject(AnalyticsService);
    const reminders = inject(RemindersService);
    effect(() => {
        reminders.setHype(analytics.overloadHype());
    });
}

/**
 * Solo reminders are kept by settings as bare exercise ids. The name to put on the notification
 * is the catalog's, and the numbers to roast with come from the exercise's standalone history,
 * so the shell passes both across, as it does the hype. An exercise the catalog does not know
 * gets no fact, and its reminder is then not sent.
 */
function feedSoloReminderFacts(): void {
    const settings = inject(SettingsService);
    const analytics = inject(AnalyticsService);
    const catalog = inject(CatalogService).catalog;
    const language = inject(Locale).language;
    const reminders = inject(RemindersService);
    effect(() => {
        reminders.setSoloFacts(
            settings.soloReminders().flatMap((reminder) => {
                // Settings does not know the catalog's id type; this is where the two meet.
                const exerciseId = reminder.exerciseId as ExerciseId;
                const exercise = catalog().findExercise(exerciseId);
                if (exercise === undefined) {
                    return [];
                }
                const hype = analytics.soloHypeOf(exerciseId);
                return [
                    {
                        exerciseId,
                        exercise: exercise.name[language()],
                        ...(hype === undefined ? {} : { hype }),
                    },
                ];
            }),
        );
    });
}

/**
 * The rest alerts are preferences (settings), but rest is a training matter. As with the rotation,
 * the shell passes the numbers across. Injecting `RestAlert` here also creates it at start-up, so
 * it buzzes whichever page is open.
 */
function feedRestAlert(): void {
    const settings = inject(SettingsService);
    const restAlert = inject(RestAlert);
    effect(() => {
        const preferences = settings.preferences();
        restAlert.setAlerts({
            sameExercise: preferences.restAlertSeconds,
            switchExercise: preferences.switchRestAlertSeconds,
        });
    });
}

/**
 * The stall threshold and the stall involvement are preferences (settings), but stall detection
 * belongs to analytics. As with the rotation, the shell passes the numbers across.
 */
function feedStallThreshold(): void {
    const settings = inject(SettingsService);
    const analytics = inject(AnalyticsService);
    effect(() => {
        const preferences = settings.preferences();
        analytics.setStallThreshold(preferences.stallThreshold);
        // Settings stores a whole percent; analytics compares with involvement ratios (0 to 1).
        analytics.setStallInvolvement(preferences.stallInvolvementPercent / 100);
    });
}

/**
 * The weekly targets are preferences (settings), but weekly volume and weekly cardio belong to
 * analytics. As with the stall threshold, the shell passes them across. Settings stores only the
 * minimum of the volume target; analytics turns it into the range (maximum double the minimum).
 */
function feedWeeklyTargets(): void {
    const settings = inject(SettingsService);
    const analytics = inject(AnalyticsService);
    effect(() => {
        const preferences = settings.preferences();
        analytics.setVolumeTarget(volumeTarget(preferences.volumeTargetSets));
        analytics.setCardioGoal(preferences.cardioGoalMinutes);
        // The targets mean "per this many days", so the window travels with them.
        analytics.setWindowDays(preferences.targetWindowDays);
        // Settings stores a whole percent; analytics counts in fractions of a set.
        analytics.setLightSetWeight(preferences.lightSetPercent / 100);
    });
}

/**
 * Experience follows two preferences that weekly volume and stalls use too: what a light set is
 * worth and the stall threshold. Settings and gamification must not know each other, so the
 * shell passes them across, as it does for analytics.
 */
function feedGamificationRules(): void {
    const settings = inject(SettingsService);
    const gamification = inject(GamificationService);
    effect(() => {
        const preferences = settings.preferences();
        gamification.setRules({
            lightSetWeight: preferences.lightSetPercent / 100,
            stallThreshold: preferences.stallThreshold,
        });
    });
}

/**
 * The leaderboard is of people playing the game, so it follows the gamification preference:
 * off, it stops, and the account leaves the board. Settings and the leaderboard must not know
 * each other, so the shell passes it across.
 */
function feedLeaderboard(): void {
    const settings = inject(SettingsService);
    const leaderboard = inject(LeaderboardService);
    effect(() => {
        leaderboard.setEnabled(settings.preferences().gamification);
    });
}

/**
 * The training focus is a preference (settings), but which exercises it hides is a catalog
 * rule. The shell passes it to the catalog, the lowest context that needs it; the pages read it
 * from there.
 */
function feedTrainingFocus(): void {
    const settings = inject(SettingsService);
    const catalog = inject(CatalogService);
    effect(() => {
        catalog.setFocus(settings.preferences().trainingFocus);
    });
}

/**
 * Keeps the screen on while the workout time runs: from the first set until 10 minutes after
 * the last one. A browser concern driven by a training signal, so the shell wires it.
 */
function keepScreenOnDuringWorkouts(): void {
    const training = inject(TrainingService);
    holdWakeLockWhile(() => training.workoutTime()?.running === true, new ScreenWakeLock());
}

/**
 * The composition root: the one place where abstractions are bound to implementations and
 * application-wide features are switched on.
 */
export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        // `withComponentInputBinding` passes route parameters to components as inputs.
        // `withPreloading(PreloadAllModules)` fetches every lazy page in the background once the
        // first screen is up. Without it a page's file is fetched on the first tap of its tab,
        // and the router shows nothing until it arrives. That fetch goes through the service
        // worker, which the phone stops when idle; restarting it can take a second or more,
        // and the tab seemed to hang. The files are already cached for offline use, so
        // preloading costs no extra download, only loading them a little earlier.
        provideRouter(
            [...routes],
            withComponentInputBinding(),
            withPreloading(PreloadAllModules),
            ...(RUNS_FROM_FILE ? [withHashLocation()] : []),
        ),
        // The service worker caches the app so it starts offline. Disabled in development,
        // where caching would get in the way of live reload.
        provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode() && !RUNS_FROM_FILE,
            registrationStrategy: 'registerWhenStable:30000',
        }),
        { provide: TitleStrategy, useClass: LocalizedTitleStrategy },
        provideBrowserStorage(),
        // Load the event log before the first screen renders, so no view ever shows an empty
        // history for a moment.
        provideAppInitializer(loadEventLog),
        provideAppInitializer(feedLanguage),
        provideAppInitializer(feedColorScheme),
        provideReminders(),
        // Optional cloud sync. It only reads and merges the event log, so the app is complete
        // without it (see docs/sync.md, "Sync").
        provideSync(),
        // Optional leaderboard, on top of sync's sign-in and gamification's experience. It is
        // the one online-first feature: it keeps nothing but a cached copy (see
        // docs/leaderboard.md, "Leaderboard").
        provideLeaderboard(),
        provideAppInitializer(feedLeaderboard),
        // Optional on-device diagnostics, switched on at the bottom of Settings.
        provideDiagnostics(),
        // Whatever this installation serves beside the app, if anything (see extras.ts).
        provideAppInitializer(loadExtras),
        provideAppInitializer(feedWorkoutRotation),
        provideAppInitializer(feedReminderHype),
        provideAppInitializer(feedSoloReminderFacts),
        provideAppInitializer(feedStallThreshold),
        provideAppInitializer(feedWeeklyTargets),
        provideAppInitializer(feedTrainingFocus),
        provideAppInitializer(feedGamificationRules),
        { provide: Buzzer, useClass: VibrationBuzzer },
        provideAppInitializer(feedRestAlert),
        provideAppInitializer(keepScreenOnDuringWorkouts),
        // The phone's back button goes up one level, and nothing is added to history
        // (see back-navigation.ts).
        { provide: LocationStrategy, useClass: ReplaceOnlyLocationStrategy },
        provideAppInitializer(handleBack),
    ],
};
