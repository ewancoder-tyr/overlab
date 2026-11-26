import { Component } from '@angular/core';
import { LeaderboardBoardComponent } from '@leaderboard/presentation/leaderboard-board/leaderboard-board.component';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';

const TEXT: Localized<{ heading: string }> = {
    en: { heading: 'Leaderboard' },
    ru: { heading: 'Таблица лидеров' },
};

/** The leaderboard, opened from the experience card on the Week page or from Settings. */
@Component({
    selector: 'olab-leaderboard',
    imports: [LeaderboardBoardComponent],
    template: `
        <section class="card" aria-labelledby="leaderboard-heading">
            <h2 id="leaderboard-heading">{{ t().heading }}</h2>
            <olab-leaderboard-board />
        </section>
    `,
})
export class LeaderboardComponent {
    protected readonly t = translations(TEXT);
}
