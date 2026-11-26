import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GamificationService } from '@gamification/application/gamification.service';
import { LeaderboardSwitchComponent } from '@leaderboard/presentation/leaderboard-switch/leaderboard-switch.component';
import { CatalogService } from '@catalog/application/catalog.service';
import { Exercise, ExerciseId, isCardio } from '@catalog/domain/exercise';
import { RemindersService } from '@settings/application/reminders.service';
import { SettingsService } from '@settings/application/settings.service';
import {
    GymSchedule,
    MAX_EVERY_DAYS,
    Weekday,
    addDays,
    toLocalDate,
    upcomingGymDays,
} from '@settings/domain/gym-schedule';
import {
    CARDIO_GOAL_STEP_MINUTES,
    LIGHT_SET_PERCENT_STEP,
    MAX_CARDIO_GOAL_MINUTES,
    MAX_LIGHT_SET_PERCENT,
    MAX_REST_ALERT_SECONDS,
    MAX_SWITCH_REST_ALERT_SECONDS,
    MAX_STALL_INVOLVEMENT_PERCENT,
    MAX_STALL_THRESHOLD,
    MAX_TARGET_WINDOW_DAYS,
    MAX_VOLUME_TARGET_SETS,
    MAX_WORKOUT_ROTATION,
    MIN_CARDIO_GOAL_MINUTES,
    MIN_STALL_THRESHOLD,
    MIN_TARGET_WINDOW_DAYS,
    MIN_VOLUME_TARGET_SETS,
    REST_ALERT_STEP_SECONDS,
    STALL_INVOLVEMENT_PERCENT_STEP,
} from '@settings/domain/preferences';
import { MAX_SOLO_REMINDERS, defaultSoloReminder } from '@settings/domain/solo-reminder';
import { WEEKDAYS, describeSchedule } from '@settings/presentation/schedule-wording';
import { SoloReminderEditorComponent } from '@settings/presentation/solo-reminder-editor/solo-reminder-editor.component';
import { TrainingService } from '@training/application/training.service';
import { Clock } from '@shared/application/clock.service';
import { Locale } from '@shared/application/locale.service';
import { COLOR_SCHEME_IDS, ColorSchemeId } from '@shared/domain/color-scheme';
import { LANGUAGES, Language, LocalText, Localized, plural } from '@shared/domain/language';
import { Result } from '@shared/domain/result';
import {
    TRAINING_FOCUSES,
    TrainingFocus,
    includesCardio,
    includesLifting,
} from '@shared/domain/training-focus';
import { LocalDatePipe, LocalizePipe, translations } from '@shared/presentation/i18n';
import { StepperComponent } from '@shared/presentation/stepper/stepper.component';
import { formatElapsed } from '@training/domain/session-clock';
import { DeveloperMode } from './developer-mode';
import { DeveloperSettingsComponent } from './developer-settings/developer-settings.component';
import { CURRENT_VERSION } from '../../release-notes';

/**
 * Each language under its own name, so that someone who cannot read the current one still
 * finds theirs.
 */
const LANGUAGE_NAMES: Readonly<Record<Language, string>> = { en: 'English', ru: 'Русский' };

const russianDays = (count: number): string =>
    plural('ru', count, { one: 'день', few: 'дня', many: 'дней', other: 'дня' });
const russianWorkouts = (count: number): string =>
    plural('ru', count, {
        one: 'тренировка',
        few: 'тренировки',
        many: 'тренировок',
        other: 'тренировки',
    });

