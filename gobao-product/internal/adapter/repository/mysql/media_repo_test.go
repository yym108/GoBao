//go:build integration

package mysql_test

import (
	"context"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	mysqlrepo "github.com/yym108/gobao-product/internal/adapter/repository/mysql"
)

func setupMediaRepo(t *testing.T) (*mysqlrepo.ProductGroupMediaRepo, *mysqlrepo.ProductMediaRepo, *gorm.DB, func()) {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("db handle: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(
		&mysqlrepo.MediaAssetModel{},
		&mysqlrepo.ProductGroupModel{},
		&mysqlrepo.ProductModel{},
		&mysqlrepo.ProductGroupMediaBindingModel{},
		&mysqlrepo.ProductMediaBindingModel{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return mysqlrepo.NewProductGroupMediaRepo(db), mysqlrepo.NewProductMediaRepo(db), db, func() { _ = sqlDB.Close() }
}

func TestProductGroupMediaRepo_ListByGroupID(t *testing.T) {
	repo, _, db, cleanup := setupMediaRepo(t)
	defer cleanup()
	ctx := context.Background()

	if err := db.Create(&mysqlrepo.ProductGroupModel{ID: 5001, Name: "MacBook Air", Slug: "macbook-air", CategoryID: 1, Status: 1}).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}
	if err := db.Create(&mysqlrepo.MediaAssetModel{ID: 9001, StorageKey: "groups/5001/gallery/1.jpg", PublicURL: "/media/groups/5001/gallery/1.jpg", FileName: "1.jpg", MIMEType: "image/jpeg", SizeBytes: 1}).Error; err != nil {
		t.Fatalf("seed media 9001: %v", err)
	}
	if err := db.Create(&mysqlrepo.MediaAssetModel{ID: 9002, StorageKey: "groups/5001/gallery/2.jpg", PublicURL: "/media/groups/5001/gallery/2.jpg", FileName: "2.jpg", MIMEType: "image/jpeg", SizeBytes: 1}).Error; err != nil {
		t.Fatalf("seed media 9002: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductGroupMediaBindingModel{ID: 1, GroupID: 5001, MediaID: 9001, UsageType: "cover", SortOrder: 1, IsPrimary: true}).Error; err != nil {
		t.Fatalf("seed binding 1: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductGroupMediaBindingModel{ID: 2, GroupID: 5001, MediaID: 9002, UsageType: "gallery", SortOrder: 2, IsPrimary: false}).Error; err != nil {
		t.Fatalf("seed binding 2: %v", err)
	}

	items, err := repo.ListByGroupID(ctx, 5001)
	if err != nil {
		t.Fatalf("list by group id: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("len want 2, got %d", len(items))
	}
	if items[0].Media == nil || items[0].Media.ID != 9001 {
		t.Fatalf("unexpected first media: %+v", items[0].Media)
	}
	if items[1].UsageType != "gallery" {
		t.Fatalf("unexpected usage type: %s", items[1].UsageType)
	}
}

func TestProductMediaRepo_ListByProductID(t *testing.T) {
	_, repo, db, cleanup := setupMediaRepo(t)
	defer cleanup()
	ctx := context.Background()

	if err := db.Create(&mysqlrepo.ProductModel{ID: 1001001, GroupID: 5001, Name: "MacBook Air", Price: 899900, CategoryID: 1, Status: 1}).Error; err != nil {
		t.Fatalf("seed product: %v", err)
	}
	if err := db.Create(&mysqlrepo.MediaAssetModel{ID: 9001, StorageKey: "products/1001001/gallery/1.jpg", PublicURL: "/media/products/1001001/gallery/1.jpg", FileName: "1.jpg", MIMEType: "image/jpeg", SizeBytes: 1}).Error; err != nil {
		t.Fatalf("seed media 9001: %v", err)
	}
	if err := db.Create(&mysqlrepo.MediaAssetModel{ID: 9002, StorageKey: "products/1001001/gallery/2.jpg", PublicURL: "/media/products/1001001/gallery/2.jpg", FileName: "2.jpg", MIMEType: "image/jpeg", SizeBytes: 1}).Error; err != nil {
		t.Fatalf("seed media 9002: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductMediaBindingModel{ID: 1, ProductID: 1001001, MediaID: 9001, UsageType: "gallery", SortOrder: 1, IsPrimary: true}).Error; err != nil {
		t.Fatalf("seed binding 1: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductMediaBindingModel{ID: 2, ProductID: 1001001, MediaID: 9002, UsageType: "gallery", SortOrder: 2, IsPrimary: false}).Error; err != nil {
		t.Fatalf("seed binding 2: %v", err)
	}

	items, err := repo.ListByProductID(ctx, 1001001)
	if err != nil {
		t.Fatalf("list by product id: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("len want 2, got %d", len(items))
	}
	if items[0].Media == nil || items[0].Media.ID != 9001 {
		t.Fatalf("unexpected first media: %+v", items[0].Media)
	}
	if items[1].UsageType != "gallery" {
		t.Fatalf("unexpected usage type: %s", items[1].UsageType)
	}
}
