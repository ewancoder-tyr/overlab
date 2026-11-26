import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeaderboardService } from '@leaderboard/application/leaderboard.service';
import { Localized } from '@shared/domain/language';
import { translations } from '@shared/presentation/i18n';

const TEXT = {
    en: {
        leaderboard: 'Leaderboard',
        place: (place: number, of: number) => `#${place} of ${of}`,
    },
    ru: {
        leaderboard: 'Таблица лидеров',
        place: (place: number, of: number) => `${place}-е из ${of}`,
    },
} satisfies Localized<unknown>;

/**
 * One line for the Week page's experience card, under the character: your place on the
 * leaderboard, leading to the whole board. Shown only while taking part. It shows the last
 * board fetched and does not fetch by itself, so the Week page costs no request.
 */
@Component({
    selector: 'olab-leaderboard-place',
    imports: [RouterLink],
    template: `
        @if (joined()) {
            <a class="place" routerLink="/leaderboard">
                <span class="place__word">{{ t().leaderboard }}</span>
                @if (place(); as place) {
                    <span class="place__number">{{ t().place(place.place, place.of) }}</span>
                }
            </a>
        }
    `,
    styles: `
        .place {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            min-height: 2.75rem;
            color: var(--accent-ink);
            font-family: var(--font-display);
            font-size: 1.0625rem;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-decoration: none;
            text-transform: uppercase;
        }

        .place__number {
            font-variant-numeric: tabular-nums;
        }
    `,
})
export class LeaderboardPlaceComponent {
    private readonly leaderboard = inject(LeaderboardService);
    protected readonly t = translations(TEXT);
    protected readonly joined = this.leaderboard.joined;

    protected readonly place = computed(() => {
        const standings = this.leaderboard.board()?.standings ?? [];
        const you = standings.find((row) => row.you);
        return you === undefined ? undefined : { place: you.place, of: standings.length };
    });
}
