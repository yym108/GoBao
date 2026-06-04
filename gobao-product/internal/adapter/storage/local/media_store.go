package local

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// MediaStore 是本地文件系统媒体存储实现。
// 物理文件保存在 product 服务独占挂载目录，公开 URL 与内部存储路径解耦。
type MediaStore struct {
	rootDir string // 本地文件根目录
	baseURL string // 对外访问前缀，例如 /media
}

// NewMediaStore 构造本地媒体存储。
func NewMediaStore(rootDir string, baseURL string) *MediaStore {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		baseURL = "/media"
	}
	return &MediaStore{
		rootDir: filepath.Clean(rootDir),
		baseURL: "/" + strings.Trim(strings.TrimSpace(baseURL), "/"),
	}
}

// Save 保存文件并返回存储键与公开 URL。
func (s *MediaStore) Save(_ context.Context, folder string, originalName string, payload []byte) (string, string, error) {
	if len(payload) == 0 {
		return "", "", fmt.Errorf("payload is empty")
	}
	ext := filepath.Ext(strings.TrimSpace(originalName))
	fileName := fmt.Sprintf("%d-%d%s", time.Now().Unix(), time.Now().UnixNano()%1000000, ext)
	cleanFolder := strings.Trim(filepath.ToSlash(filepath.Clean(folder)), "/.")
	storageKey := filepath.ToSlash(filepath.Join(cleanFolder, fileName))
	targetDir := filepath.Join(s.rootDir, filepath.FromSlash(cleanFolder))
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return "", "", err
	}
	targetPath := filepath.Join(s.rootDir, filepath.FromSlash(storageKey))
	if err := os.WriteFile(targetPath, payload, 0o644); err != nil {
		return "", "", err
	}
	publicURL := s.baseURL + "/" + strings.TrimLeft(storageKey, "/")
	return storageKey, publicURL, nil
}

// Delete 删除本地文件，文件不存在时静默返回。
func (s *MediaStore) Delete(_ context.Context, storageKey string) error {
	if strings.TrimSpace(storageKey) == "" {
		return nil
	}
	targetPath := filepath.Join(s.rootDir, filepath.FromSlash(storageKey))
	if err := os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