const TEXT = {
    en: {
        language: 'Language',
        experience: 'Experience',
        experienceIntro:
            'Experience for every working set and bonuses for beating last time; you and every exercise level up. Shown on the Week page; nothing you log changes.',
        on: 'On',
        countingAll: 'Counting all your history.',
        countingSince: 'Counting since',
        startOver: 'Start from scratch',
        startOverConfirm: 'Tap again to reset your experience',
        colorScheme: 'Colour scheme',
        colorSchemes: { dark: 'Dark', light: 'Light' } satisfies Record<ColorSchemeId, string>,
        focus: 'Training focus',
        focusIntro:
            'What you train. The app hides the rest; everything you log is still kept and counted.',
        focuses: {
            both: 'Lifting and cardio',
            lifting: 'Lifting only',
            cardio: 'Cardio only',
        } satisfies Record<TrainingFocus, string>,
        targets: 'Targets',
        stalls: 'Stalls',
        targetWindow: 'Count targets over',
        targetWindowIntro:
            'The volume target and the cardio goal are per this many days, counted back from now. 7 is a week.',
        volumeTarget: 'Sets per muscle group',
        volumeTargetIntro: (days: number) =>
            `Weighted sets each muscle group should get in ${days} ${plural('en', days, { one: 'day', other: 'days' })}: at least this many, at most double.`,
        lightSet: 'Light set counts as',
        lightSetIntro:
            'A set marked light (easy on purpose) is real work but far from failure, so in volume it counts as part of a set.',
        cardioGoal: 'Cardio goal',
        cardioGoalIntro: (days: number) =>
            `Minutes of cardio in ${days} ${plural('en', days, { one: 'day', other: 'days' })}, all exercises added up.`,
        min: 'min',
        gymDays: 'Gym days',
        howPlanned: 'How gym days are planned',
        daysOfWeek: 'Days of the week',
        everyFewDays: 'Every few days',
        trainEvery: 'Train every',
        days: (count: number) => plural('en', count, { one: 'day', other: 'days' }),
        countedFrom: 'Counted from',
        restart: '. Restart the count so that the next gym day is:',
        nextGymDay: 'Next gym day',
        today: 'Today',
        tomorrow: 'Tomorrow',
        nextGymDays: 'Next gym days',
        rotation: 'Workout rotation',
        rotateBetween: 'Rotate between',
        workouts: (count: number) => plural('en', count, { one: 'workout', other: 'workouts' }),
        sameEveryTime:
            'The same workout every time: the plan is what you did in your last workout.',
        inTurn: (count: number) =>
            `${count} workouts in turn: the plan is what you did ${count} workouts ago.`,
        restAlert: 'Rest alert',
        restAlertHint:
            'On the screen of the exercise you just did, the rest flashes yellow and the phone buzzes once at this time. It keeps counting.',
        switchRestAlertHint: 'Anywhere else: the Train page, another exercise, any other page.',
        restAlertAfter: 'Between sets',
        switchRestAlertAfter: 'Between exercises',
        off: 'Off',
        restAlertOff: 'Off: the rest still counts, but never buzzes or turns yellow.',
        advanced: 'Advanced',
        stallAfter: 'Stall warning after',
        sessions: (count: number) => plural('en', count, { one: 'session', other: 'sessions' }),
        stallIntro:
            'An exercise that has not beaten its last session this many times in a row is tagged STALLED on the Train page: time to change something.',
        stallOff: 'Off: exercises are never tagged as stalled.',
        stallInvolvement: 'Stall marks muscles involved over',
        stallInvolvementIntro:
            'On the Week page, a stalled exercise marks the muscle groups it trains by more than this. At 50%, a stalled bench press marks chest but not triceps.',
        reminders: 'Reminders',
        remindersIntro:
            'A roast on each gym day, on this device, quoting your latest numbers on the exercises planned for that workout. The reminder server gets only your gym days, this time, your language and those numbers.',
        remindAt: 'On gym days, remind me at',
        soloReminders: 'Solo reminders',
        soloIntro:
            'An alarm for one exercise you do outside workouts, like push-ups every morning, on its own days and at its own time. It only rings: nothing is tracked and nothing counts as missed. The reminder server also gets that exercise, its days and time, and your latest solo number on it.',
        addSolo: 'Add a reminder for',
        chooseExercise: 'Choose an exercise…',
        soloHabits: 'Your solo exercises',
        favorites: 'Favorites',
        noSoloCandidates:
            'Star an exercise in the Catalog, or log a solo set of it, and it will be offered here.',
        soloFull: (max: number) => `That is all ${max}. Remove one to add another.`,
        unsupported:
            'Reminders are not available here. Install OverLab to your home screen from the browser menu, then open it from there.',
        blocked:
            "Notifications are blocked for OverLab. Allow them in the browser's site settings, then come back.",
        turnOn: 'Turn on reminders',
        chooseDaysFirst: 'Choose your gym days or add a solo reminder first.',
        onForDevice: 'On for this device',
        turnOff: 'Turn off',
        about: 'About',
        aboutText: (version: string) => `OverLab version ${version}.`,
        whatsNew: "What's new",
        developerTapsLeft: (count: number) =>
            `${count} ${plural('en', count, { one: 'tap', other: 'taps' })} away from developer settings.`,
    },
    ru: {
        language: 'Язык',
        experience: 'Опыт',
        experienceIntro:
            'Опыт за каждый рабочий подход и бонусы за то, что обогнали прошлый раз; растут уровни ваш и каждого упражнения. Видно на странице «Неделя»; записанное не меняется.',
        on: 'Вкл.',
        countingAll: 'Учитывается вся история.',
        countingSince: 'Учитывается с',
        startOver: 'Начать с нуля',
        startOverConfirm: 'Нажмите ещё раз, чтобы сбросить опыт',
        colorScheme: 'Тема',
        colorSchemes: { dark: 'Тёмная', light: 'Светлая' } satisfies Record<ColorSchemeId, string>,
        focus: 'Что тренирую',
        focusIntro:
            'Что вы тренируете. Остальное приложение скроет; всё записанное по-прежнему хранится и учитывается.',
        focuses: {
            both: 'Силовые и кардио',
            lifting: 'Только силовые',
            cardio: 'Только кардио',
        } satisfies Record<TrainingFocus, string>,
        targets: 'Цели',
        stalls: 'Застой',
        targetWindow: 'Считать цели за',
        targetWindowIntro:
            'Цель по объёму и цель по кардио — на столько дней, считая назад от текущего момента. 7 — неделя.',
        volumeTarget: 'Подходов на мышцу',
        volumeTargetIntro: (days: number) =>
            `Взвешенные подходы, которые каждая группа мышц должна получить за ${days} ${russianDays(days)}: не меньше этого и не больше чем вдвое больше.`,
        lightSet: 'Лёгкий подход считается как',
        lightSetIntro:
            'Подход с отметкой «легко» (намеренно легче) — настоящая работа, но далеко от отказа, поэтому в объёме он считается частью подхода.',
        cardioGoal: 'Цель по кардио',
        cardioGoalIntro: (days: number) =>
            `Минуты кардио за ${days} ${russianDays(days)}, все упражнения вместе.`,
        min: 'мин',
        gymDays: 'Дни тренировок',
        howPlanned: 'Как планируются дни тренировок',
        daysOfWeek: 'Дни недели',
        everyFewDays: 'Каждые N дней',
        trainEvery: 'Тренироваться каждые',
        days: russianDays,
        countedFrom: 'Отсчёт от',
        restart: '. Начните отсчёт заново, чтобы следующая тренировка была:',
        nextGymDay: 'Следующая тренировка',
        today: 'Сегодня',
        tomorrow: 'Завтра',
        nextGymDays: 'Ближайшие тренировки',
        rotation: 'Чередование тренировок',
        rotateBetween: 'Чередовать',
        workouts: russianWorkouts,
        sameEveryTime:
            'Каждый раз одна и та же тренировка: план — то, что вы делали в прошлый раз.',
        inTurn: (count: number) =>
            `${count} ${russianWorkouts(count)} по очереди: план — то, что вы делали ${count} ${russianWorkouts(count)} назад.`,
        restAlert: 'Сигнал отдыха',
        restAlertHint:
            'На экране упражнения, которое вы только что делали, отдых в это время мигает жёлтым, а телефон один раз вибрирует. Отсчёт продолжается.',
        switchRestAlertHint: 'Везде ещё: страница «Зал», другое упражнение, любая другая страница.',
        restAlertAfter: 'Между подходами',
        switchRestAlertAfter: 'Между упражнениями',
        off: 'Выкл.',
        restAlertOff: 'Выключен: отдых считается, но без вибрации и без жёлтого.',
        advanced: 'Дополнительно',
        stallAfter: 'Застой после',
        // A session is a workout of that exercise; Russian says «тренировка» for both.
        sessions: russianWorkouts,
        stallIntro:
            'Упражнение, в котором вы столько раз подряд не превзошли прошлую тренировку, получает метку «ЗАСТОЙ» на странице «Зал»: пора что-то менять.',
        stallOff: 'Выключено: упражнения никогда не помечаются застоем.',
        stallInvolvement: 'Застой отмечает мышцы с участием больше',
        stallInvolvementIntro:
            'На странице «Неделя» упражнение в застое отмечает группы мышц, которые оно нагружает больше чем на столько. При 50% застой в жиме лёжа отмечает грудь, но не трицепс.',
        reminders: 'Напоминания',
        remindersIntro:
            'Подколка в каждый день тренировки на этом устройстве, с вашими последними числами в упражнениях, запланированных на эту тренировку. Сервер напоминаний получает только дни тренировок, это время, язык и эти числа.',
        remindAt: 'В дни тренировок напоминать в',
        soloReminders: 'Соло-напоминания',
        soloIntro:
            'Будильник для одного упражнения вне тренировок, например отжиманий каждое утро, в свои дни и в своё время. Он только звонит: ничего не отслеживается и ничего не считается пропущенным. Сервер напоминаний дополнительно получает это упражнение, его дни и время и ваше последнее соло-число в нём.',
        addSolo: 'Добавить напоминание для',
        chooseExercise: 'Выберите упражнение…',
        soloHabits: 'Ваши соло-упражнения',
        favorites: 'Избранное',
        noSoloCandidates:
            'Отметьте упражнение звёздочкой в Каталоге или запишите соло-подход, и оно появится здесь.',
        soloFull: (max: number) => `Это все ${max}. Уберите одно, чтобы добавить другое.`,
        unsupported:
            'Здесь напоминания недоступны. Установите OverLab на главный экран через меню браузера и откройте его оттуда.',
        blocked:
            'Уведомления для OverLab заблокированы. Разрешите их в настройках сайта в браузере и возвращайтесь.',
        turnOn: 'Включить напоминания',
        chooseDaysFirst: 'Сначала выберите дни тренировок или добавьте соло-напоминание.',
        onForDevice: 'Включены на этом устройстве',
        turnOff: 'Выключить',
        about: 'О приложении',
        aboutText: (version: string) => `OverLab версии ${version}.`,
        whatsNew: 'Что нового',
        developerTapsLeft: (count: number) =>
            `До настроек для разработчиков: ${count} ${plural('ru', count, { one: 'нажатие', few: 'нажатия', many: 'нажатий', other: 'нажатия' })}.`,
    },
} satisfies Localized<unknown>;

