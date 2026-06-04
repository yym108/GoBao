package mq

import (
	"context"
	"testing"
	"time"

	"github.com/nats-io/nats-server/v2/server"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// runEmbeddedNATS 在进程内启动一个带 JetStream 的 NATS server，
// 返回连接地址，测试结束自动关闭。
func runEmbeddedNATS(t *testing.T) string {
	t.Helper()
	opts := &server.Options{
		Port:      -1,
		JetStream: true,
		StoreDir:  t.TempDir(),
	}
	s, err := server.NewServer(opts)
	require.NoError(t, err)
	go s.Start()
	require.True(t, s.ReadyForConnections(2*time.Second))
	t.Cleanup(s.Shutdown)
	return s.ClientURL()
}

func TestPublishSubscribe(t *testing.T) {
	url := runEmbeddedNATS(t)
	bus, err := New(Config{
		URL:      url,
		Stream:   "TEST",
		Subjects: []string{"test.>"},
	})
	require.NoError(t, err)
	defer bus.Close()

	got := make(chan []byte, 1)
	err = bus.Subscribe(context.Background(), "test-consumer", "test.foo",
		func(_ context.Context, payload []byte) error {
			got <- payload
			return nil
		})
	require.NoError(t, err)

	err = bus.Publish(context.Background(), "test.foo", []byte("hello"))
	require.NoError(t, err)

	select {
	case p := <-got:
		assert.Equal(t, "hello", string(p))
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for message")
	}
}
