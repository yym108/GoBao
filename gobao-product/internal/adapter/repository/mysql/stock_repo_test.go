//go:build integration

package mysql_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	mysqlrepo "github.com/yym108/gobao-product/internal/adapter/repository/mysql"
	"github.com/yym108/gobao-product/internal/domain"
)

// setupStockRepo 创建 SQLite 内存数据库并自动迁移,返回 repo、db 和清理函数。
func setupStockRepo(t *testing.T) (*mysqlrepo.StockRepo, *gorm.DB, func()) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared&_busy_timeout=5000"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("db handle: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&mysqlrepo.StockModel{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return mysqlrepo.NewStockRepo(db), db, func() { sqlDB.Close() }
}

// TestStockRepo_DeductAndRestore 测试扣减后回补,验证库存数量和版本号递增。
func TestStockRepo_DeductAndRestore(t *testing.T) {
	repo, db, cleanup := setupStockRepo(t)
	defer cleanup()
	ctx := context.Background()

	// 预置库存: quantity=100, version=0
	if err := db.Create(&mysqlrepo.StockModel{ProductID: 1, Quantity: 100, Version: 0}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	remaining, err := repo.Deduct(ctx, 1, 30)
	if err != nil || remaining != 70 {
		t.Fatalf("deduct: remaining=%d err=%v", remaining, err)
	}

	remaining, err = repo.Restore(ctx, 1, 10)
	if err != nil || remaining != 80 {
		t.Fatalf("restore: remaining=%d err=%v", remaining, err)
	}
}

// TestStockRepo_Deduct_Insufficient 测试库存不足时返回 ErrStockCASConflict。
func TestStockRepo_Deduct_Insufficient(t *testing.T) {
	repo, db, cleanup := setupStockRepo(t)
	defer cleanup()
	ctx := context.Background()

	db.Create(&mysqlrepo.StockModel{ProductID: 2, Quantity: 5, Version: 0})
	_, err := repo.Deduct(ctx, 2, 10)
	if err != domain.ErrStockCASConflict {
		t.Fatalf("expect ErrStockCASConflict, got %v", err)
	}
}

// TestStockRepo_SetQuantity 测试直接设置库存数量(商家修改上架数量)。
func TestStockRepo_SetQuantity(t *testing.T) {
	repo, db, cleanup := setupStockRepo(t)
	defer cleanup()
	ctx := context.Background()

	db.Create(&mysqlrepo.StockModel{ProductID: 3, Quantity: 50, Version: 0})

	// 直接设置为 200
	if err := repo.SetQuantity(ctx, 3, 200, 0); err != nil {
		t.Fatalf("set quantity: %v", err)
	}

	// 验证设置结果
	stock, err := repo.FindByProductID(ctx, 3)
	if err != nil || stock == nil {
		t.Fatalf("find: %+v, err=%v", stock, err)
	}
	if stock.Quantity != 200 {
		t.Fatalf("expect 200, got %d", stock.Quantity)
	}
	if stock.Version != 1 {
		t.Fatalf("expect version 1, got %d", stock.Version)
	}
}

func TestStockRepo_SetQuantity_StaleVersion(t *testing.T) {
	repo, db, cleanup := setupStockRepo(t)
	defer cleanup()
	ctx := context.Background()

	if err := db.Create(&mysqlrepo.StockModel{ProductID: 4, Quantity: 50, Version: 1}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	err := repo.SetQuantity(ctx, 4, 200, 0)
	if !errors.Is(err, domain.ErrStockCASConflict) {
		t.Fatalf("expect ErrStockCASConflict, got %v", err)
	}
}

// TestStockRepo_SyncQuantity 测试库存回写:直接覆盖 quantity,且不改动 version
// (version 仍服务后台 SetQuantity 的乐观锁语义,不应被同步操作递增)。
func TestStockRepo_SyncQuantity(t *testing.T) {
	repo, db, cleanup := setupStockRepo(t)
	defer cleanup()
	ctx := context.Background()

	// 预置: quantity=50, version=3(模拟后台改过几次库存)
	if err := db.Create(&mysqlrepo.StockModel{ProductID: 7, Quantity: 50, Version: 3}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	// 回写 Redis 权威值 12
	if err := repo.SyncQuantity(ctx, 7, 12); err != nil {
		t.Fatalf("sync: %v", err)
	}

	stock, err := repo.FindByProductID(ctx, 7)
	if err != nil || stock == nil {
		t.Fatalf("find: %+v err=%v", stock, err)
	}
	if stock.Quantity != 12 {
		t.Fatalf("expect quantity 12, got %d", stock.Quantity)
	}
	if stock.Version != 3 { // 回写不动 version
		t.Fatalf("expect version unchanged 3, got %d", stock.Version)
	}
}

func TestStockRepo_Deduct_Concurrent(t *testing.T) {
	repo, db, cleanup := setupStockRepo(t)
	defer cleanup()
	ctx := context.Background()

	const (
		productID   = int64(5)
		initialQty  = int32(20)
		deductQty   = int32(1)
		concurrency = 50
	)
	if err := db.Create(&mysqlrepo.StockModel{ProductID: productID, Quantity: initialQty, Version: 0}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	var successCount int32
	var wg sync.WaitGroup
	wg.Add(concurrency)
	for i := 0; i < concurrency; i++ {
		go func() {
			defer wg.Done()
			deadline := time.Now().Add(2 * time.Second)
			for {
				if _, err := repo.Deduct(ctx, productID, deductQty); err == nil {
					atomic.AddInt32(&successCount, 1)
					return
				} else if errors.Is(err, domain.ErrStockCASConflict) {
					return
				} else if time.Now().Before(deadline) {
					time.Sleep(5 * time.Millisecond)
					continue
				} else {
					t.Errorf("unexpected deduct err: %v", err)
					return
				}
			}
		}()
	}
	wg.Wait()

	stock, err := repo.FindByProductID(ctx, productID)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if stock == nil {
		t.Fatal("stock is nil")
	}
	if successCount != initialQty {
		t.Fatalf("success count want %d, got %d", initialQty, successCount)
	}
	if stock.Quantity != initialQty-successCount {
		t.Fatalf("quantity want %d, got %d", initialQty-successCount, stock.Quantity)
	}
	if stock.Quantity < 0 {
		t.Fatalf("quantity should not be negative, got %d", stock.Quantity)
	}
	if stock.Version != successCount {
		t.Fatalf("version want %d, got %d", successCount, stock.Version)
	}
}

func TestNewStockRepo_RejectsTransactionScopedDB(t *testing.T) {
	_, db, cleanup := setupStockRepo(t)
	defer cleanup()

	tx := db.Begin()
	if tx.Error != nil {
		t.Fatalf("begin tx: %v", tx.Error)
	}
	defer tx.Rollback()

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic for transaction-scoped db")
		}
	}()

	_ = mysqlrepo.NewStockRepo(tx)
}

func TestNewStockRepo_RejectsPreparedStatementTransaction(t *testing.T) {
	_, db, cleanup := setupStockRepo(t)
	defer cleanup()

	tx := db.Session(&gorm.Session{PrepareStmt: true}).Begin()
	if tx.Error != nil {
		t.Fatalf("begin tx: %v", tx.Error)
	}
	defer tx.Rollback()

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic for prepared statement transaction db")
		}
	}()

	_ = mysqlrepo.NewStockRepo(tx)
}
