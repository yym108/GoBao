// Package config 提供统一的服务配置加载能力，遵循
// env > file > struct 零值 的优先级约定，供项目内所有微服务复用。
package config

import (
	"reflect"
	"strings"

	"github.com/spf13/viper"
)

// Load 从环境变量和可选的配置文件加载配置到 out。
//
// 优先级：env > file > struct 字段零值。
//
// 参数：
//   - envPrefix: 环境变量前缀（如 "USER"），与字段 mapstructure tag 组合成
//     完整 env 名。例 tag "http_addr" + prefix "USER" -> USER_HTTP_ADDR。
//   - file:      配置文件路径（如 "config.yaml"）。传空串则跳过文件加载；
//     文件缺失不会返回错误（允许纯 env 部署）。
//   - out:       必须是指向 struct 的指针；按字段的 mapstructure tag 映射填充。
//
// 典型用法：
//
//	var cfg UserCfg
//	if err := config.Load("USER", "config.yaml", &cfg); err != nil {
//	    log.Fatal(err)
//	}
func Load(envPrefix, file string, out any) error {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_", "-", "_"))
	v.AutomaticEnv()

	bindEnvs(v, out)

	if file != "" {
		v.SetConfigFile(file)
		_ = v.ReadInConfig()
	}
	return v.Unmarshal(out)
}

// bindEnvs 遍历 out 的 mapstructure tag，对每个 tag 调 v.BindEnv。
//
// 解决 viper 的 AutomaticEnv 默认只识别"已知 key"的限制——
// 当没有配置文件时，viper 不知道有哪些 key 要去 env 里查；
// 这里通过反射把 struct 的 tag 主动注册，保证纯 env 场景也能正确加载。
//
// 仅处理顶层字段，不递归嵌套 struct。tag 为空或 "-" 的字段跳过。
func bindEnvs(v *viper.Viper, out any) {
	t := reflect.TypeOf(out)
	if t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		return
	}
	for i := 0; i < t.NumField(); i++ {
		tag := t.Field(i).Tag.Get("mapstructure")
		if tag == "" || tag == "-" {
			continue
		}
		_ = v.BindEnv(tag)
	}
}
