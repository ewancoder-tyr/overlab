import { LocalText } from '@shared/domain/language';

/**
 * The character's title at each level, 1 to 30: a gym-floor career from fresh meat to legend.
 * Past the last one the title stays: a legend has nowhere further to go, but levels still count.
 *
 * The Russian titles are nouns that stand on their own, with no form that depends on the
 * lifter's gender (the app knows nobody's).
 */
export const TITLES: readonly LocalText[] = [
    { en: 'Fresh Meat', ru: 'Свежее мясо' },
    { en: 'Gym Rookie', ru: 'Новобранец зала' },
    { en: 'Form Student', ru: 'Ученик техники' },
    { en: 'Plate Carrier', ru: 'Носильщик блинов' },
    { en: 'Rep Grinder', ru: 'Добытчик повторов' },
    { en: 'Chalk Dust', ru: 'Меловая пыль' },
    { en: 'Bench Regular', ru: 'Завсегдатай скамьи' },
    { en: 'Pump Chaser', ru: 'Охотник за пампом' },
    { en: 'Iron Apprentice', ru: 'Подмастерье железа' },
    { en: 'Barbell Brawler', ru: 'Боец со штангой' },
    { en: 'Rack Warden', ru: 'Хранитель стойки' },
    { en: 'Volume Dealer', ru: 'Торговец объёмом' },
    { en: 'Overload Disciple', ru: 'Адепт перегрузки' },
    { en: 'Chalk Alchemist', ru: 'Алхимик мела' },
    { en: 'Plate Breaker', ru: 'Крушитель блинов' },
    { en: 'Iron Veteran', ru: 'Ветеран железа' },
    { en: 'Supreme Gym Rat', ru: 'Верховная качалочная крыса' },
    { en: 'Deadlift Demon', ru: 'Демон становой' },
    { en: 'Hypertrophy Scientist', ru: 'Учёный гипертрофии' },
    { en: 'Lab Champion', ru: 'Чемпион лаборатории' },
    { en: 'Iron Knight', ru: 'Железный рыцарь' },
    { en: 'Barbell Baron', ru: 'Барон штанги' },
    { en: 'Squat Warlord', ru: 'Полководец приседа' },
    { en: 'Muscle Architect', ru: 'Архитектор мышц' },
    { en: 'Iron Titan', ru: 'Железный титан' },
    { en: 'Overlord of Overload', ru: 'Повелитель перегрузки' },
    { en: 'Plate Colossus', ru: 'Колосс блинов' },
    { en: 'Mythic Lifter', ru: 'Мифический атлет' },
    { en: 'Iron Demigod', ru: 'Полубог железа' },
    { en: 'Legend of the Lab', ru: 'Легенда лаборатории' },
];

/** The title of a character level: that level's, or the last one's beyond level 30. */
export function titleOf(level: number): LocalText {
    const index = Math.min(Math.max(level, 1), TITLES.length) - 1;
    // `TITLES` is never empty, so the fallback is only there for the type checker.
    return TITLES[index] ?? { en: '', ru: '' };
}
