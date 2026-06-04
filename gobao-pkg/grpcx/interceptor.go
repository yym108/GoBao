// Package grpcx 提供 gRPC 服务端通用拦截器。
package grpcx

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type traceCtxKey struct{}

// Recover 返回一个拦截器，捕获 handler 中的 panic 并转为 gRPC Internal 错误。
func Recover() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, h grpc.UnaryHandler) (resp any, err error) {
		defer func() {
			if r := recover(); r != nil {
				err = status.Error(codes.Internal, fmt.Sprintf("panic: %v", r))
			}
		}()
		return h(ctx, req)
	}
}

// TraceID 返回一个拦截器，从 metadata 中提取 x-trace-id，
// 没有则生成 UUID，写入 context 供下游使用。
func TraceID() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, h grpc.UnaryHandler) (any, error) {
		md, _ := metadata.FromIncomingContext(ctx)
		var id string
		if v := md.Get("x-trace-id"); len(v) > 0 {
			id = v[0]
		} else {
			id = uuid.NewString()
		}
		ctx = context.WithValue(ctx, traceCtxKey{}, id)
		return h(ctx, req)
	}
}

// TraceIDFromCtx 从 context 中取出 traceId，没有则返回空字符串。
func TraceIDFromCtx(ctx context.Context) string {
	if v, ok := ctx.Value(traceCtxKey{}).(string); ok {
		return v
	}
	return ""
}