/**
 * Settings: the everyday choices (language, look, training focus, gym days, rotation,
 * reminders, experience), the fine tuning under Advanced, and About.
 *
 * There is no "Save" button. Every control records its change straight away as a
 * `PreferenceChanged` event, and the page re-renders from the resulting preferences.
 */
@Component({
    selector: 'olab-settings',
    imports: [
        DeveloperSettingsComponent,
        LeaderboardSwitchComponent,
        LocalDatePipe,
        LocalizePipe,
        RouterLink,
        SoloReminderEditorComponent,
        StepperComponent,
    ],
    templateUrl: './settings.component.html',
    styleUrl: './settings.component.scss',
})
export class SettingsComponent {
    private readonly settings = inject(SettingsService);
    private readonly reminders = inject(RemindersService);
    private readonly catalog = inject(CatalogService);
    private readonly training = inject(TrainingService);
    private readonly clock = inject(Clock);
    private readonly developerMode = inject(DeveloperMode);
    private readonly gamificationService = inject(GamificationService);

    protected readonly t = translations(TEXT);
    /** The language on screen: the one chosen, or the browser's until then. */
    protected readonly language = inject(Locale).language;
    protected readonly languages = LANGUAGES.map((id) => ({ id, name: LANGUAGE_NAMES[id] }));

