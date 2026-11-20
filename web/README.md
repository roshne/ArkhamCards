# Web build (POC)

Expo's web export of the app, served by nginx in a container, at
**https://arkhamcards.rackbops.com** behind Cloudflare Access.

## Running it

It runs on an Azure VM as the stack in `web/compose.azure.yaml`:

- **`web`**: this repo's `Dockerfile` (the app, served by nginx).
- **`api`**: `web/api/server.mjs` (image from `web/api/Dockerfile`), which holds each user's saved
  data in the `state` volume.
- **`cloudflared`**: the tunnel sidecar. Nothing publishes a host port.

### Releasing

Push `web-poc`, then a `vX.Y.Z` tag on it (a tag whose commit isn't on `origin/web-poc` yet is
refused). `.github/workflows/web-release.yml` then builds both images on GitHub's hosted runners
and publishes them as `ghcr.io/roshne/arkhamcards-web` and `ghcr.io/roshne/arkhamcards-api`,
tagged `X.Y.Z`. If it is the newest plain `vX.Y.Z` tag on `web-poc`, both images' `latest` then
moves to it, after both builds succeed. On the host, `arkhamcards-deploy.timer` checks every 5
minutes and recreates `api`, then `web`, when `latest` points at a new image
(`web/deploy/deploy-pull.sh`, from rackbops-web-deploy-template). To rebuild a tag, re-run its
workflow run. To roll back, set `IMAGE_TAG=X.Y.Z` in the stack's `.env`; the timer then holds
both images at that version until the line is removed. The new `api` can go live up to one timer
run before the new `web`, so an API change has to keep working with the previous web build.

A change to `web/compose.azure.yaml` itself still has to be copied to the host by hand, followed
by `docker compose up -d`.

### First-time setup on a host

- **On Cloudflare:** a remotely managed tunnel routing the hostname to `http://web:80` with Access
  required, and an Access application for the hostname.
- **A release** (above): the images must exist on GHCR before the host can pull them. The packages
  are public (an anonymous pull works), so the host needs no registry login.
- **In the stack directory**, which must be `/opt/stacks/arkhamcards` (the script and the unit
  both name it), owned by a user in the `docker` group:
  - `compose.yaml`: a copy of `web/compose.azure.yaml`.
  - `deploy/deploy-pull.sh`: a copy of `web/deploy/deploy-pull.sh` (create `deploy/` first).
  - `.env` (mode 600), holding:
    - `CLOUDFLARE_TUNNEL_TOKEN`: the tunnel's connector token.
    - `ACCESS_TEAM_DOMAIN`: `<team>.cloudflareaccess.com`.
    - `ACCESS_AUD`: the Access application's audience tag.
    - `REGISTRY_USER` and `REGISTRY_TOKEN`: only if the GHCR packages are made private, a login
      with `read:packages`.
- **systemd:** copy `web/deploy/arkhamcards-deploy.{service,timer}` to `/etc/systemd/system/`, set
  the service's `User=` to the stack directory's owner, then
  `systemctl daemon-reload && systemctl enable --now arkhamcards-deploy.timer`.

Then `docker compose up -d` in the stack directory.

Local dev without Docker: `npx expo export -p web --output-dir dist-web`, then serve `dist-web/`
with any static server. With no `/api` there, data stays in that browser (below).

Tests:
- `node --test web/api` runs the API's tests.
- `bash web/deploy/deploy-pull.test.sh` runs the deploy script's tests (a fake `docker`).
- The client tests run with an inline Jest config, since the repo's `react-native` preset moved to
  `@react-native/jest-preset` in this React Native version, and that package isn't installed:
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
    another device, the browser's older data is not merged in. If a move is interrupted and you
    open the app on another device before reloading this browser, the slices that hadn't moved
    start fresh in the account (on every device) and the browser's copy of them goes unused. Browser
    data belongs to the address it was saved under, so data saved by an earlier copy of the app at a
    different address can't move here.
  - **Conflicts:** each saved item has a version. A save made from an out-of-date copy is
    refused instead of overwriting newer data. That happens when the same item was changed in
    another tab or on another device. Merely opening the app elsewhere changes nothing, with two
    exceptions: the first load after a language change, and the first load after a new card
    bundle ships. Each re-saves the packs, cards and settings items. The tab whose save was
    refused stops saving and asks for a reload; its latest change is not saved.
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

- Other languages: the cards are always the bundled English set, since translated ones can't be
  downloaded (CORS, below). Choosing another language in Settings changes the app's text until
  the next reload, then reverts (checked in a browser). The translated-card download it starts
  leaves the saved card cache without its date, so the next load re-applies the bundled card
  data, and that clears the language setting.
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
