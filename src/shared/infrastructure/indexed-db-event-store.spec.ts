import 'fake-indexeddb/auto';
import { envelope } from '@shared/domain/event';
import { contextAt } from '../../testing/fixtures';
import { IndexedDbEventStore } from './indexed-db-event-store';

describe('IndexedDbEventStore', () => {
    it('returns appended events from a fresh instance (they survive a restart)', async () => {
        const first = envelope('A', 1, contextAt('2026-11-11T09:00:00Z'));
        const second = envelope('B', 1, contextAt('2026-11-11T10:00:00Z'));

        await new IndexedDbEventStore().append([first, second]);
        const loaded = await new IndexedDbEventStore().loadAll();

        expect(loaded).toEqual(expect.arrayContaining([first, second]));
    });

    it('is idempotent: appending the same event twice stores it once', async () => {
        const store = new IndexedDbEventStore();
        const event = envelope('C', 1, contextAt('2026-11-11T11:00:00Z'));

        await store.append([event]);
        await store.append([event]);
        const loaded = await store.loadAll();

        expect(loaded.filter((stored) => stored.id === event.id)).toHaveLength(1);
    });
});
