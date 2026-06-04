package logger

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFromContext_NoTraceID(t *testing.T) {
	l := New("test", "debug")
	got := FromContext(context.Background(), l)
	require.NotNil(t, got)
}

func TestFromContext_WithTraceID(t *testing.T) {
	l := New("test", "debug")
	ctx := WithTraceID(context.Background(), "trace-123")
	require.Equal(t, "trace-123", TraceIDFromContext(ctx))
	_ = FromContext(ctx, l)
}
