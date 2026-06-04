// Package mq 提供 NATS JetStream 消息总线的统一封装，
// 供秒杀异步下单、库存扣减通知等场景使用。
package mq

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// Config 描述 NATS JetStream 连接与 Stream 配置
type Config struct {
	URL      string   // NATS 连接地址，如 "nats://localhost:4222"
	Stream   string   // Stream 名称，如 "SECKILL"
	Subjects []string // Stream 监听的 subject 模式，如 []string{"seckill.>"}
}

// Handler 是消息处理函数，返回 nil 表示处理成功（会 Ack），返回 error 会 Nak（触发重投）
type Handler func(ctx context.Context, payload []byte) error

// Bus 是对 NATS JetStream 的封装，提供 Publish / Subscribe / Close 三个操作
type Bus struct {
	nc  *nats.Conn
	js  jetstream.JetStream
	str jetstream.Stream
}

// New 建立 NATS 连接并确保 Stream 存在。
// 注意多个服务可能共享同一个 Stream 名称但声明不同 subject。
// 因此这里会先读取已有 Stream 配置，再把旧/新 subject 合并后更新，
// 避免后启动的服务把先前服务注册的主题覆盖掉。
func New(cfg Config) (*Bus, error) {
	nc, err := nats.Connect(cfg.URL)
	if err != nil {
		return nil, err
	}
	js, err := jetstream.New(nc)
	if err != nil {
		return nil, err
	}
	ctx := context.Background()

	streamCfg := jetstream.StreamConfig{
		Name:     cfg.Stream,
		Subjects: slices.Clone(cfg.Subjects),
		Storage:  jetstream.FileStorage,
	}
	if existing, err := js.Stream(ctx, cfg.Stream); err == nil {
		info, err := existing.Info(ctx)
		if err != nil {
			return nil, fmt.Errorf("stream info: %w", err)
		}
		streamCfg.Subjects = mergeSubjects(info.Config.Subjects, cfg.Subjects)
		streamCfg.Storage = info.Config.Storage
	}

	str, err := js.CreateOrUpdateStream(ctx, streamCfg)
	if err != nil {
		return nil, fmt.Errorf("stream: %w", err)
	}
	return &Bus{nc: nc, js: js, str: str}, nil
}

// mergeSubjects 合并已有 subject 与新增 subject，并保持原有顺序稳定。
// 这样共享 Stream 的多个服务可以逐步扩展监听范围，而不会互相覆盖配置，
// 同时会剔除被更宽泛模式覆盖的窄 subject，避免 NATS 报 overlap 冲突。
func mergeSubjects(existing, incoming []string) []string {
	merged := make([]string, 0, len(existing)+len(incoming))

	for _, subject := range existing {
		merged = appendSubject(merged, subject)
	}
	for _, subject := range incoming {
		merged = appendSubject(merged, subject)
	}
	return merged
}

// appendSubject 将 subject 合并进列表。
// 如果已有模式已覆盖该 subject，则直接跳过；
// 如果新 subject 覆盖已有的更窄模式，则移除旧模式后再加入新模式。
func appendSubject(subjects []string, subject string) []string {
	for _, existing := range subjects {
		if subject == existing || covers(existing, subject) {
			return subjects
		}
	}

	filtered := subjects[:0]
	for _, existing := range subjects {
		if covers(subject, existing) {
			continue
		}
		filtered = append(filtered, existing)
	}
	return append(filtered, subject)
}

// covers 判断 wider 是否覆盖 narrower。
// 当前只处理本项目用到的两类模式：
// 1. 精确 subject，如 "order.created"
// 2. 以 ".>" 结尾的前缀匹配，如 "seckill.>"
func covers(wider, narrower string) bool {
	if wider == narrower {
		return true
	}
	if strings.HasSuffix(wider, ".>") {
		prefix := strings.TrimSuffix(wider, ">")
		return strings.HasPrefix(narrower, prefix)
	}
	return false
}

// Publish 向指定 subject 发布一条消息
func (b *Bus) Publish(ctx context.Context, subject string, data []byte) error {
	_, err := b.js.Publish(ctx, subject, data)
	return err
}

// Subscribe 创建一个持久消费者并开始消费。
// consumer 是持久化名称（重启后继续从上次位置消费），subject 是过滤条件。
func (b *Bus) Subscribe(ctx context.Context, consumer, subject string, h Handler) error {
	c, err := b.str.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       consumer,
		FilterSubject: subject,
		AckPolicy:     jetstream.AckExplicitPolicy,
	})
	if err != nil {
		return err
	}
	_, err = c.Consume(func(msg jetstream.Msg) {
		if err := h(ctx, msg.Data()); err != nil {
			_ = msg.Nak()
			return
		}
		_ = msg.Ack()
	})
	return err
}

// Close 关闭 NATS 连接
func (b *Bus) Close() { b.nc.Close() }
