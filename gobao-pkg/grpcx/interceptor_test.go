package grpcx

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestRecover_panic(t *testing.T) {
	h := func(ctx context.Context, req any) (any, error) { panic("boom") }
	_, err := Recover()(context.Background(), nil, &grpc.UnaryServerInfo{}, h)
	require.Error(t, err)
	assert.Equal(t, codes.Internal, status.Code(err))
}

func TestRecover_normal(t *testing.T) {
	h := func(ctx context.Context, req any) (any, error) { return "ok", nil }
	resp, err := Recover()(context.Background(), nil, &grpc.UnaryServerInfo{}, h)
	require.NoError(t, err)
	assert.Equal(t, "ok", resp)
}

func TestTraceID_generated(t *testing.T) {
	var got string
	h := func(ctx context.Context, req any) (any, error) {
		got = TraceIDFromCtx(ctx)
		return nil, nil
	}
	_, err := TraceID()(context.Background(), nil, &grpc.UnaryServerInfo{}, h)
	require.NoError(t, err)
	assert.NotEmpty(t, got, "应自动生成 traceId")
}

func TestTraceID_fromMetadata(t *testing.T) {
	md := metadata.Pairs("x-trace-id", "from-upstream-456")
	ctx := metadata.NewIncomingContext(context.Background(), md)

	var got string
	h := func(ctx context.Context, req any) (any, error) {
		got = TraceIDFromCtx(ctx)
		return nil, nil
	}
	_, err := TraceID()(ctx, nil, &grpc.UnaryServerInfo{}, h)
	require.NoError(t, err)
	assert.Equal(t, "from-upstream-456", got, "应复用 metadata 中的 traceId")
}

func TestTraceIDFromCtx_empty(t *testing.T) {
	assert.Equal(t, "", TraceIDFromCtx(context.Background()))
}
