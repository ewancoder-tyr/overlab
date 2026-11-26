import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';

/** Where an installation's own script is looked for, beside the app (see `deploy/nginx.conf`). */
const EXTRAS_URL = 'extras/extras.js';

/**
 * Loads the installation's extras, if it has any: one optional script that whoever hosts the app
 * may serve beside it, to add something of their own without building the app again. It is not
 * part of the app and not in this repository; without it, which is the usual case, nothing
 * happens.
 *
 * The script is an ES module that runs once the app has started. It is given nothing and may
 * rely on nothing but the page itself.
 *
 * It is asked for with `fetch` first, because a server that answers every unknown address with
 * `index.html` (the development server does) would otherwise have the browser run a web page as
 * a script.
 */
export function loadExtras(): void {
    const document = inject(DOCUMENT);
    // Not awaited: the app never waits for extras, and never fails for want of them.
    void fetch(EXTRAS_URL)
        .then((response) => {
            const type = response.headers.get('Content-Type') ?? '';
            if (!response.ok || !type.includes('javascript')) {
                return;
            }
            const script = document.createElement('script');
            script.type = 'module';
            script.src = EXTRAS_URL;
            document.head.append(script);
        })
        .catch(() => undefined); // Offline, or opened from a file: no extras.
}
