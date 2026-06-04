package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yym108/gobao-pkg/config"
)

type DemoCfg struct {
	HTTPAddr string `mapstructure:"http_addr"`
	GRPCAddr string `mapstructure:"grpc_addr"`
	LogLevel string `mapstructure:"log_level"`
}

func TestLoad_envOverride(t *testing.T) {
	t.Setenv("APP_HTTP_ADDR", ":9999")

	var c DemoCfg
	require.NoError(t, config.Load("APP", "", &c))
	assert.Equal(t, ":9999", c.HTTPAddr)
}

func TestLoad_fileOnly(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cfg.yaml")
	content := "http_addr: :8080\ngrpc_addr: :9090\nlog_level: debug\n"
	require.NoError(t, os.WriteFile(path, []byte(content), 0644))

	var c DemoCfg
	require.NoError(t, config.Load("APP", path, &c))
	assert.Equal(t, ":8080", c.HTTPAddr)
	assert.Equal(t, ":9090", c.GRPCAddr)
	assert.Equal(t, "debug", c.LogLevel)
}

func TestLoad_envBeatsFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cfg.yaml")
	require.NoError(t, os.WriteFile(path, []byte("http_addr: :8080\n"), 0644))

	t.Setenv("APP_HTTP_ADDR", ":7777")

	var c DemoCfg
	require.NoError(t, config.Load("APP", path, &c))
	assert.Equal(t, ":7777", c.HTTPAddr, "env 必须覆盖 file")
}

func TestLoad_missingFileIsNotError(t *testing.T) {
	var c DemoCfg
	err := config.Load("APP", "/nonexistent/path.yaml", &c)
	require.NoError(t, err)
}
