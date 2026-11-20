# Web build of Arkham Cards (POC): Expo's web export, served as static files by nginx.
# Build with `docker build -t arkhamcards-web:poc .`; web/README.md has how it is deployed.
# On a shared host, cap it so a spike kills the build instead of swapping the host:
#   DOCKER_BUILDKIT=0 docker build --memory=3600m --memory-swap=3600m -t arkhamcards-web:poc .
# (the export needs about a 3 GB Node heap, set below).

# Full image, not -slim: yarn needs git for the GitHub-hosted react-native-markdown-view.
FROM node:20.19.4-bookworm AS build
WORKDIR /app
# Dependencies first, so source edits don't re-run the install. Install scripts are skipped
# (none are needed for web); the repo's own postinstall runs after the source is copied.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-engines --ignore-scripts --network-timeout 600000
COPY . .
RUN npx patch-package && node scripts/copy-rnvi-fonts.js \
 && NODE_OPTIONS=--max-old-space-size=3072 CI=1 npx expo export -p web --output-dir dist-web

FROM nginx:1.29-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist-web /usr/share/nginx/html
