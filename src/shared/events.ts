export type EventId = string & { readonly _brand: 'EventId' }

export function eventId(value: string) {
    return value as EventId;
}

export interface DomainEvent<TType extends string, TId extends EventId = EventId> {
    id: TId;
    type: TType;
    occurredAt: string;
}
