import { LocalText, Localized } from '@shared/domain/language';
import notes from './release-notes.json';

/**
 * One released version of the app and what changed in it, for the "What's new" page.
 *
 * The data lives in `release-notes.json`, newest version first, because two readers need it:
 * this app, and the reminder server, which is built with a copy of it and announces the newest
 * version to every device (`reminder-server/announce.go`). To release: add an entry at the top
 * of that file, then push. See docs/releases.md.
 *
 * Every text is in every language: the page shows the reader's, and the notification goes to
 * each device in the language it registered with.
 */
export interface Release {
    readonly version: string;
    /** The day it was released, as `YYYY-MM-DD`. */
    readonly date: string;
    /** One sentence, used as the text of the "new version" notification. */
    readonly summary: LocalText;
    readonly changes: Localized<readonly string[]>;
}

export const RELEASES: readonly Release[] = notes;

/** The version this build of the app is. */
export const CURRENT_VERSION = RELEASES[0]?.version ?? '';