    protected readonly version = CURRENT_VERSION;
    protected readonly developerUnlocked = this.developerMode.unlocked;
    protected readonly developerTapsLeft = this.developerMode.tapsLeft;

    protected readonly colorScheme = computed(() => this.settings.preferences().colorScheme);
    protected readonly colorSchemes = computed(() =>
        COLOR_SCHEME_IDS.map((id) => ({ id, name: this.t().colorSchemes[id] })),
    );

    protected readonly gamification = computed(() => this.settings.preferences().gamification);
    /** The latest "start from scratch", if any. Reading it does not derive any experience. */
    protected readonly experienceEpoch = this.gamificationService.epoch;
    /** True after the first tap on "Start from scratch", waiting for the confirming second. */
    protected readonly resetArmed = signal(false);

    protected readonly focus = computed(() => this.settings.preferences().trainingFocus);
    protected readonly focuses = computed(() =>
        TRAINING_FOCUSES.map((id) => ({ id, name: this.t().focuses[id] })),
    );
    protected readonly showsLifting = computed(() => includesLifting(this.focus()));
    protected readonly showsCardio = computed(() => includesCardio(this.focus()));

    protected readonly volumeTarget = computed(() => this.settings.preferences().volumeTargetSets);
    protected readonly minVolumeTarget = MIN_VOLUME_TARGET_SETS;
    protected readonly maxVolumeTarget = MAX_VOLUME_TARGET_SETS;
    /** The range the minimum gives: `10–20`. The maximum is always double. */
    protected readonly formatVolumeTarget = (sets: number): string =>
        `${String(sets)}–${String(sets * 2)}`;

