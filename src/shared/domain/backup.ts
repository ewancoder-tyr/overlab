import { DomainEvent, isDomainEvent, toIso } from './event';
import { Result, fail, ok } from './result';

/**
 * A backup is simply the whole event log in a small JSON wrapper. Because the log is the only
 * source of truth, restoring it restores everything; and because merging is a set union by event
 * id, importing a backup into a device that already has data is always safe.
 */
export interface Backup {
    readonly format: 'overlab-events';
    readonly formatVersion: 1;
    readonly exportedAt: string;
    readonly events: readonly DomainEvent[];
}

export function createBackup(events: readonly DomainEvent[], now: Date): Backup {
    return { format: 'overlab-events', formatVersion: 1, exportedAt: toIso(now), events };
}

/** Reads a backup file's text. Events with a broken envelope reject the whole file. */
export function parseBackup(text: string): Result<readonly DomainEvent[]> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return fail({ en: 'The file is not valid JSON.', ru: 'Файл — не корректный JSON.' });
    }

    if (typeof parsed !== 'object' || parsed === null) {
        return fail({
            en: 'The file is not an OverLab backup.',
            ru: 'Это не резервная копия OverLab.',
        });
    }
    const candidate = parsed as Record<string, unknown>;
    if (candidate['format'] !== 'overlab-events' || !Array.isArray(candidate['events'])) {
        return fail({
            en: 'The file is not an OverLab backup.',
            ru: 'Это не резервная копия OverLab.',
        });
    }
    if (candidate['formatVersion'] !== 1) {
        return fail({
            en: 'This backup was made by a newer version of OverLab.',
            ru: 'Эта копия сделана более новой версией OverLab.',
        });
    }

    const events: unknown[] = candidate['events'];
    if (!events.every(isDomainEvent)) {
        return fail({
            en: 'The backup contains entries that are not valid events.',
            ru: 'В копии есть записи, которые не являются корректными событиями.',
        });
    }
    return ok(events);
}
