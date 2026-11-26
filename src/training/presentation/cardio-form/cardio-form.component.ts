import { Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { Exercise, cardioKindOf } from '@catalog/domain/exercise';
import { Locale } from '@shared/application/locale.service';
import { LocalText, Localized, formatNumber } from '@shared/domain/language';
import { LocalizePipe, translations } from '@shared/presentation/i18n';
import { LogButtonComponent } from '@shared/presentation/log-button/log-button.component';
import { WheelPickerComponent } from '@shared/presentation/wheel-picker/wheel-picker.component';
import { CardioDraft, CardioTotals, INCLINE_STEP, MAX_INCLINE } from '@training/domain/cardio';

const TEXT = {
    en: {
        distance: 'Distance',
        m: 'm',
        time: 'Time',
        minutes: 'Minutes',
        seconds: 'Seconds',
        minSec: 'min:sec',
        calories: 'Calories',
        kcal: 'kcal',
        hint: 'Fill in what you tracked. One number is enough.',
        timedHint: 'How long it lasted.',
        displayHint: 'Type what the display shows. One number is enough.',
        displaySince: (logged: string) =>
            `Type what the display shows now. Already logged: ${logged}.`,
        incline: 'Incline',
        inclineOn: 'Incline on',
        log: 'Log cardio',
        logSegment: 'Log segment',
        logTime: 'Log time',
    },
    ru: {
        distance: 'Дистанция',
        m: 'м',
        time: 'Время',
        minutes: 'Минуты',
        seconds: 'Секунды',
        minSec: 'мин:сек',
        calories: 'Калории',
        kcal: 'ккал',
        hint: 'Заполните то, что записали. Достаточно одного числа.',
        timedHint: 'Сколько это длилось.',
        displayHint: 'Введите то, что на экране дорожки. Достаточно одного числа.',
        displaySince: (logged: string) =>
            `Введите то, что на экране сейчас. Уже записано: ${logged}.`,
        incline: 'Наклон',
        inclineOn: 'Наклон включён',
        log: 'Записать',
        logSegment: 'Записать отрезок',
        logTime: 'Записать',
    },
} satisfies Localized<unknown>;

/** The incline a treadmill starts on the wheel with, before any was ever logged. */
const FIRST_INCLINE = 5;

/** Every detent of the wheel: 0.5, 1, 1.5 and so on up to the maximum. Flat is the switch off. */
const INCLINES = Array.from(
    { length: MAX_INCLINE / INCLINE_STEP },
    (_, index) => (index + 1) * INCLINE_STEP,
);

/** A field left empty means "not tracked"; anything else must be a number. */
function numberIn(text: string): number | undefined {
    const trimmed = text.trim();
    // `Number('abc')` is NaN. It is passed on as it is: the factory rejects it with a message.
    return trimmed === '' ? undefined : Number(trimmed);
}

/**
 * What a treadmill segment adds: the display shows the totals since the machine was started,
 * so what was logged before is taken off. A number that is not above what is already logged
 * can only be a display that was reset in between, and is taken as it stands.
 */
function since(shown: number | undefined, already: number | undefined): number | undefined {
    return shown === undefined || already === undefined || shown <= already
        ? shown
        : shown - already;
}

/**
 * Logging a cardio bout. What it asks for depends on the exercise's cardio kind:
 * - `distance` (the usual): distance, time and calories, any of which may be left empty;
 * - `timed` (a sauna): the time alone;
 * - `treadmill`: the same three numbers, read off the machine's display, plus the incline of
 *   the segment. See "Treadmill rule" in docs/rules/cardio.md.
 *
 * Unlike the set form this one is typed, not stepped: nobody wants to tap "+" up to 5230 metres.
 * The fields open the numeric keypad and show last time's numbers as placeholders, so the
 * numbers to beat are in front of you while you type today's.
 */
@Component({
    selector: 'olab-cardio-form',
    imports: [LocalizePipe, LogButtonComponent, WheelPickerComponent],
    templateUrl: './cardio-form.component.html',
    styleUrl: './cardio-form.component.scss',
})
export class CardioFormComponent {
    readonly exercise = input.required<Exercise>();
    /** Last session's totals, shown as placeholders. */
    readonly last = input<CardioTotals>();
    /** How many bouts are logged today. The fields empty themselves whenever this changes. */
    readonly entries = input(0);
    /**
     * Treadmill only: today's segments so far, added up. The display keeps counting from the
     * start, so these are taken off what is typed (see `since`).
     */
    readonly soFar = input<CardioTotals>();
    /** `soFar` in words (`2 km · 20:00`), for the hint. Worded by the parent. */
    readonly soFarText = input<string>();
    /** Treadmill only: the incline last used on this exercise, which the wheel starts on. */
    readonly lastIncline = input<number>();
    /** Treadmill only: whether the segment before this one was inclined. */
    readonly inclined = input(false);
    readonly error = input<LocalText>();
    readonly logged = output<CardioDraft>();

    protected readonly t = translations(TEXT);
    private readonly language = inject(Locale).language;

    protected readonly kind = computed(() => cardioKindOf(this.exercise()));
    protected readonly inclines = INCLINES;
    /** `6`, `2.5` or, in Russian, `2,5`: how a detent is written on the wheel. */
    protected readonly formatIncline = computed(() => {
        const language = this.language();
        return (value: number): string => formatNumber(language, value);
    });

    /*
     * `linkedSignal` with a `source`: an ordinary writable signal that is reset to '' every time
     * `entries` changes. That is how the form learns that a bout was really saved (a rejected one
     * does not change the count, so what was typed stays there to be corrected).
     */
    private readonly emptied = { source: this.entries, computation: () => '' };
    protected readonly distance = linkedSignal(this.emptied);
    protected readonly minutes = linkedSignal(this.emptied);
    protected readonly seconds = linkedSignal(this.emptied);
    protected readonly calories = linkedSignal(this.emptied);

    /*
     * The incline is remembered, because it rarely changes: the wheel starts on the one last
     * logged, and the switch starts as the previous segment left it. Both are `linkedSignal`s,
     * so they follow the log until the user touches them and again after the next segment.
     */
    protected readonly incline = linkedSignal(() => this.lastIncline() ?? FIRST_INCLINE);
    protected readonly inclineOn = linkedSignal(() => this.inclined());

    protected readonly hint = computed(() => {
        const t = this.t();
        const soFar = this.soFarText();
        switch (this.kind()) {
            case 'timed':
                return t.timedHint;
            case 'treadmill':
                return soFar === undefined ? t.displayHint : t.displaySince(soFar);
            case 'distance':
                return t.hint;
        }
    });

    protected readonly logLabel = computed(() => {
        const t = this.t();
        const kind = this.kind();
        return kind === 'timed' ? t.logTime : kind === 'treadmill' ? t.logSegment : t.log;
    });

    /** Turning the wheel is choosing an incline: it switches the incline on. */
    protected pickIncline(value: number): void {
        this.incline.set(value);
        this.inclineOn.set(true);
    }

    protected submit(): void {
        const treadmill = this.kind() === 'treadmill';
        const already = treadmill ? this.soFar() : undefined;
        const minutes = numberIn(this.minutes());
        const seconds = numberIn(this.seconds());
        // Either time field alone is enough: "30 min" or "45 sec".
        const shownSeconds =
            minutes === undefined && seconds === undefined
                ? undefined
                : (minutes ?? 0) * 60 + (seconds ?? 0);

        const meters = since(numberIn(this.distance()), already?.distanceMeters);
        const durationSeconds = since(shownSeconds, already?.durationSeconds);
        const calories = since(numberIn(this.calories()), already?.calories);

        // Spread conditionally: with `exactOptionalPropertyTypes` an optional property must be
        // absent rather than explicitly `undefined`.
        this.logged.emit({
            exerciseId: this.exercise().id,
            ...(meters === undefined ? {} : { distance: { value: meters, unit: 'm' as const } }),
            ...(durationSeconds === undefined ? {} : { durationSeconds }),
            ...(calories === undefined ? {} : { calories }),
            // Flat is an incline too: 0, so that every segment of a treadmill says its own.
            ...(treadmill ? { incline: this.inclineOn() ? this.incline() : 0 } : {}),
        });
    }

    /** Placeholder for the minutes field: last time's whole minutes. */
    protected lastMinutes(): string {
        const seconds = this.last()?.durationSeconds;
        return seconds === undefined ? '' : String(Math.floor(seconds / 60));
    }

    /** Placeholder for the seconds field: what is left of last time after the whole minutes. */
    protected lastSeconds(): string {
        const seconds = this.last()?.durationSeconds;
        return seconds === undefined ? '' : String(seconds % 60).padStart(2, '0');
    }
}
