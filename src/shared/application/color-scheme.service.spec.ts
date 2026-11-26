import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ColorSchemes, DARK, LIGHT } from './color-scheme.service';

describe('ColorSchemes', () => {
    let document: Document;
    let schemes: ColorSchemes;

    beforeEach(() => {
        document = TestBed.inject(DOCUMENT);
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = DARK.themeColor;
        document.head.append(meta);
        schemes = TestBed.inject(ColorSchemes);
        TestBed.tick();
    });

    afterEach(() => {
        document.querySelector('meta[name="theme-color"]')?.remove();
        document.documentElement.removeAttribute('data-color-scheme');
    });

    const attribute = (): string | null =>
        document.documentElement.getAttribute('data-color-scheme');
    const themeColor = (): string | null | undefined =>
        document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

    it('wears the dark scheme by default, as plain :root values with no attribute', () => {
        expect(attribute()).toBeNull();
        expect(themeColor()).toBe('#000000');
    });

    it('puts a chosen scheme on <html> and in the theme colour', () => {
        schemes.choose('light');
        TestBed.tick();

        expect(attribute()).toBe('light');
        expect(themeColor()).toBe(LIGHT.themeColor);

        schemes.choose('dark');
        TestBed.tick();
        expect(attribute()).toBeNull();
        expect(themeColor()).toBe(DARK.themeColor);
    });
});
