package server

import (
	"context"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRunHealthz(t *testing.T) {
	s := New("test", Options{HTTPAddr: "127.0.0.1:0", GRPCAddr: "127.0.0.1:0"})
	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() { errCh <- s.Run(ctx) }()
	defer func() { cancel(); <-errCh }()

	require.Eventually(t, func() bool {
		addr := s.HTTPListenAddr()
		if addr == "" {
			return false
		}
		resp, err := http.Get("http://" + addr + "/healthz")
		if err != nil {
			return false
		}
		defer func() { _ = resp.Body.Close() }()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode == 200 && string(b) == "ok"
	}, 2*time.Second, 50*time.Millisecond)
}

func TestRunReadyz(t *testing.T) {
	s := New("test", Options{HTTPAddr: "127.0.0.1:0", GRPCAddr: "127.0.0.1:0"})
	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() { errCh <- s.Run(ctx) }()
	defer func() { cancel(); <-errCh }()

	require.Eventually(t, func() bool {
		addr := s.HTTPListenAddr()
		if addr == "" {
			return false
		}
		resp, err := http.Get("http://" + addr + "/readyz")
		if err != nil {
			return false
		}
		defer func() { _ = resp.Body.Close() }()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode == 200 && string(b) == "ok"
	}, 2*time.Second, 50*time.Millisecond)
}

func TestRunGracefulShutdown(t *testing.T) {
	s := New("test", Options{HTTPAddr: "127.0.0.1:0", GRPCAddr: "127.0.0.1:0"})
	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() { errCh <- s.Run(ctx) }()

	require.Eventually(t, func() bool {
		addr := s.HTTPListenAddr()
		if addr == "" {
			return false
		}
		resp, err := http.Get("http://" + addr + "/healthz")
		if err != nil {
			return false
		}
		_ = resp.Body.Close()
		return resp.StatusCode == 200
	}, 2*time.Second, 50*time.Millisecond)

	cancel()
	err := <-errCh
	assert.NoError(t, err, "优雅关停应返回 nil")
}
