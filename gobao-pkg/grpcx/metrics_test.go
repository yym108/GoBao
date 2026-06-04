package grpcx

import (
	"context"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// TestMetrics_success 验证成功调用会以 code=OK 累加请求计数。
func TestMetrics_success(t *testing.T) {
	interceptor := Metrics("metric-svc-ok")
	info := &grpc.UnaryServerInfo{FullMethod: "/svc/MethodOK"}
	h := func(ctx context.Context, req any) (any, error) { return "ok", nil }

	resp, err := interceptor(context.Background(), nil, info, h)
	require.NoError(t, err)
	assert.Equal(t, "ok", resp)

	got := testutil.ToFloat64(grpcRequestsTotal.WithLabelValues("metric-svc-ok", "/svc/MethodOK", "OK"))
	assert.Equal(t, float64(1), got, "成功请求应累加 OK 计数")
}

// TestMetrics_error 验证 handler 返回错误时按对应 gRPC code 累加计数。
func TestMetrics_error(t *testing.T) {
	interceptor := Metrics("metric-svc-err")
	info := &grpc.UnaryServerInfo{FullMethod: "/svc/MethodErr"}
	h := func(ctx context.Context, req any) (any, error) {
		return nil, status.Error(codes.Aborted, "库存并发冲突")
	}

	_, err := interceptor(context.Background(), nil, info, h)
	require.Error(t, err)

	got := testutil.ToFloat64(grpcRequestsTotal.WithLabelValues("metric-svc-err", "/svc/MethodErr", "Aborted"))
	assert.Equal(t, float64(1), got, "错误请求应按 code 累加计数")
}

// TestMetrics_duration 验证耗时直方图至少记录到一次观测。
func TestMetrics_duration(t *testing.T) {
	interceptor := Metrics("metric-svc-dur")
	info := &grpc.UnaryServerInfo{FullMethod: "/svc/MethodDur"}
	h := func(ctx context.Context, req any) (any, error) { return nil, nil }

	_, err := interceptor(context.Background(), nil, info, h)
	require.NoError(t, err)

	count := testutil.CollectAndCount(grpcRequestDuration)
	assert.GreaterOrEqual(t, count, 1, "耗时直方图应记录到观测样本")
}
