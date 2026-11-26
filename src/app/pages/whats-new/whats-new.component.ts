import { Component, inject } from '@angular/core';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';
import { LocalDatePipe, LocalizePipe, translations } from '@shared/presentation/i18n';
import { RELEASES } from '../../release-notes';

const TEXT: Localized<{ heading: string; thisVersion: string; version: string }> = {
    en: { heading: "What's new", thisVersion: 'This version · ', version: 'Version' },
    ru: { heading: 'Что нового', thisVersion: 'Эта версия · ', version: 'Версия' },
};

/**
 * The version history: what changed in each release, newest first. The "new version"
 * notification opens this page.
 */
@Component({
    selector: 'olab-whats-new',
    imports: [LocalDatePipe, LocalizePipe],
    templateUrl: './whats-new.component.html',
    styleUrl: './whats-new.component.scss',
})
export class WhatsNewComponent {
    protected readonly releases = RELEASES;
    protected readonly language = inject(Locale).language;
    protected readonly t = translations(TEXT);
}
