import { Language } from '@shared/domain/language';
import { GoogleSignIn } from '@sync/application/sync-ports';

/** OverLab's OAuth client id in Google Cloud. Public by design: it names the app, it proves nothing. */
const CLIENT_ID = '400839590162-24pngke3ov8rbi2f3forabpaufaosldg.apps.googleusercontent.com';
const SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/*
 * The small part of Google Identity Services' API that we use. The script defines a global
 * `google` object; `declare` tells TypeScript it exists without emitting any code.
 * Reference: https://developers.google.com/identity/gsi/web/reference/js-reference
 */
interface CredentialResponse {
    readonly credential: string;
}
interface GoogleIdentity {
    accounts: {
        id: {
            initialize(config: {
                client_id: string;
                callback: (response: CredentialResponse) => void;
            }): void;
            renderButton(parent: HTMLElement, options: Record<string, string>): void;
        };
    };
}
declare const google: GoogleIdentity;

/**
 * Google's "Sign in with Google" button (Google Identity Services).
 *
 * Its script is loaded only when the button is first shown, not with the app: users who never
 * sign in never download it, and the app starts offline without it. It is not cached by the
 * service worker either, which is right: signing in needs Google, so it needs the network.
 */
export class GoogleIdentitySignIn extends GoogleSignIn {
    private script: Promise<boolean> | undefined;
    /** The button's current listener. Google is initialised once, and calls whoever is listening. */
    private onCredential: ((credential: string) => void) | undefined;

    override async renderButton(
        host: HTMLElement,
        language: Language,
        onCredential: (credential: string) => void,
    ): Promise<boolean> {
        this.onCredential = onCredential;
        if (!(await this.load())) {
            return false;
        }
        host.replaceChildren(); // A language change draws the button again.
        google.accounts.id.renderButton(host, {
            type: 'standard',
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            text: 'signin_with',
            locale: language,
        });
        return true;
    }

    private load(): Promise<boolean> {
        this.script ??= new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = SCRIPT_URL;
            script.async = true;
            script.onload = () => {
                google.accounts.id.initialize({
                    client_id: CLIENT_ID,
                    callback: (response) => this.onCredential?.(response.credential),
                });
                resolve(true);
            };
            script.onerror = () => {
                // Forget the failed attempt, so the next visit to Settings tries again.
                script.remove();
                this.script = undefined;
                resolve(false);
            };
            document.head.append(script);
        });
        return this.script;
    }
}
