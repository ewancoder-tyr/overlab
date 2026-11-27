import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { Locale } from '@shared/application/locale.service';
import { Localized } from '@shared/domain/language';

/** The page names the routes refer to by key (`title: 'train'` in `app.routes.ts`). */
const PAGE_TITLES = {
    en: {
        week: 'OverLab',
        train: 'Train · OverLab',
        log: 'Log · OverLab',
        statistics: 'Statistics · OverLab',
        catalog: 'Catalog · OverLab',
        data: 'Data · OverLab',
        settings: 'Settings · OverLab',
        whatsNew: "What's new · OverLab",
        experience: 'Experience · OverLab',
        leaderboard: 'Leaderboard · OverLab',
        history: 'History · OverLab',
        programs: 'Programs · OverLab',
    },
    ru: {
        week: 'OverLab',
        train: 'Зал · OverLab',
        log: 'Запись · OverLab',
        statistics: 'Статистика · OverLab',
        catalog: 'Каталог · OverLab',
        data: 'Данные · OverLab',
        settings: 'Настройки · OverLab',
        whatsNew: 'Что нового · OverLab',
        experience: 'Опыт · OverLab',
        leaderboard: 'Лидеры · OverLab',
        history: 'История · OverLab',
        programs: 'Программы · OverLab',
    },
} satisfies Localized<Record<string, string>>;

export type PageTitle = keyof (typeof PAGE_TITLES)['en'];

/**
 * Sets the browser tab's title from the route, in the current language.
 *
 * The router's default strategy copies a route's `title` into the document as it is. Here the
 * route names a key instead, and the title follows the language: on navigation, and also when
 * the language changes while the page stays put.
 */
@Injectable()
export class LocalizedTitleStrategy extends TitleStrategy {
    private readonly title = inject(Title);
    private readonly language = inject(Locale).language;
    private readonly page = signal<PageTitle>('week');

    constructor() {
        super();
        effect(() => {
            this.title.setTitle(PAGE_TITLES[this.language()][this.page()]);
        });
    }

    override updateTitle(snapshot: RouterStateSnapshot): void {
        const key = this.buildTitle(snapshot);
        this.page.set(key !== undefined && key in PAGE_TITLES.en ? (key as PageTitle) : 'week');
    }
}
