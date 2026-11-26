import { DomainEvent, EventContext, IsoDateTime, envelope } from '@shared/domain/event';

/**
 * The user started their experience from scratch. From this moment on only what they do counts
 * for experience; everything before stays in the log, and in every other view, untouched.
 *
 * A fact with no payload: the moment itself (`occurredAt`) is the information. Resetting again
 * simply appends another one, and the latest wins.
 */
export type ProgressReset = DomainEvent<'ProgressReset'>;

export function resetProgress(context: EventContext): ProgressReset {
    return envelope('ProgressReset', 1, context);
}

/**
 * Projection: the moment experience counts from, the latest reset; `undefined` when the user
 * never reset, so all of their history counts.
 *
 * "Latest" by `occurredAt`, never by the order events were stored in, so every device agrees.
 * ISO 8601 UTC strings compare chronologically as plain strings.
 */
export function experienceEpoch(events: readonly DomainEvent[]): IsoDateTime | undefined {
    let epoch: IsoDateTime | undefined;
    for (const event of events) {
        if (event.type === 'ProgressReset' && (epoch === undefined || event.occurredAt > epoch)) {
            epoch = event.occurredAt;
        }
    }
    return epoch;
}
