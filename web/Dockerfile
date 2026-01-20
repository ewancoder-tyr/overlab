FROM node:25-alpine AS build
RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG CONFIG_FILE
RUN cp -f src/$CONFIG_FILE src/config.ts
RUN pnpm run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/overlab/browser /usr/share/nginx/html

HEALTHCHECK CMD ["wget", "--spider", "http://localhost:8080"]
CMD ["nginx", "-g", "daemon off;"]
