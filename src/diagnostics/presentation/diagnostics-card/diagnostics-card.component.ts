import { Component, computed, inject, signal } from '@angular/core';
import { Diagnostics } from '@diagnostics/application/diagnostics.service';
import { formatEntry, formatTrace } from '@diagnostics/domain/trace';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';

const TEXT = {
    en: {
        heading: 'Diagnostics',
        intro: 'Records what the app does on this device (taps, page switches, slow moments and errors) to help track down a problem. Nothing leaves the device unless you copy it.',
        turnOn: 'Turn on',
        turnOff: 'Turn off',
        copy: 'Copy',
        copied: 'Copied.',
        clear: 'Clear',
        empty: 'Nothing recorded yet.',
    },
    ru: {
        heading: 'Диагностика',
        intro: 'Записывает, что приложение делает на этом устройстве (нажатия, переходы между страницами, задержки и ошибки), чтобы помочь найти проблему. Ничего не покидает устройство, пока вы сами не скопируете.',
        turnOn: 'Включить',
        turnOff: 'Выключить',
        copy: 'Копировать',
        copied: 'Скопировано.',
        clear: 'Очистить',
        empty: 'Пока ничего не записано.',
    },
} satisfies Localized<unknown>;

/** How many of the newest lines the card shows. Copy always takes the whole trace. */
const SHOWN_LINES = 100;

/** The diagnostics switch and trace, a part of the developer settings in Settings. */
@Component({
    selector: 'olab-diagnostics-card',
    templateUrl: './diagnostics-card.component.html',
    styleUrl: './diagnostics-card.component.scss',
})
export class DiagnosticsCardComponent {
    private readonly diagnostics = inject(Diagnostics);
    protected readonly t = translations(TEXT);

    protected readonly enabled = this.diagnostics.enabled;
    /** Newest first: on a phone the latest lines are the ones wanted, and they come first. */
    protected readonly lines = computed(() =>
        this.diagnostics.entries().slice(-SHOWN_LINES).reverse().map(formatEntry),
    );
    protected readonly copied = signal(false);

    protected toggle(): void {
        this.diagnostics.setEnabled(!this.enabled());
    }

    protected async copy(): Promise<void> {
        await navigator.clipboard.writeText(formatTrace(this.diagnostics.entries()));
        this.copied.set(true);
    }

    protected clear(): void {
        this.diagnostics.clear();
        this.copied.set(false);
    }
}
