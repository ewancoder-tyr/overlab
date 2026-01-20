import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app.component';

const theme = localStorage.getItem('tyr_theme');
if (theme === 'dark') {
    document.documentElement.classList.add('dark-theme');
    document.documentElement.classList.remove('light-theme');
}

bootstrapApplication(App, appConfig)
    .catch(err => console.error(err));
