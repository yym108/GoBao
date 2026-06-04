//go:build integration

package mysql_test

import (
	"context"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	mysqlrepo "github.com/yym108/gobao-product/internal/adapter/repository/mysql"
	"github.com/yym108/gobao-product/internal/domain"
)

// setupSeckillActivityRepo 创建 SQLite 内存数据库并自动迁移，返回 repo、db 和清理函数。
func setupSeckillActivityRepo(t *testing.T) (*mysqlrepo.SeckillActivityRepo, *gorm.DB, func()) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&mysqlrepo.SeckillActivityModel{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return mysqlrepo.NewSeckillActivityRepo(db), db, func() { sqlDB, _ := db.DB(); sqlDB.Close() }
}

// TestSeckillActivityRepo_CreateAndFindByID 测试创建活动后能按 ID 查回完整字段。
func TestSeckillActivityRepo_CreateAndFindByID(t *testing.T) {
	repo, _, cleanup := setupSeckillActivityRepo(t)
	defer cleanup()
	ctx := context.Background()

	startAt := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	endAt := startAt.Add(2 * time.Hour)
	activity := &domain.SeckillActivity{
		ProductID:    1001,
		Title:        "五一秒杀",
		SeckillPrice: 9900,
		SeckillStock: 50,
		Status:       domain.SeckillStatusActive,
		StartAt:      startAt,
		EndAt:        endAt,
	}

	if err := repo.Create(ctx, activity); err != nil {
		t.Fatalf("create: %v", err)
	}
	if activity.ID == 0 {
		t.Fatal("expect activity id assigned")
	}

	got, err := repo.FindByID(ctx, activity.ID)
	if err != nil {
		t.Fatalf("find by id: %v", err)
	}
	if got == nil {
		t.Fatal("expect activity found")
	}
	if got.Title != activity.Title {
		t.Fatalf("title want %q, got %q", activity.Title, got.Title)
	}
	if got.ProductID != activity.ProductID {
		t.Fatalf("product id want %d, got %d", activity.ProductID, got.ProductID)
	}
	if got.SeckillPrice != activity.SeckillPrice {
		t.Fatalf("seckill price want %d, got %d", activity.SeckillPrice, got.SeckillPrice)
	}
	if got.SeckillStock != activity.SeckillStock {
		t.Fatalf("seckill stock want %d, got %d", activity.SeckillStock, got.SeckillStock)
	}
	if got.Status != activity.Status {
		t.Fatalf("status want %d, got %d", activity.Status, got.Status)
	}
	if !got.StartAt.Equal(activity.StartAt) {
		t.Fatalf("start at want %s, got %s", activity.StartAt, got.StartAt)
	}
	if !got.EndAt.Equal(activity.EndAt) {
		t.Fatalf("end at want %s, got %s", activity.EndAt, got.EndAt)
	}
}

// TestSeckillActivityRepo_Update 测试更新活动后字段已持久化。
func TestSeckillActivityRepo_Update(t *testing.T) {
	repo, _, cleanup := setupSeckillActivityRepo(t)
	defer cleanup()
	ctx := context.Background()

	startAt := time.Date(2026, 5, 2, 10, 0, 0, 0, time.UTC)
	endAt := startAt.Add(90 * time.Minute)
	activity := &domain.SeckillActivity{
		ProductID:    1002,
		Title:        "午间秒杀",
		SeckillPrice: 15900,
		SeckillStock: 20,
		Status:       domain.SeckillStatusDraft,
		StartAt:      startAt,
		EndAt:        endAt,
	}

	if err := repo.Create(ctx, activity); err != nil {
		t.Fatalf("create: %v", err)
	}

	updatedAt := time.Date(2026, 5, 2, 9, 30, 0, 0, time.UTC)
	activity.Title = "午间限时秒杀"
	activity.ProductID = 2002
	activity.SeckillPrice = 12900
	activity.SeckillStock = 35
	activity.Status = domain.SeckillStatusActive
	activity.StartAt = startAt.Add(30 * time.Minute)
	activity.EndAt = endAt.Add(30 * time.Minute)
	activity.UpdatedAt = updatedAt

	if err := repo.Update(ctx, activity); err != nil {
		t.Fatalf("update: %v", err)
	}

	got, err := repo.FindByID(ctx, activity.ID)
	if err != nil {
		t.Fatalf("find by id after update: %v", err)
	}
	if got == nil {
		t.Fatal("expect activity found after update")
	}
	if got.Title != activity.Title {
		t.Fatalf("title want %q, got %q", activity.Title, got.Title)
	}
	if got.ProductID != activity.ProductID {
		t.Fatalf("product id want %d, got %d", activity.ProductID, got.ProductID)
	}
	if got.SeckillPrice != activity.SeckillPrice {
		t.Fatalf("seckill price want %d, got %d", activity.SeckillPrice, got.SeckillPrice)
	}
	if got.SeckillStock != activity.SeckillStock {
		t.Fatalf("seckill stock want %d, got %d", activity.SeckillStock, got.SeckillStock)
	}
	if got.Status != activity.Status {
		t.Fatalf("status want %d, got %d", activity.Status, got.Status)
	}
	if !got.StartAt.Equal(activity.StartAt) {
		t.Fatalf("start at want %s, got %s", activity.StartAt, got.StartAt)
	}
	if !got.EndAt.Equal(activity.EndAt) {
		t.Fatalf("end at want %s, got %s", activity.EndAt, got.EndAt)
	}
	if !got.UpdatedAt.Equal(activity.UpdatedAt) {
		t.Fatalf("updated at want %s, got %s", activity.UpdatedAt, got.UpdatedAt)
	}
}
