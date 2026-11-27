import { Schedule, Weekday } from '@shared/domain/schedule';
import { Language, Localized, plural } from '@shared/domain/language';

/** A day of the week as a chip shows it (`Mon`) and as a screen reader says it (`Monday`). */
export interface WeekdayName {
    readonly id: Weekday;
    readonly short: string;
    readonly name: string;
}

export const WEEKDAYS: Localized<readonly WeekdayName[]> = {
    en: [
        { id: 1, short: 'Mon', name: 'Monday' },
        { id: 2, short: 'Tue', name: 'Tuesday' },
        { id: 3, short: 'Wed', name: 'Wednesday' },
        { id: 4, short: 'Thu', name: 'Thursday' },
        { id: 5, short: 'Fri', name: 'Friday' },
        { id: 6, short: 'Sat', name: 'Saturday' },
        { id: 7, short: 'Sun', name: 'Sunday' },
    ],
    ru: [
        { id: 1, short: 'Пн', name: 'Понедельник' },
        { id: 2, short: 'Вт', name: 'Вторник' },
        { id: 3, short: 'Ср', name: 'Среда' },
        { id: 4, short: 'Чт', name: 'Четверг' },
        { id: 5, short: 'Пт', name: 'Пятница' },
        { id: 6, short: 'Сб', name: 'Суббота' },
        { id: 7, short: 'Вс', name: 'Воскресенье' },
    ],
};

const EVERY_DAY: Localized<string> = { en: 'Every day', ru: 'Каждый день' };

/**
 * A schedule in a few words, for a list row: `Every day`, `Every 2 days`, `Mon, Wed, Fri`.
 * All seven weekdays and "every 1 day" are the same days, so both read `Every day`.
 */
export function describeSchedule(language: Language, schedule: Schedule): string {
    if (schedule.kind === 'weekdays') {
        return schedule.weekdays.length === 7
            ? EVERY_DAY[language]
            : WEEKDAYS[language]
                  .filter((day) => schedule.weekdays.includes(day.id))
                  .map((day) => day.short)
                  .join(', ');
    }
    const days = schedule.everyDays;
    if (days === 1) {
        return EVERY_DAY[language];
    }
    return language === 'ru'
        ? // "Каждые 2 дня", "каждые 5 дней": the interval is at most 14, so never "каждый 21 день".
          `Каждые ${days} ${plural('ru', days, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })}`
        : `Every ${days} days`;
}
