# Web build (POC)

Expo's web export of the app, served by nginx in a container.

```bash
docker compose up -d --build                 # serves on 127.0.0.1:8796
ssh -L 8796:127.0.0.1:8796 nitro             # from another machine, then open http://localhost:8796
```

Local dev without Docker: `npx expo export -p web --output-dir dist-web`, then serve `dist-web/`
with any static server that falls back to `index.html`.

## How it differs from the native build

- `metro.config.js` maps native-only modules to stand-ins in `web/shims/` for the web platform
  only. op-sqlite maps to `src/data/sqlite/webSqlite.ts`, a sql.js driver.
- The card database lives in memory. `bundledDatabase.web.ts` loads `assets/generated/arkham4.db`
  into it on every page load. Decks, campaigns and settings persist in browser storage through
  redux-persist, as on native.
- `babel.config.js` compiles imports to CommonJS on web, as on native. Expo's default ESM path
  turns the app's circular imports into a startup crash.
- `src/lib/loadFonts.web.ts` loads the bundled fonts, which native builds embed at build time.

## Not working on web

- Sign-in and sync: Arkham Cards accounts (Firebase), ArkhamDB, Google and Apple sign-in.
  The Arkham Cards GraphQL server also refuses browser requests (CORS), so card updates after
  the bundled snapshot don't download.
- Deck charts and campaign location maps (Skia) render blank.
- Backups (file system and file picker) and haptics.
- Saved credentials: the keychain stand-in stores nothing, so narration and Patreon sign-ins
  don't persist.
- Route URLs carry `[object Object]` for some IDs, so a reload on a deck or campaign screen
  doesn't restore that screen.
