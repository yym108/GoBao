package errors

import (
	"errors"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Code string

const (
	CodeInvalidArg         Code = "INVALID_ARGUMENT"
	CodeUnauth             Code = "UNAUTHENTICATED"
	CodeForbidden          Code = "PERMISSION_DENIED"
	CodeNotFound           Code = "NOT_FOUND"
	CodeConflict           Code = "CONFLICT"
	CodeExhausted          Code = "RESOURCE_EXHAUSTED"
	CodeInternal           Code = "INTERNAL"
	CodeUnavailable        Code = "UNAVAILABLE"
	CodeFailedPrecondition Code = "FAILED_PRECONDITION" // 业务前置条件不满足(如库存不足、类目仍被引用)
	CodeAborted            Code = "ABORTED"             // 并发冲突(如乐观锁 CAS 失败)
)

type Error struct {
	Code Code
	Msg  string
	Err  error
}

func (e *Error) Error() string {
	if e.Err == nil {
		return fmt.Sprintf("%s: %s", e.Code, e.Msg)
	}
	return fmt.Sprintf("%s: %s: %s", e.Code, e.Msg, e.Err)
}

func (e *Error) Unwrap() error {
	return e.Err
}

func New(c Code, msg string) *Error {
	return &Error{Code: c, Msg: msg}
}

func Wrap(c Code, msg string, err error) *Error {
	return &Error{Code: c, Msg: msg, Err: err}
}

var grpcMap = map[Code]codes.Code{
	CodeInvalidArg:         codes.InvalidArgument,
	CodeUnauth:             codes.Unauthenticated,
	CodeForbidden:          codes.PermissionDenied,
	CodeNotFound:           codes.NotFound,
	CodeConflict:           codes.AlreadyExists,
	CodeExhausted:          codes.ResourceExhausted,
	CodeInternal:           codes.Internal,
	CodeUnavailable:        codes.Unavailable,
	CodeFailedPrecondition: codes.FailedPrecondition,
	CodeAborted:            codes.Aborted,
}

func ToGRPCStatus(err error) *status.Status {
	if err == nil {
		return status.New(codes.OK, "")
	}
	if be, ok := err.(*Error); ok {
		if c, ok := grpcMap[be.Code]; ok {
			return status.New(c, be.Msg)
		}
		return status.New(codes.Internal, be.Msg)
	}
	// 若 err 本身已是 gRPC status error（典型来自服务对下游服务的 gRPC 调用，
	// 如 Order 调 Product 的 DeductStock 返回 Aborted），保留其错误码与消息，
	// 避免把下游的 Aborted/FailedPrecondition 等业务错误码统一压成 Internal。
	if st, ok := status.FromError(err); ok {
		return st
	}
	return status.New(codes.Internal, "internal server error")
}

// IsCode 判断 err 链(支持 errors.Join / fmt.Errorf %w)中是否存在 *Error 且其 Code 等于 c。
// application/handler 层用此函数做错误码分发,避免裸类型断言。
func IsCode(err error, c Code) bool {
	if err == nil {
		return false
	}
	var be *Error
	if errors.As(err, &be) {
		return be.Code == c
	}
	return false
}
