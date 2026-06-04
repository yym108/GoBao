package mysql_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestInitProductSQL_UsesProductGroupSchema 保证 product 初始化脚本只保留当前独立商品版本模型，
// 避免已经废弃的旧 SKU 体系继续回流到本地数据库。
func TestInitProductSQL_UsesProductGroupSchema(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve current test file path")
	}

	sqlPath := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "../../../../../gobao-deploy/sql/init-product.sql"))
	content, err := os.ReadFile(sqlPath)
	if err != nil {
		t.Fatalf("read init-product.sql: %v", err)
	}

	sqlText := string(content)
	legacyTables := []string{
		"CREATE TABLE IF NOT EXISTS product_option_groups",
		"CREATE TABLE IF NOT EXISTS product_option_values",
		"CREATE TABLE IF NOT EXISTS product_skus",
		"CREATE TABLE IF NOT EXISTS product_sku_option_values",
	}

	for _, tableDDL := range legacyTables {
		if strings.Contains(sqlText, tableDDL) {
			t.Fatalf("legacy table definition should be removed from init-product.sql: %s", tableDDL)
		}
	}

	currentTables := []string{
		"CREATE TABLE IF NOT EXISTS products",
		"CREATE TABLE IF NOT EXISTS product_groups",
		"CREATE TABLE IF NOT EXISTS stocks",
	}
	for _, tableDDL := range currentTables {
		if !strings.Contains(sqlText, tableDDL) {
			t.Fatalf("current table definition missing from init-product.sql: %s", tableDDL)
		}
	}

	chineseSpecContracts := []string{
		`'["芯片","内存","存储"]'`,
		`'["颜色","存储"]'`,
		`'{"芯片":"M4","内存":"16GB","存储":"256GB"}'`,
		`'{"颜色":"沙漠色","存储":"256GB"}'`,
		`'{"连接方式":"USB-C 版"}'`,
	}
	for _, contract := range chineseSpecContracts {
		if !strings.Contains(sqlText, contract) {
			t.Fatalf("default product spec should use Chinese keys, missing: %s", contract)
		}
	}

	englishSpecKeys := []string{
		`"chip"`,
		`"memory"`,
		`"storage"`,
		`"color"`,
		`"edition"`,
	}
	for _, key := range englishSpecKeys {
		if strings.Contains(sqlText, key) {
			t.Fatalf("default product spec should not use English key: %s", key)
		}
	}
}

// TestDefaultProductSpecMigration_UsesUTF8 保证手动修复默认商品规格时显式使用 utf8mb4，
// 避免 MySQL 客户端默认 latin1 时把中文规格键写成乱码。
func TestDefaultProductSpecMigration_UsesUTF8(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve current test file path")
	}

	sqlPath := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "../../../../../gobao-deploy/sql/migrate-default-product-specs-zh.sql"))
	content, err := os.ReadFile(sqlPath)
	if err != nil {
		t.Fatalf("read migrate-default-product-specs-zh.sql: %v", err)
	}

	sqlText := string(content)
	if !strings.Contains(sqlText, "SET NAMES utf8mb4;") {
		t.Fatal("default product spec migration must force utf8mb4 connection")
	}
	if !strings.Contains(sqlText, `{"芯片":"M4","内存":"16GB","存储":"256GB"}`) {
		t.Fatal("default product spec migration should keep Chinese spec JSON")
	}
}
