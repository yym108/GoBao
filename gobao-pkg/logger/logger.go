package logger

import (
	"context"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type ctxKey int

const traceKey ctxKey = 1

func New(service, level string) *zap.Logger {
	lvl := zapcore.InfoLevel
	_ = lvl.UnmarshalText([]byte(level))

	cfg := zap.NewProductionConfig()
	cfg.Level = zap.NewAtomicLevelAt(lvl)
	cfg.InitialFields = map[string]any{"service": service}

	l, _ := cfg.Build()
	return l
}

func WithTraceID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, traceKey, id)
}

func TraceIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(traceKey).(string); ok {
		return v
	}
	return ""
}

func FromContext(ctx context.Context, base *zap.Logger) *zap.Logger {
	if id := TraceIDFromContext(ctx); id != "" {
		return base.With(zap.String("trace_id", id))
	}
	return base
}