    protected readonly targetWindow = computed(() => this.settings.preferences().targetWindowDays);
    protected readonly minTargetWindow = MIN_TARGET_WINDOW_DAYS;
    protected readonly maxTargetWindow = MAX_TARGET_WINDOW_DAYS;

    protected readonly lightSetPercent = computed(
        () => this.settings.preferences().lightSetPercent,
    );
    protected readonly lightSetStep = LIGHT_SET_PERCENT_STEP;
    protected readonly maxLightSetPercent = MAX_LIGHT_SET_PERCENT;

    protected readonly cardioGoal = computed(() => this.settings.preferences().cardioGoalMinutes);
    protected readonly minCardioGoal = MIN_CARDIO_GOAL_MINUTES;
    protected readonly maxCardioGoal = MAX_CARDIO_GOAL_MINUTES;
    protected readonly cardioGoalStep = CARDIO_GOAL_STEP_MINUTES;
    protected readonly formatCardioGoal = (minutes: number): string =>
        `${String(minutes)} ${this.t().min}`;
    protected readonly schedule = computed(() => this.settings.preferences().gymSchedule);
    protected readonly reminderTime = computed(() => this.settings.preferences().reminderTime);
    protected readonly reminderState = this.reminders.state;
    /** Whether there is anything to remind about: gym days, or at least one solo reminder. */
    protected readonly canRemind = this.reminders.hasPlan;

    /**
     * The solo reminders as rows: the exercise's name and its days and time in a few words.
     * A reminder whose exercise the catalog does not know (from a newer version of the app) is
     * still listed, under its id, so that it can be removed.
     */
    protected readonly soloReminders = computed(() => {
        const catalog = this.catalog.catalog();
        const language = this.language();
        return this.settings.soloReminders().map((reminder) => ({
            exerciseId: reminder.exerciseId,
            // Settings keeps bare ids; here, where the page knows the catalog too, they meet.
            name:
                catalog.findExercise(reminder.exerciseId as ExerciseId)?.name[language] ??
                reminder.exerciseId,
            summary: `${describeSchedule(language, reminder.schedule)} · ${reminder.time}`,
        }));
    });

    /** The solo reminder whose editor is open, by exercise id. One at a time. */
    protected readonly openSolo = signal<string | undefined>(undefined);

    protected readonly soloFull = computed(
        () => this.settings.soloReminders().length >= MAX_SOLO_REMINDERS,
    );
    protected readonly maxSolo = MAX_SOLO_REMINDERS;

    /**
     * The exercises a solo reminder can be added for, in two groups: those already done solo
     * lately (the Solo list of the Train page), then the other favorites. Not cardio, which is
     * never logged as solo sets, and not those that have a reminder already.
     */
    protected readonly soloCandidates = computed(() => {
        const taken = new Set(this.settings.soloReminders().map((other) => other.exerciseId));
        const habits = this.training.standaloneHabits();
        const favorites = this.catalog.favorites();
        const free = this.catalog
            .catalog()
            .exercises.filter((exercise) => !isCardio(exercise) && !taken.has(exercise.id));
        const option = (exercise: Exercise): { id: ExerciseId; name: string } => ({
            id: exercise.id,
            name: exercise.name[this.language()],
        });
        return {
            habits: free.filter((exercise) => habits.has(exercise.id)).map(option),
            favorites: free
                .filter((exercise) => favorites.has(exercise.id) && !habits.has(exercise.id))
                .map(option),
        };
    });
    protected readonly rotation = computed(() => this.settings.preferences().workoutRotation);
    protected readonly restAlert = computed(() => this.settings.preferences().restAlertSeconds);
    protected readonly restAlertStep = REST_ALERT_STEP_SECONDS;
    protected readonly maxRestAlert = MAX_REST_ALERT_SECONDS;
    protected readonly switchRestAlert = computed(
        () => this.settings.preferences().switchRestAlertSeconds,
    );
    protected readonly maxSwitchRestAlert = MAX_SWITCH_REST_ALERT_SECONDS;
    /**
     * The stepper shows seconds as `m:ss`, and 0 as "Off". An arrow function in a field keeps
     * `this`, so the template can hand it to the stepper as it is.
     */
    protected readonly formatRestAlert = (seconds: number): string =>
        seconds === 0 ? this.t().off : formatElapsed(seconds * 1000);
    protected readonly stallThreshold = computed(() => this.settings.preferences().stallThreshold);
    protected readonly maxStallThreshold = MAX_STALL_THRESHOLD;
    protected readonly stallInvolvement = computed(
        () => this.settings.preferences().stallInvolvementPercent,
    );
    protected readonly stallInvolvementStep = STALL_INVOLVEMENT_PERCENT_STEP;
    protected readonly maxStallInvolvement = MAX_STALL_INVOLVEMENT_PERCENT;
    /** `50%`: the row's name says what it is a percentage of. */
    protected readonly formatPercent = (percent: number): string => `${String(percent)}%`;
    /** A plain number shown read-only, so the stepper's buttons are the only way to change it. */
    protected readonly formatNumber = (value: number): string => String(value);
    /** The number, or "Off" for 0; the word "sessions" goes in the stepper's unit. */
    protected readonly formatStallThreshold = (sessions: number): string =>
        sessions === 0 ? this.t().off : String(sessions);
    protected readonly stallUnit = computed(() => {
        const sessions = this.stallThreshold();
        return sessions === 0 ? undefined : this.t().sessions(sessions);
    });

