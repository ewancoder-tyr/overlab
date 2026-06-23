import { Service } from "@angular/core";
import { EventStore } from "@shared/event-store";
import { DomainEvent } from "@shared/events";

const STORAGE_KEY = 'overlab:events';

@Service()
export class LocalStorageEventStore implements EventStore {
    getAll(): Promise<DomainEvent<string>[]> {
        const raw = localStorage.getItem(STORAGE_KEY);
        return Promise.resolve(raw ? JSON.parse(raw) : []);
    }

    append(event: DomainEvent<string>): Promise<void> {
        const raw = localStorage.getItem(STORAGE_KEY);
        const events: DomainEvent<string>[] = raw ? JSON.parse(raw) : [];
        events.push(event);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
        return Promise.resolve();
    }
}
