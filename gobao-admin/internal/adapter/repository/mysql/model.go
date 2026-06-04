// Package mysql 提供基于 GORM 的管理员仓储实现。
package mysql

import (
	"time"

	"github.com/yym108/gobao-admin/internal/domain"
)

// AdminModel 是 GORM 模型，对应数据库 admins 表。
// 该表只承载后台管理员账号，不与普通用户表混用。
type AdminModel struct {
	ID           int64     `gorm:"primaryKey;autoIncrement"`      // 主键，自增
	Email        string    `gorm:"uniqueIndex;size:255;not null"` // 管理员邮箱，唯一索引
	PasswordHash string    `gorm:"size:255;not null"`             // bcrypt 哈希后的密码
	Nickname     string    `gorm:"size:100;not null;default:''"`  // 管理员昵称
	AvatarURL    string    `gorm:"size:500;not null;default:''"`  // 管理员头像地址
	IsSuperAdmin bool      `gorm:"not null;default:false"`        // 是否为超级管理员
	CreatedAt    time.Time // 创建时间
	UpdatedAt    time.Time // 更新时间
}

// TableName 指定管理员模型使用的表名。
func (AdminModel) TableName() string { return "admins" }

// toDomain 将 GORM 模型转换为领域模型。
func toDomain(m *AdminModel) *domain.Admin {
	return &domain.Admin{
		ID:           m.ID,
		Email:        m.Email,
		PasswordHash: m.PasswordHash,
		Nickname:     m.Nickname,
		AvatarURL:    m.AvatarURL,
		IsSuperAdmin: m.IsSuperAdmin,
		CreatedAt:    m.CreatedAt,
		UpdatedAt:    m.UpdatedAt,
	}
}

// toModel 将领域模型转换为 GORM 模型。
func toModel(admin *domain.Admin) *AdminModel {
	return &AdminModel{
		ID:           admin.ID,
		Email:        admin.Email,
		PasswordHash: admin.PasswordHash,
		Nickname:     admin.Nickname,
		AvatarURL:    admin.AvatarURL,
		IsSuperAdmin: admin.IsSuperAdmin,
		CreatedAt:    admin.CreatedAt,
		UpdatedAt:    admin.UpdatedAt,
	}
}
