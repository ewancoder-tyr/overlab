/**
 * Port: a short buzz of the phone. The application layer decides WHEN to buzz (`RestAlert`, and
 * `TrainingService` when something is logged);
 * the infrastructure layer knows HOW (`navigator.vibrate`).
 *
 * An abstract class, not an interface, so that Angular can use it as an injection key.
 */
export abstract class Buzzer {
    /** Buzzes once, or does nothing where the device cannot. Never throws. */
    abstract buzz(): void;

    /**
     * A single short tick confirming a tap was taken: a set or cardio bout was logged. Much
     * shorter than `buzz()`, so it can never be mistaken for the rest alert. Never throws.
     */
    abstract tap(): void;
}
