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

// setupProductRepo 创建 SQLite 内存数据库并自动迁移,返回 repo、db 和清理函数。
func setupProductRepo(t *testing.T) (*mysqlrepo.ProductRepo, *gorm.DB, func()) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&mysqlrepo.ProductModel{}, &mysqlrepo.StockModel{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return mysqlrepo.NewProductRepo(db), db, func() { sqlDB, _ := db.DB(); sqlDB.Close() }
}

// TestProductRepo_CRUD 测试商品创建、查询、更新、软删除完整生命周期。
func TestProductRepo_CRUD(t *testing.T) {
	repo, _, cleanup := setupProductRepo(t)
	defer cleanup()
	ctx := context.Background()

	p := &domain.Product{Name: "Book", Price: 1000, CategoryID: 1, Status: domain.ProductStatusOnSale}
	if err := repo.Create(ctx, p); err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := repo.FindByID(ctx, p.ID)
	if err != nil || got == nil || got.Name != "Book" {
		t.Fatalf("find: %+v, err=%v", got, err)
	}

	p.Name = "NewBook"
	if err := repo.Update(ctx, p); err != nil {
		t.Fatalf("update: %v", err)
	}

	if err := repo.SoftDelete(ctx, p.ID); err != nil {
		t.Fatalf("soft delete: %v", err)
	}
	got2, _ := repo.FindByID(ctx, p.ID)
	if got2 != nil {
		t.Fatalf("expect nil after soft delete, got %+v", got2)
	}
}

// TestProductRepo_ListPagination 测试分页查询和总数统计。
func TestProductRepo_ListPagination(t *testing.T) {
	repo, _, cleanup := setupProductRepo(t)
	defer cleanup()
	ctx := context.Background()

	for i := 1; i <= 5; i++ {
		repo.Create(ctx, &domain.Product{Name: "p", Price: 1, CategoryID: 1})
	}
	items, total, err := repo.List(ctx, 0, 1, 2)
	if err != nil || total != 5 || len(items) != 2 {
		t.Fatalf("total=%d len=%d err=%v", total, len(items), err)
	}
}
