# Web build of Arkham Cards (POC): Expo's web export, served as static files by nginx.
# Build: docker compose up -d --build   (see compose.yaml)

# Full image, not -slim: yarn needs git for the GitHub-hosted react-native-markdown-view.
FROM node:20.19.4-bookworm AS build
WORKDIR /app
# Dependencies first, so source edits don't re-run the install. Install scripts are skipped
# (none are needed for web); the repo's own postinstall runs after the source is copied.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-engines --ignore-scripts --network-timeout 600000
COPY . .
RUN npx patch-package && node scripts/copy-rnvi-fonts.js \
 && NODE_OPTIONS=--max-old-space-size=4096 CI=1 npx expo export -p web --output-dir dist-web

FROM nginx:1.29-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist-web /usr/share/nginx/html
