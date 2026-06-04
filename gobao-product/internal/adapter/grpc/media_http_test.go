package grpc

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// TestRegisterMediaHTTP_ServesFiles 验证本地媒体目录会稳定挂载到 /media。
// 该用例覆盖本次联调暴露出的 404 回归，防止后续再次把 URL 前缀清洗错误。
func TestRegisterMediaHTTP_ServesFiles(t *testing.T) {
	rootDir := t.TempDir()
	mediaDir := filepath.Join(rootDir, "groups", "5001", "gallery")
	if err := os.MkdirAll(mediaDir, 0o755); err != nil {
		t.Fatalf("mkdir media dir: %v", err)
	}
	targetFile := filepath.Join(mediaDir, "cover.jpg")
	if err := os.WriteFile(targetFile, []byte("media-ok"), 0o644); err != nil {
		t.Fatalf("write media file: %v", err)
	}

	mux := http.NewServeMux()
	RegisterMediaHTTP(mux, "/media", rootDir)

	req := httptest.NewRequest(http.MethodGet, "/media/groups/5001/gallery/cover.jpg", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status: got=%d body=%s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "media-ok" {
		t.Fatalf("unexpected body: %q", rec.Body.String())
	}
}
