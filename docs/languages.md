# Languages

OverLab speaks English and Russian (`LANGUAGES` in `shared/domain/language.ts`) and switches in
place, without a reload. Settings has the switch.

- **The choice is a `language` preference**, so it is backed up and synced. Never chosen, the
  app follows the browser (`browserLanguage()`). `Locale` (`shared/application`) holds the
  language as a signal; `app.config.ts` feeds the preference into it.
- **Every text exists in every language.** `Localized<T>` is `Record<Language, T>`, so a missing
  translation is a compile error. Catalog names and notes are `LocalText` (`{ en, ru }`); Russian
  names and form notes live in `catalog/domain/built-in-russian.ts`. Release notes carry both.
- **Domain rules return their messages in every language**: `Result`'s error is a `LocalText`,
  and the screen picks one. Words that projections produce (hype lines, cardio verdicts, loads,
  rep counts) take the language as a parameter.
- **Components keep their texts in a `TEXT` table** (`{ en: {...}, ru: {...} }`) and read them
  through `translations(TEXT)`; `| localize` and `| localDate` do the same for a `LocalText` and
  a date. Not Angular's `@angular/localize`, which builds one site per language.
- Numbers and units follow the language: `12.5 kg` / `12,5 кг`, `km` / `км`. Russian plurals go
  through `plural()`, never `count === 1`.
- **Russian roasts never use gendered forms** (the server knows nobody's gender) and only put
  `{last}` and `{target}` where the nominative fits. See the comment on `russian` in `wording.go`.
- Barlow Condensed has no Cyrillic. Cyrillic letters come from Roboto Condensed, declared as
  `OverLab Cyrillic` with a Cyrillic `unicode-range` in `styles.scss`, so only Russian pages
  download it.
