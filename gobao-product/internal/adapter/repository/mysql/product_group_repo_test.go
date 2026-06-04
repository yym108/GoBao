//go:build integration

package mysql_test

import (
	"context"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	mysqlrepo "github.com/yym108/gobao-product/internal/adapter/repository/mysql"
	"github.com/yym108/gobao-product/internal/domain"
)

// setupProductGroupRepo 创建 SQLite 内存数据库并迁移商品组与商品表。
func setupProductGroupRepo(t *testing.T) (*mysqlrepo.ProductGroupRepo, *gorm.DB, func()) {
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
		&mysqlrepo.ProductGroupModel{},
		&mysqlrepo.ProductModel{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return mysqlrepo.NewProductGroupRepo(db), db, func() { _ = sqlDB.Close() }
}

// TestProductGroupRepo_List 验证商品组列表按 sort_order、id 升序返回。
func TestProductGroupRepo_List(t *testing.T) {
	repo, db, cleanup := setupProductGroupRepo(t)
	defer cleanup()
	ctx := context.Background()

	if err := db.Create(&mysqlrepo.ProductGroupModel{ID: 20, Name: "MacBook Pro", Slug: "macbook-pro", CategoryID: 1, Status: 1, SortOrder: 2}).Error; err != nil {
		t.Fatalf("seed group 20: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductGroupModel{ID: 10, Name: "MacBook Air", Slug: "macbook-air", CategoryID: 1, Status: 1, SortOrder: 1}).Error; err != nil {
		t.Fatalf("seed group 10: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductGroupModel{ID: 30, Name: "iPad Pro", Slug: "ipad-pro", CategoryID: 2, Status: 1, SortOrder: 1}).Error; err != nil {
		t.Fatalf("seed group 30: %v", err)
	}

	list, total, err := repo.List(ctx, 1, 1, 20)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 2 {
		t.Fatalf("total want 2, got %d", total)
	}
	if len(list) != 2 {
		t.Fatalf("len want 2, got %d", len(list))
	}
	if list[0].ID != 10 || list[1].ID != 20 {
		t.Fatalf("unexpected order: %+v", list)
	}
}

// TestProductGroupRepo_FindByID 验证可以按主键读取单个商品组。
func TestProductGroupRepo_FindByID(t *testing.T) {
	repo, db, cleanup := setupProductGroupRepo(t)
	defer cleanup()
	ctx := context.Background()

	if err := db.Create(&mysqlrepo.ProductGroupModel{
		ID:           10,
		Name:         "MacBook Air",
		Slug:         "macbook-air",
		HeroTitle:    "轻薄，迅捷",
		HeroSubtitle: "M4 芯片",
		HeroImageURL: "https://example.com/macbook-air.png",
		CategoryID:   1,
		Status:       1,
		SortOrder:    1,
	}).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}

	got, err := repo.FindByID(ctx, 10)
	if err != nil {
		t.Fatalf("find by id: %v", err)
	}
	if got == nil || got.ID != 10 || got.Name != "MacBook Air" || got.HeroTitle != "轻薄，迅捷" {
		t.Fatalf("unexpected group: %+v", got)
	}
}

// TestProductGroupRepo_ListProductsByGroupID 验证同组商品按 sort_order 升序返回。
func TestProductGroupRepo_ListProductsByGroupID(t *testing.T) {
	repo, db, cleanup := setupProductGroupRepo(t)
	defer cleanup()
	ctx := context.Background()

	if err := db.Create(&mysqlrepo.ProductGroupModel{ID: 10, Name: "MacBook Air", Slug: "macbook-air", CategoryID: 1, Status: 1, SortOrder: 1}).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductModel{
		ID:          1002,
		Name:        "MacBook Air 13 16GB 512GB",
		Description: "variant 2",
		Price:       999900,
		CategoryID:  1,
		GroupID:     10,
		SpecLabel:   "16GB / 512GB",
		ImageURL:    "https://example.com/macbook-air-512.png",
		Status:      1,
		SortOrder:   2,
	}).Error; err != nil {
		t.Fatalf("seed product 1002: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductModel{
		ID:          1001,
		Name:        "MacBook Air 13 16GB 256GB",
		Description: "variant 1",
		Price:       899900,
		CategoryID:  1,
		GroupID:     10,
		SpecLabel:   "16GB / 256GB",
		ImageURL:    "https://example.com/macbook-air-256.png",
		Status:      1,
		SortOrder:   1,
	}).Error; err != nil {
		t.Fatalf("seed product 1001: %v", err)
	}

	items, err := repo.ListProductsByGroupID(ctx, 10)
	if err != nil {
		t.Fatalf("list products by group id: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("len want 2, got %d", len(items))
	}
	if items[0].ID != 1001 || items[1].ID != 1002 {
		t.Fatalf("unexpected order: %+v", items)
	}
	if items[0].Name != "MacBook Air 13 16GB 256GB" || items[1].Name != "MacBook Air 13 16GB 512GB" {
		t.Fatalf("unexpected products: %+v", items)
	}
}

// TestProductGroupRepo_CreateUpdateDelete 验证商品组写路径可用。
func TestProductGroupRepo_CreateUpdateDelete(t *testing.T) {
	repo, _, cleanup := setupProductGroupRepo(t)
	defer cleanup()
	ctx := context.Background()

	group := &domain.ProductGroup{
		Name:       "Mac mini",
		Slug:       "mac-mini",
		CategoryID: 2,
		Status:     1,
		SortOrder:  1,
	}
	if err := repo.Create(ctx, group); err != nil {
		t.Fatalf("create: %v", err)
	}
	if group.ID <= 0 {
		t.Fatalf("expect created group id, got %d", group.ID)
	}
	group.Name = "Mac mini M4"
	group.HeroTitle = "小巧强劲"
	group.CoverImageURL = "https://example.com/mac-mini-cover.png"
	if err := repo.Update(ctx, group); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, err := repo.FindByID(ctx, group.ID)
	if err != nil {
		t.Fatalf("find after update: %v", err)
	}
	if got == nil || got.Name != "Mac mini M4" || got.HeroTitle != "小巧强劲" {
		t.Fatalf("unexpected group after update: %+v", got)
	}
	if err := repo.Delete(ctx, group.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	deleted, err := repo.FindByID(ctx, group.ID)
	if err != nil {
		t.Fatalf("find after delete: %v", err)
	}
	if deleted != nil {
		t.Fatalf("expect nil after delete, got %+v", deleted)
	}
}

// TestProductGroupRepo_ExistsBySlugAndCount 验证商品组 slug 查询与商品计数。
func TestProductGroupRepo_ExistsBySlugAndCount(t *testing.T) {
	repo, db, cleanup := setupProductGroupRepo(t)
	defer cleanup()
	ctx := context.Background()

	if err := db.Create(&mysqlrepo.ProductGroupModel{ID: 10, Name: "MacBook Air", Slug: "macbook-air", CategoryID: 1, Status: 1, SortOrder: 1}).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductModel{
		ID:          1001,
		Name:        "MacBook Air 13 16GB 256GB",
		Description: "variant 1",
		Price:       899900,
		CategoryID:  1,
		GroupID:     10,
		SpecLabel:   "16GB / 256GB",
		ImageURL:    "https://example.com/macbook-air-256.png",
		Status:      1,
		SortOrder:   1,
	}).Error; err != nil {
		t.Fatalf("seed product: %v", err)
	}

	exists, err := repo.ExistsBySlug(ctx, "macbook-air", 0)
	if err != nil {
		t.Fatalf("exists by slug: %v", err)
	}
	if !exists {
		t.Fatal("expect slug exists")
	}

	count, err := repo.CountProductsByGroupID(ctx, 10)
	if err != nil {
		t.Fatalf("count products by group id: %v", err)
	}
	if count != 1 {
		t.Fatalf("count want 1, got %d", count)
	}
}
