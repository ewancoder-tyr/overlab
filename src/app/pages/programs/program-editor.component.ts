import { Component, computed, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { CatalogService } from '@catalog/application/catalog.service';
import { ExerciseId, isCardio } from '@catalog/domain/exercise';
import { SettingsService } from '@settings/application/settings.service';
import { WEEKDAYS } from '@settings/presentation/schedule-wording';
import { Clock } from '@shared/application/clock.service';
import { Locale } from '@shared/application/locale.service';
import { LocalText, Localized, plural } from '@shared/domain/language';
import {
    MAX_EVERY_DAYS,
    Schedule,
    Weekday,
    addDays,
    toLocalDate,
    upcomingDays,
} from '@shared/domain/schedule';
import { LocalDatePipe, LocalizePipe, translations } from '@shared/presentation/i18n';
import { SlideConfirmComponent } from '@shared/presentation/slide-confirm/slide-confirm.component';
import { StepperComponent } from '@shared/presentation/stepper/stepper.component';
import { ProgramsService } from '@training/application/programs.service';
import { TrainingService } from '@training/application/training.service';
import {
    MAX_DAY_EXERCISES,
    MAX_PROGRAM_DAYS,
    MAX_PROGRAM_NAME_LENGTH,
    Program,
    ProgramDay,
    ProgramDayId,
    ProgramId,
    ProgramReminder,
} from '@training/domain/program';
import { WORKOUT_GAP_MS, Workout, exercisesOf } from '@training/domain/workout';
import { dayTitle } from './program-wording';

const TEXT = {
    en: {
        newProgram: 'New program',
        newSolo: 'New solo program',
        program: 'Program',
        soloProgram: 'Solo program',
        name: 'Name',
        namePlaceholder: 'Three-day split',
        soloNamePlaceholder: 'Named after its first exercise',
        solo: 'Solo: done outside workouts',
        soloDetail:
            'Its sets are logged as solo sets: they join no workout and keep a history of their own.',
        days: 'Which days',
        daysOfWeek: 'Days of the week',
        everyFewDays: 'Every few days',
        every: 'Every',
        dayUnit: (count: number) => plural('en', count, { one: 'day', other: 'days' }),
        countedFrom: 'Counted from',
        restart: '. Restart the count so that the next day is:',
        nextDay: 'Next day',
        today: 'Today',
        tomorrow: 'Tomorrow',
        nextDays: 'Next days',
        skipNote: 'When you do it on another day, the count restarts from that day by itself.',
        reminder: 'Reminder',
        reminderDefault: (time: string) => `Default (${time})`,
        reminderOwn: 'Own time',
        reminderOff: 'Off',
        remindAt: 'Remind me at',
        exercises: 'Exercises',
        programDays: 'Program days',
        addDay: 'Add a day',
        removeDay: 'Remove this day',
        emptyDay:
            'No exercises yet. Add them here, or just train on this day and save what you did.',
        addExercise: 'Add an exercise',
        chooseExercise: 'Choose…',
        favorites: 'Favorites',
        others: 'All other exercises',
        up: (name: string) => `Move ${name} up`,
        down: (name: string) => `Move ${name} down`,
        remove: (name: string) => `Remove ${name}`,
        save: 'Save',
        delete: 'Slide to delete the program',
        missing: 'This program no longer exists.',
    },
    ru: {
        newProgram: 'Новая программа',
        newSolo: 'Новая соло-программа',
        program: 'Программа',
        soloProgram: 'Соло-программа',
        name: 'Название',
        namePlaceholder: 'Трёхдневный сплит',
        soloNamePlaceholder: 'По первому упражнению',
        solo: 'Соло: вне тренировок',
        soloDetail:
            'Подходы записываются как соло: они не входят в тренировку и ведут свою историю.',
        days: 'В какие дни',
        daysOfWeek: 'Дни недели',
        everyFewDays: 'Раз в несколько дней',
        every: 'Раз в',
        dayUnit: (count: number) =>
            plural('ru', count, { one: 'день', few: 'дня', many: 'дней', other: 'дня' }),
        countedFrom: 'Отсчёт с',
        restart: '. Начать отсчёт заново, чтобы следующий день был:',
        nextDay: 'Следующий день',
        today: 'Сегодня',
        tomorrow: 'Завтра',
        nextDays: 'Ближайшие дни',
        skipNote: 'Если сделать её в другой день, отсчёт сам начнётся с того дня.',
        reminder: 'Напоминание',
        reminderDefault: (time: string) => `Общее (${time})`,
        reminderOwn: 'Своё время',
        reminderOff: 'Выкл.',
        remindAt: 'Напоминать в',
        exercises: 'Упражнения',
        programDays: 'Дни программы',
        addDay: 'Добавить день',
        removeDay: 'Убрать этот день',
        emptyDay:
            'Упражнений пока нет. Добавьте их здесь или просто потренируйтесь в этот день и сохраните сделанное.',
        addExercise: 'Добавить упражнение',
        chooseExercise: 'Выбрать…',
        favorites: 'Избранное',
        others: 'Все остальные упражнения',
        up: (name: string) => `Поднять: ${name}`,
        down: (name: string) => `Опустить: ${name}`,
        remove: (name: string) => `Убрать: ${name}`,
        save: 'Сохранить',
        delete: 'Сдвиньте, чтобы удалить программу',
        missing: 'Этой программы больше нет.',
    },
} satisfies Localized<unknown>;

/** What is being edited: the program as it will be saved, and the day whose list is shown. */
interface Editing {
    readonly program: Program;
    readonly dayId: ProgramDayId;
    /** False for a program that is not in the log yet. */
    readonly exists: boolean;
    /** The workout being saved as the shown day (`?from=`), which is then marked as that day. */
    readonly workout?: Workout;
}

/**
 * The editor of one program: its name, its days and reminder, and the ordered list of exercises
 * of each program day.
 *
 * Unlike Settings it has a Save button. A program is saved whole (`ProgramDefined` carries all
 * of it), and a list being reordered is not worth an event per tap.
 *
 * `/programs/new` starts a program; `?solo=1` makes it a solo one and `?exercise=` puts that
 * exercise in it. `?from=<start of a workout>` fills a day with what was done in that workout:
 * `day=new` adds a day, `day=<id>` replaces that day's list.
 */
@Component({
    selector: 'olab-program-editor',
    imports: [LocalDatePipe, LocalizePipe, SlideConfirmComponent, StepperComponent],
    templateUrl: './program-editor.component.html',
    styleUrl: './program-editor.component.scss',
})
export class ProgramEditorComponent {
    private readonly service = inject(ProgramsService);
    private readonly training = inject(TrainingService);
    private readonly catalogService = inject(CatalogService);
    private readonly settings = inject(SettingsService);
    private readonly clock = inject(Clock);
    private readonly router = inject(Router);
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    readonly programId = input.required<string>();
    readonly from = input<string>();
    readonly day = input<string>();
    readonly solo = input<string>();
    readonly exercise = input<string>();

    private readonly today = computed(() => toLocalDate(this.clock.now()));

    /**
     * The draft. A `linkedSignal` is a writable signal that is rebuilt when its `source`
     * changes: here only when the address does. The programs themselves are read `untracked`,
     * so the log changing underneath (a sync, the clock ticking) never wipes what was typed.
     */
    private readonly editing = linkedSignal<string, Editing | undefined>({
        source: () =>
            [this.programId(), this.from(), this.day(), this.solo(), this.exercise()].join('|'),
        computation: () => untracked(() => this.start()),
    });

    protected readonly program = computed(() => this.editing()?.program);
    protected readonly exists = computed(() => this.editing()?.exists === true);
    protected readonly maxNameLength = MAX_PROGRAM_NAME_LENGTH;

    protected readonly heading = computed(() => {
        const editing = this.editing();
        const t = this.t();
        if (editing?.exists === true) {
            return editing.program.solo ? t.soloProgram : t.program;
        }
        return editing?.program.solo === true ? t.newSolo : t.newProgram;
    });

    protected readonly defaultTime = computed(() => this.settings.preferences().reminderTime);
    /** What the time field shows: the program's own time, or the default until one is set. */
    protected readonly ownTime = computed(() => {
        const reminder = this.program()?.reminder;
        return reminder?.kind === 'at' ? reminder.time : this.defaultTime();
    });

    /** The seven day chips, each knowing whether it is switched on. */
    protected readonly weekdays = computed(() => {
        const schedule = this.program()?.schedule;
        const chosen = schedule?.kind === 'weekdays' ? schedule.weekdays : [];
        return WEEKDAYS[this.language()].map((day) => ({ ...day, on: chosen.includes(day.id) }));
    });

    /** The next few days, as proof that "every 3 days" means what the user thinks. */
    protected readonly upcoming = computed(() => {
        const schedule = this.program()?.schedule;
        return schedule === undefined ? [] : upcomingDays(schedule, this.today(), 5);
    });

    /** Which of Today / Tomorrow describes the schedule; undefined when the next day is later. */
    protected readonly nextOffset = computed(() => {
        const next = this.upcoming()[0];
        if (next === this.today()) {
            return 0;
        }
        return next === addDays(this.today(), 1) ? 1 : undefined;
    });

    /** The program days as tabs. */
    protected readonly dayTabs = computed(() => {
        const editing = this.editing();
        return (editing?.program.days ?? []).map((day, index) => ({
            id: day.id,
            title: dayTitle(index, this.language()),
            on: day.id === editing?.dayId,
        }));
    });
    protected readonly canAddDay = computed(
        () => (this.program()?.days.length ?? 0) < MAX_PROGRAM_DAYS,
    );

    private readonly shownDay = computed(() => {
        const editing = this.editing();
        return editing?.program.days.find((day) => day.id === editing.dayId);
    });

    /** The exercises of the shown day, in order. Ones the catalog does not know keep their id. */
    protected readonly exercises = computed(() => {
        const catalog = this.catalogService.catalog();
        const language = this.language();
        return (this.shownDay()?.exercises ?? []).map((id) => ({
            id,
            name: catalog.findExercise(id)?.name[language] ?? id,
        }));
    });

    /**
     * What can still be added to the shown day: favorites first, then everything else. Not what
     * is already listed, and no cardio in a solo program (it is never logged as solo sets).
     */
    protected readonly candidates = computed(() => {
        const listed = new Set(this.shownDay()?.exercises ?? []);
        const solo = this.program()?.solo === true;
        const favorites = this.catalogService.favorites();
        const language = this.language();
        const open = this.catalogService
            .catalog()
            .exercises.filter((exercise) => !listed.has(exercise.id))
            .filter((exercise) => !(solo && isCardio(exercise)))
            .map((exercise) => ({
                id: exercise.id,
                name: exercise.name[language],
                favorite: favorites.has(exercise.id),
            }));
        return {
            favorites: open.filter((exercise) => exercise.favorite),
            others: open.filter((exercise) => !exercise.favorite),
            full: listed.size >= MAX_DAY_EXERCISES,
        };
    });

    protected readonly error = signal<LocalText | undefined>(undefined);

    /** Builds the draft the page opens with. See the component's comment for the addresses. */
    private start(): Editing | undefined {
        const existing = this.service.programs().find((other) => other.id === this.programId());
        if (existing === undefined && this.programId() !== 'new') {
            return undefined;
        }
        const workout = this.training.workouts().find((other) => other.startedAt === this.from());
        const done = workout === undefined ? undefined : exercisesOf(workout);

        if (existing === undefined) {
            const solo = this.solo() !== undefined;
            const asked = this.catalogService.catalog().findExercise(this.exercise() as ExerciseId);
            const day: ProgramDay = {
                id: this.service.newId() as ProgramDayId,
                exercises: done ?? (asked === undefined ? [] : [asked.id]),
            };
            const program: Program = {
                id: this.service.newId() as ProgramId,
                name: '',
                solo,
                // A habit is usually daily; a gym program rarely is.
                schedule: solo
                    ? { kind: 'interval', everyDays: 1, startDate: this.today() }
                    : { kind: 'weekdays', weekdays: [1, 3, 5] },
                reminder: { kind: 'default' },
                days: [day],
            };
            return { program, dayId: day.id, exists: false, ...(workout ? { workout } : {}) };
        }

        const first = existing.days[0];
        if (done === undefined || workout === undefined || existing.solo) {
            return first && { program: existing, dayId: first.id, exists: true };
        }
        const target = existing.days.find((day) => day.id === this.day());
        const filled: ProgramDay = {
            id: target?.id ?? (this.service.newId() as ProgramDayId),
            exercises: done,
        };
        const days =
            target === undefined
                ? [...existing.days, filled]
                : existing.days.map((day) => (day.id === filled.id ? filled : day));
        return { program: { ...existing, days }, dayId: filled.id, exists: true, workout };
    }

    /** Changes the program being edited. `Partial` makes every field optional. */
    private change(changes: Partial<Program>): void {
        this.editing.update(
            (editing) => editing && { ...editing, program: { ...editing.program, ...changes } },
        );
    }

    /** Replaces the list of the shown day. */
    private changeExercises(update: (exercises: readonly ExerciseId[]) => ExerciseId[]): void {
        const editing = this.editing();
        if (editing !== undefined) {
            this.change({
                days: editing.program.days.map((day) =>
                    day.id === editing.dayId ? { ...day, exercises: update(day.exercises) } : day,
                ),
            });
        }
    }

    protected setName(name: string): void {
        this.change({ name });
    }

    protected setSolo(solo: boolean): void {
        this.change({ solo });
    }

    protected chooseWeekdays(): void {
        if (this.program()?.schedule.kind !== 'weekdays') {
            this.change({ schedule: { kind: 'weekdays', weekdays: [1, 3, 5] } });
        }
    }

    protected chooseInterval(): void {
        if (this.program()?.schedule.kind !== 'interval') {
            this.change({ schedule: { kind: 'interval', everyDays: 2, startDate: this.today() } });
        }
    }

    protected toggleDay(day: Weekday): void {
        const schedule = this.program()?.schedule;
        if (schedule?.kind !== 'weekdays') {
            return;
        }
        const weekdays = schedule.weekdays.includes(day)
            ? schedule.weekdays.filter((other) => other !== day)
            : [...schedule.weekdays, day];
        // Saving with no day left is refused by the factory; its message explains why.
        this.change({ schedule: { kind: 'weekdays', weekdays } });
    }

    protected setEveryDays(everyDays: number): void {
        this.changeInterval({ everyDays: Math.min(everyDays, MAX_EVERY_DAYS) });
    }

    /** Restarts the count so that the next day is today (offset 0) or tomorrow (offset 1). */
    protected startCycle(offset: number): void {
        this.changeInterval({ startDate: addDays(this.today(), offset) });
    }

    private changeInterval(changes: Partial<Extract<Schedule, { kind: 'interval' }>>): void {
        const schedule = this.program()?.schedule;
        if (schedule?.kind === 'interval') {
            this.change({ schedule: { ...schedule, ...changes } });
        }
    }

    protected setReminder(kind: ProgramReminder['kind']): void {
        this.change({ reminder: kind === 'at' ? { kind, time: this.ownTime() } : { kind } });
    }

    protected setReminderTime(time: string): void {
        this.change({ reminder: { kind: 'at', time } });
    }

    protected showDay(dayId: ProgramDayId): void {
        this.editing.update((editing) => editing && { ...editing, dayId });
    }

    protected addDay(): void {
        const editing = this.editing();
        if (editing !== undefined) {
            const day: ProgramDay = { id: this.service.newId() as ProgramDayId, exercises: [] };
            this.editing.set({
                ...editing,
                program: { ...editing.program, days: [...editing.program.days, day] },
                dayId: day.id,
            });
        }
    }

    protected removeDay(): void {
        const editing = this.editing();
        const days = editing?.program.days.filter((day) => day.id !== editing.dayId);
        const first = days?.[0];
        if (editing !== undefined && days !== undefined && first !== undefined) {
            this.editing.set({
                ...editing,
                program: { ...editing.program, days },
                dayId: first.id,
            });
        }
    }

    protected addExercise(id: string): void {
        if (id !== '') {
            this.changeExercises((exercises) => [...exercises, id as ExerciseId]);
        }
    }

    protected removeExercise(id: ExerciseId): void {
        this.changeExercises((exercises) => exercises.filter((other) => other !== id));
    }

    /** Moves an exercise one place up (`by` -1) or down (+1) by swapping it with its neighbour. */
    protected move(index: number, by: number): void {
        this.changeExercises((exercises) => {
            const moved = [...exercises];
            const one = moved[index];
            const other = moved[index + by];
            if (one !== undefined && other !== undefined) {
                moved[index] = other;
                moved[index + by] = one;
            }
            return moved;
        });
    }

    protected async save(): Promise<void> {
        const editing = this.editing();
        if (editing === undefined) {
            return;
        }
        const result = await this.service.define(editing.program);
        if (!result.ok) {
            this.error.set(result.error);
            return;
        }
        if (editing.workout !== undefined && !editing.program.solo) {
            await this.service.chooseDay(
                editing.program,
                editing.dayId,
                this.momentIn(editing.workout),
            );
        }
        // Saving a workout was started from where the workout is; anything else from the list.
        await this.router.navigateByUrl(editing.workout === undefined ? '/programs' : '/exercises');
    }

    /**
     * The moment to record the choice at, so that it marks `workout` (see `workoutDays`): now
     * while the workout is still in progress, otherwise its last activity, which is always
     * inside it.
     */
    private momentIn(workout: Workout): Date | undefined {
        const ended = Date.parse(workout.endedAt);
        return this.clock.currentTime().getTime() - ended < WORKOUT_GAP_MS
            ? undefined
            : new Date(ended);
    }

    protected async remove(): Promise<void> {
        const program = this.program();
        if (program !== undefined) {
            await this.service.remove(program.id);
            await this.router.navigateByUrl('/programs');
        }
    }
}
