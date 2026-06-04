package redisrepo

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"
)

// fakeQuantityWriter 记录回写调用,充当 MySQL 备份写入端。
type fakeQuantityWriter struct {
	mu      sync.Mutex
	written map[int64]int32 // productID -> 最后一次回写的数量
}

func newFakeQuantityWriter() *fakeQuantityWriter {
	return &fakeQuantityWriter{written: map[int64]int32{}}
}

func (f *fakeQuantityWriter) SyncQuantity(_ context.Context, productID int64, quantity int32) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.written[productID] = quantity
	return nil
}

func (f *fakeQuantityWriter) snapshot() map[int64]int32 {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := make(map[int64]int32, len(f.written))
	for k, v := range f.written {
		cp[k] = v
	}
	return cp
}

func setupSyncer(t *testing.T, interval time.Duration) (*StockSyncer, *fakeQuantityWriter, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := goredis.NewClient(&goredis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	w := newFakeQuantityWriter()
	return NewStockSyncer(rdb, w, interval), w, mr
}

// TestStockSyncer_SyncOnce_WritesAllStockKeys 验证一次扫描把所有库存键回写,且忽略无关键。
func TestStockSyncer_SyncOnce_WritesAllStockKeys(t *testing.T) {
	syncer, w, mr := setupSyncer(t, time.Minute)
	_ = mr.Set(stockKey(101), "90")
	_ = mr.Set(stockKey(202), "30")
	_ = mr.Set("some:other:key", "999") // 无关键,应被忽略

	n, err := syncer.syncOnce(context.Background())
	if err != nil {
		t.Fatalf("syncOnce: %v", err)
	}
	if n != 2 {
		t.Fatalf("expect synced 2, got %d", n)
	}
	got := w.snapshot()
	if got[101] != 90 || got[202] != 30 {
		t.Fatalf("unexpected writeback: %+v", got)
	}
	if _, ok := got[999]; ok {
		t.Fatalf("non-stock key must not be written back: %+v", got)
	}
}

// TestStockSyncer_Run_FlushesOnContextCancel 验证 ctx 取消时会做最后一次回写(尽量减少丢失)。
func TestStockSyncer_Run_FlushesOnContextCancel(t *testing.T) {
	// 用很长的 interval,确保不是定时触发,而是退出前的 flush 写入。
	syncer, w, mr := setupSyncer(t, time.Hour)
	_ = mr.Set(stockKey(303), "7")

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		syncer.Run(ctx)
		close(done)
	}()
	cancel()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}

	if w.snapshot()[303] != 7 {
		t.Fatalf("expect flush writeback 7, got %+v", w.snapshot())
	}
}
