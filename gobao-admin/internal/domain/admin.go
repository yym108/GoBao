// Package domain 定义管理员领域模型与仓储接口，不依赖任何框架。
package domain

import "time"

// Admin 是管理员领域模型。
// 它与普通用户分库隔离，避免后台账号与前台账号混用。
type Admin struct {
	ID           int64     // 管理员唯一标识（数据库自增主键）
	Email        string    // 管理员邮箱（唯一，用于登录）
	PasswordHash string    // bcrypt 哈希后的密码
	Nickname     string    // 后台展示用昵称
	AvatarURL    string    // 管理员头像地址，当前先保存为字符串字段
	IsSuperAdmin bool      // 是否为超级管理员，超管可管理其他后台账号
	CreatedAt    time.Time // 创建时间
	UpdatedAt    time.Time // 更新时间
}