    private readonly today = computed(() => toLocalDate(this.clock.now()));

    /** The seven day chips, each knowing whether it is switched on. */
    protected readonly weekdays = computed(() => {
        const schedule = this.schedule();
        const chosen = schedule?.kind === 'weekdays' ? schedule.weekdays : [];
        return WEEKDAYS[this.language()].map((day) => ({ ...day, on: chosen.includes(day.id) }));
    });

    /**
     * Proof that the schedule means what the user thinks: the next few gym days, as dates. Shown
     * only for "every few days"; with fixed weekdays the lit chips already say it.
     */
    protected readonly upcoming = computed(() => {
        const schedule = this.schedule();
        return schedule === undefined ? [] : upcomingGymDays(schedule, this.today(), 5);
    });

    /**
     * Which of the Today / Tomorrow options describes the current schedule: 0 when today is a
     * gym day, 1 when tomorrow is the next one, undefined when the next gym day is later still
     * (then neither option is lit). It is read back from the schedule rather than remembered
     * from the last tap, so it stays right as the days pass and after a reload.
     */
    protected readonly nextGymDayOffset = computed(() => {
        const next = this.upcoming()[0];
        if (next === this.today()) {
            return 0;
        }
        return next === addDays(this.today(), 1) ? 1 : undefined;
    });

    /** The last problem with the schedule or time controls. */
    protected readonly error = signal<LocalText | undefined>(undefined);
    /**
     * Why the last reminder action failed. Success needs no message: the card itself switches
     * between "On for this device" and the Turn on button.
     */
    protected readonly reminderError = signal<LocalText | undefined>(undefined);
    /** True while a reminder action is talking to the server, to prevent double taps. */
    protected readonly busy = signal(false);

    protected async setLanguage(language: Language): Promise<void> {
        this.showError(await this.settings.setLanguage(language));
    }

    protected async setColorScheme(scheme: ColorSchemeId): Promise<void> {
        this.showError(await this.settings.setColorScheme(scheme));
    }

    protected async setGamification(on: boolean): Promise<void> {
        this.resetArmed.set(false);
        this.showError(await this.settings.setGamification(on));
    }

    /** The first tap arms the button; the second starts experience from scratch. */
    protected async resetExperience(): Promise<void> {
        if (!this.resetArmed()) {
            this.resetArmed.set(true);
            return;
        }
        this.resetArmed.set(false);
        await this.gamificationService.reset();
    }

    protected async setFocus(focus: TrainingFocus): Promise<void> {
        this.showError(await this.settings.setTrainingFocus(focus));
    }

    protected async setVolumeTarget(sets: number): Promise<void> {
        this.showError(await this.settings.setVolumeTarget(sets));
    }

    protected async setLightSetPercent(percent: number): Promise<void> {
        this.showError(await this.settings.setLightSetPercent(percent));
    }

    protected async setStallInvolvement(percent: number): Promise<void> {
        this.showError(await this.settings.setStallInvolvementPercent(percent));
    }

