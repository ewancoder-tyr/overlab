import { Catalog } from '@catalog/domain/catalog';
import { describeSchedule } from '@settings/presentation/schedule-wording';
import { Language, Localized } from '@shared/domain/language';
import { TimeOfDay } from '@shared/domain/schedule';
import { Program } from '@training/domain/program';

/** Words about programs that more than one page needs. */

const UNNAMED: Localized<string> = { en: 'Program', ru: 'Программа' };
const DAY: Localized<string> = { en: 'Day', ru: 'День' };
const NO_REMINDER: Localized<string> = { en: 'no reminder', ru: 'без напоминания' };

/**
 * What a program is called on screen and on its reminder: its name or, when it has none (a
 * solo program made from a habit never needed one), the name of its first exercise.
 */
export function programTitle(program: Program, catalog: Catalog, language: Language): string {
    if (program.name !== '') {
        return program.name;
    }
    const first = program.days.flatMap((day) => day.exercises)[0];
    const exercise = first === undefined ? undefined : catalog.findExercise(first);
    return exercise?.name[language] ?? UNNAMED[language];
}

/** Days have no names of their own: they are `Day 1`, `Day 2` by position. */
export function dayTitle(index: number, language: Language): string {
    return `${DAY[language]} ${index + 1}`;
}

/**
 * A program's days and reminder in a few words, for a list row: `Mon, Wed, Fri · 15:00`.
 * `defaultTime` is the time programs ring at unless they have their own.
 */
export function programSummary(
    program: Program,
    defaultTime: TimeOfDay,
    language: Language,
): string {
    const reminder = program.reminder;
    const time =
        reminder.kind === 'off'
            ? NO_REMINDER[language]
            : reminder.kind === 'at'
              ? reminder.time
              : defaultTime;
    return `${describeSchedule(language, program.schedule)} · ${time}`;
}
