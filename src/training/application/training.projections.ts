import { DomainEvent } from "@shared/events";
import { isSetPerformed, isSetVoided } from "@training/domain/events";

export function countTotalSets(events: DomainEvent<string>[]): number {
    const performed = new Set(events.filter(isSetPerformed).map(e => e.id));
    events.filter(isSetVoided).forEach(e => performed.delete(e.voidedSetId));
    return performed.size;
}