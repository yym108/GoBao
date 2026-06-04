#!/usr/bin/env bash
# scripts/new-service.sh <service-name>
set -euo pipefail
name="$1"; root="/Users/yym/GolandProjects/GoBao"; dir="$root/gobao-$name"
upper=$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')
mkdir -p "$dir/cmd/server" "$dir/internal/config" "$dir/internal/adapter/grpc"

cat > "$dir/internal/config/config.go" <<EOF
package config

type Config struct {
	HTTPAddr string \`mapstructure:"http_addr"\`
	GRPCAddr string \`mapstructure:"grpc_addr"\`
	LogLevel string \`mapstructure:"log_level"\`
}
EOF

cat > "$dir/cmd/server/main.go" <<EOF
package main

import (
	"context"
	"os/signal"
	"syscall"

	pkgcfg "github.com/yym/gobao-pkg/config"
	"github.com/yym/gobao-pkg/logger"
	"github.com/yym/gobao-pkg/server"

	"github.com/yym/gobao-${name}/internal/config"
)

func main() {
	cfg := config.Config{HTTPAddr: ":8080", GRPCAddr: ":9090", LogLevel: "info"}
	_ = pkgcfg.Load("${upper}", "", &cfg)

	log := logger.New("${name}", cfg.LogLevel); defer log.Sync()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	s := server.New("${name}", server.Options{HTTPAddr: cfg.HTTPAddr, GRPCAddr: cfg.GRPCAddr})
	log.Info("starting service")
	if err := s.Run(ctx); err != nil { log.Fatal(err.Error()) }
}
EOF

cat > "$dir/Dockerfile" <<EOF
FROM golang:1.22 AS build
WORKDIR /src
COPY . .
RUN cd /src && go build -o /out/server ./cmd/server

FROM gcr.io/distroless/base-debian12
COPY --from=build /out/server /server
ENV ${upper}_HTTP_ADDR=:8080 ${upper}_GRPC_ADDR=:9090
EXPOSE 8080 9090
ENTRYPOINT ["/server"]
EOF

echo "service gobao-$name scaffolded"