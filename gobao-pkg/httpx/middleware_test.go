package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func init() { gin.SetMode(gin.TestMode) }

func TestRequestID_generated(t *testing.T) {
	r := gin.New()
	r.Use(RequestID())
	r.GET("/x", func(c *gin.Context) { c.String(200, c.GetString("traceId")) })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))

	require.NotEmpty(t, w.Body.String(), "应生成 traceId 并写入 body")
	assert.Equal(t, w.Body.String(), w.Header().Get("X-Trace-Id"), "body 和响应头的 traceId 应一致")
}

func TestRequestID_reused(t *testing.T) {
	r := gin.New()
	r.Use(RequestID())
	r.GET("/x", func(c *gin.Context) { c.String(200, c.GetString("traceId")) })

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("X-Trace-Id", "from-gateway-123")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, "from-gateway-123", w.Body.String(), "应复用上游传入的 traceId")
	assert.Equal(t, "from-gateway-123", w.Header().Get("X-Trace-Id"))
}

func TestRecover_returns500(t *testing.T) {
	r := gin.New()
	r.Use(Recover())
	r.GET("/x", func(c *gin.Context) { panic("boom") })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))

	assert.Equal(t, 500, w.Code)
}

func TestRecover_normalRequest(t *testing.T) {
	r := gin.New()
	r.Use(Recover())
	r.GET("/x", func(c *gin.Context) { c.String(200, "ok") })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))

	assert.Equal(t, 200, w.Code)
	assert.Equal(t, "ok", w.Body.String())
}
