import { Buzzer } from '@training/application/buzzer';

/** Two short pulses: noticeable in a pocket, but not an alarm. */
const PATTERN = [200, 100, 200];

/** One brief tick, felt in the hand holding the phone, like a key press. */
const TAP_MS = 30;

/**
 * The Vibration API. iOS Safari has none, so there the rest pill turning yellow is the whole
 * alert. Some browsers also refuse to vibrate before the user has touched the page.
 */
export class VibrationBuzzer extends Buzzer {
    buzz(): void {
        vibrate(PATTERN);
    }

    tap(): void {
        vibrate(TAP_MS);
    }
}

function vibrate(pattern: number | number[]): void {
    try {
        // `in` rather than calling it directly: the type says it always exists, but it
        // does not on every browser.
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    } catch {
        // A buzz is a nicety; failing to buzz must never break logging.
    }
}
