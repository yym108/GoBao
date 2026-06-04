package errors_test

import (
	stderrors "errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/yym108/gobao-pkg/errors"
)

func TestNew_basic(t *testing.T) {
	err := errors.New(errors.CodeNotFound, "user not found")

	require.NotNil(t, err)
	assert.Equal(t, errors.CodeNotFound, err.Code)
	assert.Equal(t, "user not found", err.Msg)
	assert.Nil(t, err.Err)
	assert.Equal(t, "NOT_FOUND: user not found", err.Error())
}

func TestWrap_preservesUnderlying(t *testing.T) {
	base := stderrors.New("sql: no rows")
	err := errors.Wrap(errors.CodeNotFound, "load user", base)

	assert.Equal(t, errors.CodeNotFound, err.Code)
	assert.Equal(t, "load user", err.Msg)
	assert.Same(t, base, err.Unwrap())
	assert.True(t, stderrors.Is(err, base))
	assert.Equal(t, "NOT_FOUND: load user: sql: no rows", err.Error())
}

// ---------- IsCode + 新 Code 测试 ----------

func TestIsCode_MatchesWrappedError(t *testing.T) {
	base := errors.New(errors.CodeConflict, "duplicate")
	wrapped := stderrors.Join(stderrors.New("outer"), base)
	assert.True(t, errors.IsCode(wrapped, errors.CodeConflict), "expect IsCode to match wrapped *Error")
}

func TestIsCode_NotMatch(t *testing.T) {
	assert.False(t, errors.IsCode(errors.New(errors.CodeNotFound, "x"), errors.CodeConflict))
}

func TestIsCode_NilOrPlainError(t *testing.T) {
	assert.False(t, errors.IsCode(nil, errors.CodeNotFound))
	assert.False(t, errors.IsCode(stderrors.New("plain"), errors.CodeNotFound))
}

func TestNewCodes_HaveGRPCMapping(t *testing.T) {
	for _, c := range []errors.Code{errors.CodeFailedPrecondition, errors.CodeAborted} {
		s := errors.ToGRPCStatus(errors.New(c, "x"))
		require.NotNil(t, s, "code %s missing grpc mapping", c)
	}
}

// TestToGRPCStatus_preservesDownstreamGRPCCode 验证：当错误本身已是 gRPC status error
// （典型来自服务对下游服务的 gRPC 调用，如 Order 调 Product 的 DeductStock 返回 Aborted），
// 其错误码与消息应被透传保留，而不是一律压成 Internal —— 否则上游会把库存并发冲突误报为 500。
func TestToGRPCStatus_preservesDownstreamGRPCCode(t *testing.T) {
	downstream := status.Error(codes.Aborted, "库存并发冲突,请重试")
	st := errors.ToGRPCStatus(downstream)
	assert.Equal(t, codes.Aborted, st.Code(), "下游 gRPC 错误码应被保留，而非压成 Internal")
	assert.Equal(t, "库存并发冲突,请重试", st.Message())
}

func TestToGRPCStatus_mapsAllCodes(t *testing.T) {
	cases := []struct {
		name string
		in   error
		want codes.Code
	}{
		{"nil", nil, codes.OK},
		{"invalid_arg", errors.New(errors.CodeInvalidArg, "x"), codes.InvalidArgument},
		{"unauth", errors.New(errors.CodeUnauth, "x"), codes.Unauthenticated},
		{"forbidden", errors.New(errors.CodeForbidden, "x"), codes.PermissionDenied},
		{"not_found", errors.New(errors.CodeNotFound, "x"), codes.NotFound},
		{"conflict", errors.New(errors.CodeConflict, "x"), codes.AlreadyExists},
		{"exhausted", errors.New(errors.CodeExhausted, "x"), codes.ResourceExhausted},
		{"internal", errors.New(errors.CodeInternal, "x"), codes.Internal},
		{"unavailable", errors.New(errors.CodeUnavailable, "x"), codes.Unavailable},
		{"non_business_err", stderrors.New("raw"), codes.Internal},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			st := errors.ToGRPCStatus(tc.in)
			assert.Equal(t, tc.want, st.Code())
		})
	}
}
