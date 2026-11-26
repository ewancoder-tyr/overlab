import { XpReason } from '@gamification/domain/experience';
import { Localized } from '@shared/domain/language';

/**
 * What each reason for experience is called, shared by the celebration (which names only the
 * bonuses) and the history (which lists every reason, the plain sets included).
 */
export const REASON_NAMES: Localized<Record<XpReason, string>> = {
    en: {
        'weight-record': 'Weight record',
        'rep-record': 'Rep record',
        'cardio-record': 'Record',
        'stall-broken': 'Stall broken',
        beaten: 'Beat last time',
        'cardio-matched': 'Matched last time',
        failure: 'Failure',
        set: 'Sets',
        'cardio-time': 'Cardio minutes',
    },
    ru: {
        'weight-record': 'Рекорд веса',
        'rep-record': 'Рекорд повторов',
        'cardio-record': 'Рекорд',
        'stall-broken': 'Застой пробит',
        beaten: 'Лучше, чем в прошлый раз',
        'cardio-matched': 'Не хуже прошлого раза',
        failure: 'До отказа',
        set: 'Подходы',
        'cardio-time': 'Минуты кардио',
    },
};
