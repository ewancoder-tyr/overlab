// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');

/**
 * Builds a `no-restricted-imports` rule entry from a list of forbidden import patterns.
 * We use it below to enforce the architecture described in docs/architecture.md: which layer and
 * which bounded context is allowed to import which.
 *
 * @param {{ group: string[], message: string }[]} patterns
 */
const forbidImports = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

const NO_FRAMEWORK = {
  group: ['@angular/*', 'rxjs', 'rxjs/*'],
  message: 'The domain layer is pure TypeScript: no Angular, no RxJS.',
};
const NO_OUTER_LAYERS = {
  group: ['**/application/**', '**/infrastructure/**', '**/presentation/**'],
  message: 'The domain layer may only import other domain code.',
};
const NO_PRESENTATION = {
  group: ['**/presentation/**'],
  message: 'Only presentation code may import presentation code.',
};
/** @param {string[]} contexts */
const noContexts = (contexts) => ({
  group: contexts.flatMap((context) => [`@${context}/*`, `**/${context}/**`]),
  message:
    'Context dependencies point one way: app -> gamification -> analytics -> training -> catalog -> shared.',
});

const OTHER_THAN_DIAGNOSTICS = [
  'catalog',
  'training',
  'analytics',
  'gamification',
  'settings',
  'sync',
  'leaderboard',
];

