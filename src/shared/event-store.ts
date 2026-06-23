import { DomainEvent } from "./events";

export interface EventStore {
    getAll(): Promise<DomainEvent<string>[]>;
    append(event: DomainEvent<string>): Promise<void>;
}
