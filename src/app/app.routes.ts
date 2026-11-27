import { Routes } from '@angular/router';
import { PageTitle } from './localized-title.strategy';

/** A route whose `title` is one of the page names `LocalizedTitleStrategy` translates. */
type Page = Routes[number] & { readonly title?: PageTitle };

/*
 * Every page is lazy-loaded: `loadComponent` makes the bundler split it into its own file that is
 * fetched on first navigation (and cached by the service worker for offline use).
 *
 * Titles are keys, put into words in the current language by `LocalizedTitleStrategy`.
 */
export const routes: readonly Page[] = [
    {
        path: '',
        title: 'week',
        loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent),
    },
    {
        path: 'exercises',
        title: 'train',
        loadComponent: () =>
            import('./pages/exercise-picker/exercise-picker.component').then(
                (m) => m.ExercisePickerComponent,
            ),
    },
    {
        path: 'exercises/:exerciseId',
        title: 'log',
        loadComponent: () =>
            import('./pages/exercise-log/exercise-log.component').then(
                (m) => m.ExerciseLogComponent,
            ),
    },
    {
        path: 'exercises/:exerciseId/stats',
        title: 'statistics',
        loadComponent: () =>
            import('./pages/exercise-stats/exercise-stats.component').then(
                (m) => m.ExerciseStatsComponent,
            ),
    },
    {
        path: 'programs',
        title: 'programs',
        loadComponent: () =>
            import('./pages/programs/programs.component').then((m) => m.ProgramsComponent),
    },
    {
        path: 'programs/:programId',
        title: 'programs',
        loadComponent: () =>
            import('./pages/programs/program-editor.component').then(
                (m) => m.ProgramEditorComponent,
            ),
    },
    {
        path: 'catalog',
        title: 'catalog',
        loadComponent: () =>
            import('./pages/catalog/catalog.component').then((m) => m.CatalogComponent),
    },
    {
        path: 'data',
        title: 'data',
        loadComponent: () => import('./pages/data/data.component').then((m) => m.DataComponent),
    },
    {
        path: 'settings',
        title: 'settings',
        loadComponent: () =>
            import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
    },
    {
        path: 'whats-new',
        title: 'whatsNew',
        loadComponent: () =>
            import('./pages/whats-new/whats-new.component').then((m) => m.WhatsNewComponent),
    },
    {
        path: 'experience',
        title: 'experience',
        loadComponent: () =>
            import('./pages/experience/experience.component').then((m) => m.ExperienceComponent),
    },
    {
        path: 'history',
        title: 'history',
        loadComponent: () =>
            import('./pages/history/history.component').then((m) => m.HistoryComponent),
    },
    {
        path: 'leaderboard',
        title: 'leaderboard',
        loadComponent: () =>
            import('./pages/leaderboard/leaderboard.component').then((m) => m.LeaderboardComponent),
    },
    { path: '**', redirectTo: '' },
];
