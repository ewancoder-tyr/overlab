import { Component } from '@angular/core';
import { ExperienceHistoryComponent } from '@gamification/presentation/experience-history/experience-history.component';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';

const TEXT: Localized<{ heading: string }> = {
    en: { heading: 'Experience history' },
    ru: { heading: 'История опыта' },
};

/** The experience history, opened from the experience card on the Week page. */
@Component({
    selector: 'olab-experience',
    imports: [ExperienceHistoryComponent],
    template: `
        <h2 class="visually-hidden">{{ t().heading }}</h2>
        <olab-experience-history />
    `,
})
export class ExperienceComponent {
    protected readonly t = translations(TEXT);
}
