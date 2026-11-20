# Web build (POC)

Expo's web export of the app, served by nginx in a container, at
**https://arkhamcards.rackbops.com** behind Cloudflare Access.

## Running it

It runs on the rackbops-web Azure VM as the stack in `web/compose.azure.yaml`:

- **`web`**: this repo's `Dockerfile` (the app, served by nginx).
- **`api`**: `web/api/server.mjs`, which holds each user's saved data in the `state` volume.
- **`cloudflared`**: the tunnel sidecar. Nothing publishes a host port.

The VM is too small to build the image, so build it elsewhere and load it there:

```bash
docker build -t arkhamcards-web:poc .
docker save arkhamcards-web:poc | gzip -1 | ssh <vm> 'gunzip | docker load'
ssh <vm> 'mkdir -p /opt/stacks/arkhamcards/api'
scp web/compose.azure.yaml <vm>:/opt/stacks/arkhamcards/compose.yaml
scp web/api/server.mjs <vm>:/opt/stacks/arkhamcards/api/server.mjs
ssh <vm> 'cd /opt/stacks/arkhamcards && docker compose up -d && docker compose restart api'
```

The last line restarts `api` because `server.mjs` is mounted from the stack directory, so
`up -d` alone keeps running the old copy.

The stack's `.env` (mode 600) must exist before the first `up`. It holds:
- `CLOUDFLARE_TUNNEL_TOKEN`: the tunnel's connector token.
- `ACCESS_TEAM_DOMAIN`: `<team>.cloudflareaccess.com`.
- `ACCESS_AUD`: the Access application's audience tag.

Local dev without Docker: `npx expo export -p web --output-dir dist-web`, then serve `dist-web/`
with any static server. With no `/api` there, data stays in that browser (below).

Tests:
- `node --test web/api` runs the API's tests.
- The client tests run with an inline Jest config, since the repo's preset no longer exists in
  this React Native version:
  `npx jest --config '{"testMatch":["**/__tests__/*.test.ts"],"testEnvironment":"node"}'`.

## How it differs from the native build

- `metro.config.js` maps native-only modules to stand-ins in `web/shims/` for the web platform
  only. op-sqlite maps to `src/data/sqlite/webSqlite.ts`, a sql.js driver.
- The card database lives in memory. `bundledDatabase.web.ts` loads `assets/generated/arkham4.db`
  into it on every page load. Those cards are English, whatever the language setting.
- **Saved data is per user.** Decks, campaigns and settings go to the signed-in person's account
  on the server (`src/lib/persistStorage.web.ts` and `web/api/server.mjs`), so they follow that
  person to any device and nobody sees anyone else's. The rest of this item is how that works.
  - **Identity:** the API takes the user from Cloudflare Access's signed token, after checking
    its signature, audience, issuer and expiry. Settings → Arkham Cards Account shows who is
    signed in.
  - **First sign-in:** a browser's older data, saved before accounts, goes to the first account
    that signs in there with no saved data. That account keeps getting it for any slice the
    server doesn't have yet, so an interrupted move finishes on a later load. Other accounts
    never get it, and the browser keeps its own copy. If your account already has data from
    another device, the browser's older data is not merged in.
  - **Conflicts:** each saved item has a version. A save made from an out-of-date copy is
    refused instead of overwriting newer data. That happens when the same item was changed in
    another tab or on another device; merely opening the app elsewhere changes nothing. The tab
    whose save was refused stops saving and asks for a reload; its latest change is not saved.
  - **Not per user:** the app's GraphQL cache and its sign-in handshake state still live in
    browser storage. Neither should hold anything personal while sign-in and sync don't work on
    web (below); that's from reading the code, not checked in a browser.
  - **Two tabs in one browser:** opening the app in a new tab stops the older tab saving
    (`src/lib/prepareWeb.web.ts`).
  - **No API:** where there is no `/api` (a plain static server), data is saved in that browser's
    storage instead.
- `babel.config.js` compiles imports to CommonJS on web, as on native. Expo's default ESM path
  turns the app's circular imports into a startup crash.
- `src/lib/prepareWeb.web.ts` also loads the bundled fonts (native builds embed them at build
  time) and makes `Alert.alert` show an in-page dialog (react-native-web's does nothing).

## Not working on web

- Other languages: the web build is English. Picking another language in Settings lasts until
  the next reload: each page load re-applies the bundled English cards, which clears the
  setting. Translated cards can't be downloaded either (CORS, below).
- Sign-in and sync to Arkham Cards accounts (Firebase), ArkhamDB, Google and Apple. ArkhamDB
  needs its own OAuth credentials for this site, and its token and API endpoints refuse browser
  requests (CORS). The Arkham Cards GraphQL server also refuses browser requests, so card
  updates after the bundled snapshot don't download.
- Deck charts (Skia) render blank, and campaign location layouts lose their Skia-drawn
  decoration; the location cards still show.
- Backups (file system and file picker) and haptics.
- Saved credentials: the keychain stand-in stores nothing, so narration and Patreon sign-ins
  don't persist.
- Browser Back leaves the app rather than going back a screen, and skips the "discard
  changes?" prompt, so unsaved deck edits are lost. Use the in-app back arrow.
- URLs: routes aren't mirrored into the address bar (route params hold objects that don't
  survive a reload), so a reload returns to the home screen and screens can't be bookmarked.
