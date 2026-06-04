package mysql

import (
	"reflect"
	"testing"
)

// TestEncodeSpecKeys 验证规格维度名称序列化为 JSON 数组文本。
func TestEncodeSpecKeys(t *testing.T) {
	if got := encodeSpecKeys([]string{"芯片", "内存"}); got != `["芯片","内存"]` {
		t.Fatalf("encodeSpecKeys 结果不符: %s", got)
	}
	if got := encodeSpecKeys(nil); got != "[]" {
		t.Fatalf("空维度应序列化为 []，实际: %s", got)
	}
}

// TestDecodeSpecKeys 验证 JSON 数组文本还原为规格维度名称。
func TestDecodeSpecKeys(t *testing.T) {
	if got := decodeSpecKeys(`["芯片","内存"]`); !reflect.DeepEqual(got, []string{"芯片", "内存"}) {
		t.Fatalf("decodeSpecKeys 结果不符: %#v", got)
	}
	if got := decodeSpecKeys(""); len(got) != 0 {
		t.Fatalf("空文本应还原为空切片，实际: %#v", got)
	}
	if got := decodeSpecKeys("not-json"); len(got) != 0 {
		t.Fatalf("非法 JSON 应还原为空切片，实际: %#v", got)
	}
}
