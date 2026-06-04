// Package httpx 提供 Gin 框架的通用 HTTP 中间件。
package httpx

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RequestID 为每个请求注入 traceId。
// 如果请求头已携带 X-Trace-Id 则复用（上游网关/前端传入），否则生成新的 UUID。
// traceId 同时写入 gin.Context 和响应头，方便下游服务传递和客户端排查。
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Trace-Id")
		if id == "" {
			id = uuid.NewString()
		}
		c.Set("traceId", id)
		c.Header("X-Trace-Id", id)
		c.Next()
	}
}

// Recover 捕获 handler 中的 panic，返回 500 而不是让进程崩溃。
// 生产环境中应配合 logger 记录 panic 堆栈（当前为最小实现）。
func Recover() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.AbortWithStatusJSON(500, gin.H{
					"code":    "INTERNAL",
					"message": "internal error",
				})
			}
		}()
		c.Next()
	}
}