module.exports = defineConfig([
  { ignores: ['dist/**', '.angular/**', 'coverage/**'] },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      // "strict" + "type-checked" is the most demanding preset: it uses the TypeScript compiler
      // to catch things like unhandled promises and unsafe `any` usage.
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
      prettier, // Turns off formatting rules that would fight with Prettier.
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'olab', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'olab', style: 'kebab-case' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      // Numbers are safe and common in template literals.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Angular services and components are classes with only decorators and injected fields.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      eqeqeq: ['error', 'always'],
    },
  },

  // --- Architecture boundaries (see docs/architecture.md, "Bounded contexts" and "Layers") ---
  {
    files: ['src/*/domain/**/*.ts'],
    rules: forbidImports([NO_FRAMEWORK, NO_OUTER_LAYERS]),
  },
  {
    files: ['src/*/application/**/*.ts', 'src/*/infrastructure/**/*.ts'],
    rules: forbidImports([NO_PRESENTATION]),
  },
  {
    files: ['src/shared/**/*.ts'],
    ignores: ['src/shared/domain/**'],
    rules: forbidImports([
      NO_PRESENTATION,
      noContexts([
        'catalog',
        'training',
        'analytics',
        'gamification',
        'settings',
        'sync',
        'diagnostics',
        'leaderboard',
      ]),
    ]),
  },
  {
    files: ['src/shared/domain/**/*.ts'],
    rules: forbidImports([
      NO_FRAMEWORK,
      NO_OUTER_LAYERS,
      noContexts([
        'catalog',
        'training',
        'analytics',
        'gamification',
        'settings',
        'sync',
        'diagnostics',
        'leaderboard',
      ]),
    ]),
  },
  {
    files: ['src/catalog/domain/**/*.ts'],
    rules: forbidImports([
      NO_FRAMEWORK,
      NO_OUTER_LAYERS,
      noContexts([
        'training',
        'analytics',
        'gamification',
        'settings',
        'sync',
        'diagnostics',
        'leaderboard',
      ]),
    ]),
  },
  {
    files: ['src/training/domain/**/*.ts'],
    rules: forbidImports([
      NO_FRAMEWORK,
      NO_OUTER_LAYERS,
      noContexts(['analytics', 'gamification', 'settings', 'sync', 'diagnostics', 'leaderboard']),
    ]),
  },

  // `analytics` owns no events and knows nothing of the game built on top of it.
  // (A later block replaces an earlier block's `no-restricted-imports` for the same file, so
  // each block repeats the layer rule that the generic blocks above set.)
  {
    files: ['src/analytics/application/**/*.ts', 'src/analytics/infrastructure/**/*.ts'],
    rules: forbidImports([NO_PRESENTATION, noContexts(['gamification', 'leaderboard'])]),
  },
  {
    files: ['src/analytics/presentation/**/*.ts'],
    rules: forbidImports([noContexts(['gamification', 'leaderboard'])]),
  },
  {
    files: ['src/analytics/domain/**/*.ts'],
    rules: forbidImports([
      NO_FRAMEWORK,
      NO_OUTER_LAYERS,
      noContexts(['gamification', 'leaderboard']),
    ]),
  },

  // `gamification` sits on top of analytics: it reads the log through training, catalog and
  // analytics, and is told the preferences it needs by `app`, like analytics is.
  {
    files: ['src/gamification/domain/**/*.ts'],
    rules: forbidImports([
      NO_FRAMEWORK,
      NO_OUTER_LAYERS,
      noContexts(['settings', 'sync', 'diagnostics', 'leaderboard']),
    ]),
  },
  {
    files: ['src/gamification/application/**/*.ts', 'src/gamification/infrastructure/**/*.ts'],
    rules: forbidImports([
      NO_PRESENTATION,
      noContexts(['settings', 'sync', 'diagnostics', 'leaderboard']),
    ]),
  },
  {
    files: ['src/gamification/presentation/**/*.ts'],
    rules: forbidImports([noContexts(['settings', 'sync', 'diagnostics', 'leaderboard'])]),
  },

  // `settings` stands beside the training contexts: it knows only `shared`, and they do not
  // know it. Only `app` composes the two.
  {
    files: ['src/settings/application/**/*.ts', 'src/settings/infrastructure/**/*.ts'],
    rules: forbidImports([
      NO_PRESENTATION,
      noContexts([
        'catalog',
        'training',
        'analytics',
        'gamification',
        'sync',
        'diagnostics',
        'leaderboard',
      ]),
    ]),
  },
  {
    files: ['src/settings/domain/**/*.ts'],
    rules: forbidImports([
      NO_FRAMEWORK,
      NO_OUTER_LAYERS,
      noContexts([
        'catalog',
        'training',
        'analytics',
        'gamification',
        'sync',
        'diagnostics',
        'leaderboard',
      ]),
    ]),
  },

  // `sync` stands beside them too: it moves events without reading them, so it needs only `shared`.
  {
    files: ['src/sync/application/**/*.ts', 'src/sync/infrastructure/**/*.ts'],
    rules: forbidImports([
      NO_PRESENTATION,
      noContexts([
        'catalog',
        'training',
        'analytics',
        'gamification',
        'settings',
        'diagnostics',
        'leaderboard',
      ]),
    ]),
  },
  {
    files: ['src/sync/presentation/**/*.ts'],
    rules: forbidImports([
      noContexts([
        'catalog',
        'training',
        'analytics',
        'gamification',
        'settings',
        'diagnostics',
        'leaderboard',
      ]),
    ]),
  },
  {
    files: ['src/sync/domain/**/*.ts'],
    rules: forbidImports([
      NO_FRAMEWORK,
      NO_OUTER_LAYERS,
      noContexts([
        'catalog',
        'training',
        'analytics',
        'gamification',
        'settings',
        'diagnostics',
        'leaderboard',
      ]),
    ]),
  },

  // `diagnostics` stands beside them as well: it watches the browser, not the log, and needs
  // only `shared`. Only `app` knows it.
  {
    files: ['src/diagnostics/application/**/*.ts', 'src/diagnostics/infrastructure/**/*.ts'],
    rules: forbidImports([NO_PRESENTATION, noContexts(OTHER_THAN_DIAGNOSTICS)]),
  },
  {
    files: ['src/diagnostics/presentation/**/*.ts'],
    rules: forbidImports([noContexts(OTHER_THAN_DIAGNOSTICS)]),
  },
  {
    files: ['src/diagnostics/domain/**/*.ts'],
    rules: forbidImports([NO_FRAMEWORK, NO_OUTER_LAYERS, noContexts(OTHER_THAN_DIAGNOSTICS)]),
  },

  // `leaderboard` sits on top of two contexts: gamification (the experience it reports) and sync
  // (the sign-in it borrows). Nothing below may know it, and it must not know settings or
  // diagnostics: `app` passes it whether gamification is on.
  {
    files: ['src/leaderboard/application/**/*.ts', 'src/leaderboard/infrastructure/**/*.ts'],
    rules: forbidImports([NO_PRESENTATION, noContexts(['settings', 'diagnostics'])]),
  },
  {
    files: ['src/leaderboard/presentation/**/*.ts'],
    rules: forbidImports([noContexts(['settings', 'diagnostics'])]),
  },
  {
    files: ['src/leaderboard/domain/**/*.ts'],
    rules: forbidImports([
      NO_FRAMEWORK,
      NO_OUTER_LAYERS,
      noContexts(['settings', 'sync', 'diagnostics']),
    ]),
  },

  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
