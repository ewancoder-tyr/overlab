# Two stages: build the app with Node, then serve the static files with nginx. The final image
# contains only nginx and the built files, no Node and no source code.

# --- Stage 1: build ---
FROM node:26-slim AS build
WORKDIR /app

# The pnpm version must match "packageManager" in package.json.
RUN npm install --global pnpm@12.18.0

# Install dependencies first, from the manifest files alone. Docker caches this layer, so
# dependencies are only reinstalled when one of these three files changes, not on every code edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- Stage 2: serve ---
FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/overlab/browser /usr/share/nginx/html
EXPOSE 80
