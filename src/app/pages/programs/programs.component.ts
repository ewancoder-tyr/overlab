import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '@catalog/application/catalog.service';
import { SettingsService } from '@settings/application/settings.service';
import { Locale } from '@shared/application/locale.service';
import { Localized, plural } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';
import { ProgramsService } from '@training/application/programs.service';
import { MAX_PROGRAMS, MAX_PROGRAM_DAYS } from '@training/domain/program';
import { dayTitle, programSummary, programTitle } from './program-wording';

const TEXT = {
    en: {
        programs: 'Programs',
        intro: 'A program is your list of exercises for each day you train, in the order you do them, with the days it falls on and its own reminder. Whatever you log outside a program still counts everywhere.',
        solo: 'Solo',
        soloIntro:
            'Done outside workouts, like push-ups every morning. Solo sets never join a workout and keep a history of their own.',
        none: 'No programs yet.',
        days: (count: number) => `${count} ${plural('en', count, { one: 'day', other: 'days' })}`,
        exercises: (count: number) =>
            `${count} ${plural('en', count, { one: 'exercise', other: 'exercises' })}`,
        newProgram: 'New program',
        newSolo: 'New solo program',
        full: (max: number) => `That is all ${max}. Remove one to add another.`,
        saveWorkout: 'Save workout as',
        saveIntro:
            'Choose where the exercises of this workout go, in the order you did them. You can still change the list before saving.',
        asNewProgram: 'A new program',
        asNewDay: 'New day',
        replace: (day: string) => `Replace ${day}`,
    },
    ru: {
        programs: 'Программы',
        intro: 'Программа — это ваш список упражнений на каждый тренировочный день, в том порядке, в котором вы их делаете, с днями и своим напоминанием. Всё, что записано вне программы, по-прежнему везде учитывается.',
        solo: 'Соло',
        soloIntro:
            'Делается вне тренировок, как отжимания каждое утро. Соло-подходы не входят в тренировку и ведут свою историю.',
        none: 'Программ пока нет.',
        days: (count: number) =>
            `${count} ${plural('ru', count, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })}`,
        exercises: (count: number) =>
            `${count} ${plural('ru', count, { one: 'упражнение', few: 'упражнения', many: 'упражнений', other: 'упражнения' })}`,
        newProgram: 'Новая программа',
        newSolo: 'Новая соло-программа',
        full: (max: number) => `Это все ${max}. Удалите одну, чтобы добавить другую.`,
        saveWorkout: 'Сохранить тренировку как',
        saveIntro:
            'Выберите, куда пойдут упражнения этой тренировки, в том порядке, в котором вы их делали. Список можно поправить перед сохранением.',
        asNewProgram: 'Новую программу',
        asNewDay: 'Новый день',
        replace: (day: string) => `Заменить ${day}`,
    },
} satisfies Localized<unknown>;

/**
 * The list of programs, each row opening its editor.
 *
 * Opened with `?from=<start of a workout>` it asks one question instead: where to save that
 * workout's exercises (a new program, a new day of a program, or in place of a day). The answer
 * opens the editor with the list filled in; nothing is saved here.
 */
@Component({
    selector: 'olab-programs',
    imports: [RouterLink],
    templateUrl: './programs.component.html',
    styleUrl: './programs.component.scss',
})
export class ProgramsComponent {
    private readonly service = inject(ProgramsService);
    private readonly catalog = inject(CatalogService).catalog;
    private readonly settings = inject(SettingsService);
    private readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);

    /** Bound from `?from=`: the `startedAt` of the workout to save, when saving one. */
    readonly from = input<string>();

    private readonly rows = computed(() => {
        const language = this.language();
        const defaultTime = this.settings.preferences().reminderTime;
        return this.service.programs().map((program) => ({
            id: program.id,
            solo: program.solo,
            title: programTitle(program, this.catalog(), language),
            summary: programSummary(program, defaultTime, language),
            size: program.solo
                ? this.t().exercises(program.days[0]?.exercises.length ?? 0)
                : this.t().days(program.days.length),
            days: program.days.map((day, index) => ({
                id: day.id,
                title: dayTitle(index, language),
            })),
            canAddDay: program.days.length < MAX_PROGRAM_DAYS,
        }));
    });

    protected readonly regular = computed(() => this.rows().filter((row) => !row.solo));
    protected readonly solo = computed(() => this.rows().filter((row) => row.solo));
    protected readonly full = computed(() => this.rows().length >= MAX_PROGRAMS);
    protected readonly max = MAX_PROGRAMS;
}
