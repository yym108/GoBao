FROM golang:1.26 AS build
WORKDIR /src
COPY gobao-pkg gobao-pkg
COPY gobao-proto gobao-proto
COPY gobao-admin gobao-admin
ENV GOWORK=off
RUN cd /src/gobao-admin && go build -o /out/server ./cmd/server

FROM gcr.io/distroless/base-debian12
COPY --from=build /out/server /server
EXPOSE 8080 9090
ENTRYPOINT ["/server"]
