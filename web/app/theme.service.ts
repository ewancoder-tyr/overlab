import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
    theme: string = localStorage.getItem('tyr_theme') || 'light';

    toggleTheme() {
        if (this.theme === 'dark') this.setLightTheme();
        else this.setDarkTheme();
    }

    private setDarkTheme() {
        this.theme = 'dark';
        document.documentElement.classList.add('dark-theme');
        document.documentElement.classList.remove('light-theme');
        localStorage.setItem('tyr_theme', 'dark');
    }

    private setLightTheme() {
        this.theme = 'light';
        document.documentElement.classList.add('light-theme');
        document.documentElement.classList.remove('dark-theme');
        localStorage.setItem('tyr_theme', 'light');
    }
}
