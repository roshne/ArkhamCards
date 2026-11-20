# Web build (POC)

Expo's web export of the app, served by nginx in a container.

```bash
docker compose up -d --build     # on nitro; open http://192.168.7.26:8796 from the LAN
```

The port binding in `compose.yaml` names nitro's LAN address; change it to run elsewhere.

Local dev without Docker: `npx expo export -p web --output-dir dist-web`, then serve `dist-web/`
with any static server that falls back to `index.html`.

## How it differs from the native build

- `metro.config.js` maps native-only modules to stand-ins in `web/shims/` for the web platform
  only. op-sqlite maps to `src/data/sqlite/webSqlite.ts`, a sql.js driver.
- The card database lives in memory. `bundledDatabase.web.ts` loads `assets/generated/arkham4.db`
  into it on every page load. Those cards are English, whatever the language setting.
- Decks, campaigns and settings are saved in the browser's localStorage through redux-persist.
  It writes from memory without re-reading storage, so only one tab may save: opening the app
  in a new tab stops the older tab saving and covers it with a notice
  (`src/lib/prepareWeb.web.ts`).
- `babel.config.js` compiles imports to CommonJS on web, as on native. Expo's default ESM path
  turns the app's circular imports into a startup crash.
- `src/lib/prepareWeb.web.ts` also loads the bundled fonts (native builds embed them at build
  time) and makes `Alert.alert` show an in-page dialog (react-native-web's does nothing).

## Not working on web

- Other languages: the web build is English. Picking another language in Settings lasts until
  the next reload: each page load re-applies the bundled English cards, which clears the
  setting. Translated cards can't be downloaded either (CORS, below).
- Sign-in and sync: Arkham Cards accounts (Firebase), ArkhamDB, Google and Apple sign-in.
  The Arkham Cards GraphQL server also refuses browser requests (CORS), so card updates after
  the bundled snapshot don't download.
- Deck charts (Skia) render blank, and campaign location layouts lose their Skia-drawn
  decoration; the location cards still show.
- Backups (file system and file picker) and haptics.
- Saved credentials: the keychain stand-in stores nothing, so narration and Patreon sign-ins
  don't persist.
- Sharing: the browser share sheet needs HTTPS or localhost, and the LAN address is plain
  HTTP, so share buttons don't work there.
- Browser Back leaves the app rather than going back a screen, and skips the "discard
  changes?" prompt, so unsaved deck edits are lost. Use the in-app back arrow.
- URLs: routes aren't mirrored into the address bar (route params hold objects that don't
  survive a reload), so a reload returns to the home screen and screens can't be bookmarked.