    protected async setTargetWindow(days: number): Promise<void> {
        this.showError(await this.settings.setTargetWindow(days));
    }

    protected async setCardioGoal(minutes: number): Promise<void> {
        this.showError(await this.settings.setCardioGoal(minutes));
    }

    protected chooseWeekdays(): void {
        if (this.schedule()?.kind !== 'weekdays') {
            // A common three-day split as the starting point; the chips adjust it.
            void this.save({ kind: 'weekdays', weekdays: [1, 3, 5] });
        }
    }

    protected chooseInterval(): void {
        if (this.schedule()?.kind !== 'interval') {
            void this.save({ kind: 'interval', everyDays: 2, startDate: this.today() });
        }
    }

    protected toggleDay(day: Weekday): void {
        const schedule = this.schedule();
        if (schedule?.kind !== 'weekdays') {
            return;
        }
        const weekdays = schedule.weekdays.includes(day)
            ? schedule.weekdays.filter((other) => other !== day)
            : [...schedule.weekdays, day];
        // Removing the last day is refused by the factory; its message explains why.
        void this.save({ kind: 'weekdays', weekdays });
    }

    protected setEveryDays(everyDays: number): void {
        const schedule = this.schedule();
        if (schedule?.kind === 'interval') {
            void this.save({ ...schedule, everyDays: Math.min(everyDays, MAX_EVERY_DAYS) });
        }
    }

    /** Restarts the cycle so that today (offset 0) or tomorrow (offset 1) is a gym day. */
    protected startCycle(offset: number): void {
        const schedule = this.schedule();
        if (schedule?.kind === 'interval') {
            void this.save({ ...schedule, startDate: addDays(this.today(), offset) });
        }
    }

    protected async setRotation(rotation: number): Promise<void> {
        // The stepper has no upper limit of its own, so the page holds the value in range.
        const clamped = Math.min(Math.max(Math.round(rotation), 1), MAX_WORKOUT_ROTATION);
        this.showError(await this.settings.setWorkoutRotation(clamped));
    }

    protected async setRestAlert(seconds: number): Promise<void> {
        this.showError(await this.settings.setRestAlert(seconds));
    }

    protected async setSwitchRestAlert(seconds: number): Promise<void> {
        this.showError(await this.settings.setSwitchRestAlert(seconds));
    }

    /**
     * The stepper counts in ones, but 1 is not a valid threshold (one bad day is not a stall).
     * It stands in for the step between Off and 2: stepping down from 2 lands on it and means
     * Off, stepping up from Off lands on it and means 2.
     */
    protected async setStallThreshold(sessions: number): Promise<void> {
        const next =
            sessions > 0 && sessions < MIN_STALL_THRESHOLD
                ? this.stallThreshold() === 0
                    ? MIN_STALL_THRESHOLD
                    : 0
                : Math.min(Math.round(sessions), MAX_STALL_THRESHOLD);
        this.showError(await this.settings.setStallThreshold(next));
    }

    protected async setTime(time: string): Promise<void> {
        this.showError(await this.settings.setReminderTime(time));
    }

    protected toggleSolo(exerciseId: string): void {
        this.openSolo.update((open) => (open === exerciseId ? undefined : exerciseId));
    }

    /** Adds a solo reminder as every day in the morning, and opens it for adjusting. */
    protected async addSolo(exerciseId: string): Promise<void> {
        if (exerciseId === '') {
            return;
        }
        const result = await this.settings.setSoloReminder(
            defaultSoloReminder(exerciseId, this.today()),
        );
        this.reminderError.set(result.ok ? undefined : result.error);
        if (result.ok) {
            this.openSolo.set(exerciseId);
        }
    }

    protected async enableReminders(): Promise<void> {
        await this.act(() => this.reminders.enable());
    }

    protected async disableReminders(): Promise<void> {
        await this.act(() => this.reminders.disable());
    }

    protected tapAbout(): void {
        this.developerMode.tap();
    }

    private async save(schedule: GymSchedule): Promise<void> {
        this.showError(await this.settings.setGymSchedule(schedule));
    }

    private showError(result: Result<unknown>): void {
        this.error.set(result.ok ? undefined : result.error);
    }

    /** Runs one reminder action and reports it if it failed. */
    private async act(action: () => Promise<Result<void>>): Promise<void> {
        this.busy.set(true);
        const result = await action();
        this.busy.set(false);
        this.reminderError.set(result.ok ? undefined : result.error);
    }
}
