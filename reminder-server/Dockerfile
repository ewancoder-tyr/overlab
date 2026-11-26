# Build the Go program, then copy the single binary into a small image.

FROM golang:1.27-alpine AS build
WORKDIR /src
# Dependencies first, so Docker caches them until go.mod or go.sum change.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# CGO off produces a fully static binary with no dependency on system libraries.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /reminder-server .

FROM alpine:3.22
# Root certificates, needed to make HTTPS calls to the push services.
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 reminders \
    && mkdir /data && chown reminders /data
USER reminders
COPY --from=build /reminder-server /reminder-server
# The app's release notes: the service announces their newest version to every device, once
# (see announce.go). They live with the app, outside this folder, so the build is given that
# folder as a second context named "notes":
#   docker build --build-context notes=../src/app .
COPY --from=notes release-notes.json /release-notes.json
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/reminder-server"]
