package local_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yym108/gobao-product/internal/adapter/storage/local"
)

func TestLocalMediaStore_Save(t *testing.T) {
	rootDir := t.TempDir()
	store := local.NewMediaStore(rootDir, "/media")

	storageKey, publicURL, err := store.Save(context.Background(), "groups/5001/gallery", "hero.jpg", []byte("fake-image-bytes"))
	if err != nil {
		t.Fatalf("save media: %v", err)
	}
	if !strings.HasPrefix(storageKey, "groups/5001/gallery/") {
		t.Fatalf("unexpected storage key: %s", storageKey)
	}
	if !strings.HasPrefix(publicURL, "/media/groups/5001/gallery/") {
		t.Fatalf("unexpected public url: %s", publicURL)
	}
	fullPath := filepath.Join(rootDir, filepath.FromSlash(storageKey))
	if _, err := os.Stat(fullPath); err != nil {
		t.Fatalf("stat saved file: %v", err)
	}
}
