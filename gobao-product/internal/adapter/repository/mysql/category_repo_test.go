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

// setupCategoryRepo 创建 SQLite 内存数据库并自动迁移,返回 repo、db 和清理函数。
func setupCategoryRepo(t *testing.T) (*mysqlrepo.CategoryRepo, *gorm.DB, func()) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&mysqlrepo.CategoryModel{}, &mysqlrepo.ProductModel{}, &mysqlrepo.ProductGroupModel{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	repo := mysqlrepo.NewCategoryRepo(db)
	return repo, db, func() { sqlDB, _ := db.DB(); sqlDB.Close() }
}

// TestCategoryRepo_CreateAndFind 测试创建类目后能按 ID 查询到。
func TestCategoryRepo_CreateAndFind(t *testing.T) {
	repo, _, cleanup := setupCategoryRepo(t)
	defer cleanup()
	ctx := context.Background()

	c := &domain.Category{Name: "数码", SortOrder: 1}
	if err := repo.Create(ctx, c); err != nil {
		t.Fatalf("create: %v", err)
	}
	got, err := repo.FindByID(ctx, c.ID)
	if err != nil || got == nil || got.Name != "数码" {
		t.Fatalf("find: %+v, err=%v", got, err)
	}
}

// TestCategoryRepo_ListOrder 测试列表查询按 sort_order 升序排列。
func TestCategoryRepo_ListOrder(t *testing.T) {
	repo, _, cleanup := setupCategoryRepo(t)
	defer cleanup()
	ctx := context.Background()

	repo.Create(ctx, &domain.Category{Name: "B", SortOrder: 2})
	repo.Create(ctx, &domain.Category{Name: "A", SortOrder: 1})
	list, _ := repo.List(ctx)
	if len(list) != 2 || list[0].Name != "A" || list[1].Name != "B" {
		t.Fatalf("order wrong: %+v", list)
	}
}

// TestCategoryRepo_ExistsByName 测试名称唯一性校验,含排除自身场景。
func TestCategoryRepo_ExistsByName(t *testing.T) {
	repo, _, cleanup := setupCategoryRepo(t)
	defer cleanup()
	ctx := context.Background()

	repo.Create(ctx, &domain.Category{Name: "唯一"})
	exists, _ := repo.ExistsByName(ctx, "唯一", 0)
	if !exists {
		t.Fatal("expect exists")
	}
	exists, _ = repo.ExistsByName(ctx, "唯一", 1)
	if exists {
		t.Fatal("expect not exists when exclude self")
	}
}

// TestProductGroupRepo_ClearCategoryByCategoryID 测试按类目批量清空商品组类目。
func TestProductGroupRepo_ClearCategoryByCategoryID(t *testing.T) {
	_, db, cleanup := setupCategoryRepo(t)
	defer cleanup()
	ctx := context.Background()

	groupRepo := mysqlrepo.NewProductGroupRepo(db)

	if err := db.Create(&mysqlrepo.ProductGroupModel{ID: 11, Name: "A", Slug: "a", CategoryID: 3, Status: 1}).Error; err != nil {
		t.Fatalf("create group a: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductGroupModel{ID: 12, Name: "B", Slug: "b", CategoryID: 3, Status: 1}).Error; err != nil {
		t.Fatalf("create group b: %v", err)
	}
	if err := db.Create(&mysqlrepo.ProductGroupModel{ID: 13, Name: "C", Slug: "c", CategoryID: 9, Status: 1}).Error; err != nil {
		t.Fatalf("create group c: %v", err)
	}

	if err := groupRepo.ClearCategoryByCategoryID(ctx, 3); err != nil {
		t.Fatalf("clear category: %v", err)
	}

	var groups []mysqlrepo.ProductGroupModel
	if err := db.Order("id ASC").Find(&groups).Error; err != nil {
		t.Fatalf("query groups: %v", err)
	}

	if groups[0].CategoryID != 0 || groups[1].CategoryID != 0 {
		t.Fatalf("expect first two groups category cleared, got %+v", groups)
	}
	if groups[2].CategoryID != 9 {
		t.Fatalf("expect unrelated group keep category 9, got %+v", groups[2])
	}
}
