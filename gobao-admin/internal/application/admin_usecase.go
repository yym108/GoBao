// Package application 编排管理员认证相关业务用例。
package application

import (
	"context"
	"strings"

	"github.com/yym108/gobao-admin/internal/domain"
	"github.com/yym108/gobao-pkg/authn"
	"github.com/yym108/gobao-pkg/errors"
)

// AdminUseCase 负责编排管理员账号查询、登录与 token 签发。
type AdminUseCase struct {
	repo domain.AdminRepository // 管理员仓储接口
	jwt  *authn.JWTManager      // JWT 管理器，签发 role=admin 的 token
}

// NewAdminUseCase 构造管理员用例编排器。
func NewAdminUseCase(repo domain.AdminRepository, jwt *authn.JWTManager) *AdminUseCase {
	return &AdminUseCase{repo: repo, jwt: jwt}
}

// Login 校验管理员邮箱密码并签发管理员 token。
func (uc *AdminUseCase) Login(ctx context.Context, email, password string) (string, int64, int64, error) {
	admin, err := uc.repo.FindByEmail(ctx, email)
	if err != nil {
		return "", 0, 0, errors.Wrap(errors.CodeInternal, "find admin", err)
	}
	if admin == nil {
		return "", 0, 0, errors.New(errors.CodeUnauth, "invalid credentials")
	}
	if err := authn.ComparePassword(admin.PasswordHash, password); err != nil {
		return "", 0, 0, errors.New(errors.CodeUnauth, "invalid credentials")
	}

	token, expiresAt, err := uc.jwt.SignWithRole(admin.ID, admin.Email, "admin")
	if err != nil {
		return "", 0, 0, errors.Wrap(errors.CodeInternal, "sign admin token", err)
	}
	return token, expiresAt, admin.ID, nil
}

// GetAdmin 按 ID 获取管理员资料。
func (uc *AdminUseCase) GetAdmin(ctx context.Context, adminID int64) (*domain.Admin, error) {
	admin, err := uc.repo.FindByID(ctx, adminID)
	if err != nil {
		return nil, errors.Wrap(errors.CodeInternal, "find admin", err)
	}
	if admin == nil {
		return nil, errors.New(errors.CodeNotFound, "admin not found")
	}
	return admin, nil
}

// ChangePassword 允许后台账号使用旧密码校验后自行修改密码。
func (uc *AdminUseCase) ChangePassword(ctx context.Context, adminID int64, currentPassword, newPassword string) error {
	admin, err := uc.GetAdmin(ctx, adminID)
	if err != nil {
		return err
	}
	if err := authn.ComparePassword(admin.PasswordHash, currentPassword); err != nil {
		return errors.New(errors.CodeUnauth, "invalid current password")
	}
	if len(newPassword) < 5 {
		return errors.New(errors.CodeInvalidArg, "password must be at least 5 characters")
	}
	if err := authn.ComparePassword(admin.PasswordHash, newPassword); err == nil {
		return errors.New(errors.CodeInvalidArg, "new password must be different from current password")
	}
	hash, err := authn.HashPassword(newPassword)
	if err != nil {
		return errors.Wrap(errors.CodeInternal, "hash password", err)
	}
	if err := uc.repo.UpdatePasswordHash(ctx, adminID, hash); err != nil {
		return errors.Wrap(errors.CodeInternal, "update admin password", err)
	}
	return nil
}

// ListAdmins 仅允许超级管理员查询全部后台账号。
func (uc *AdminUseCase) ListAdmins(ctx context.Context, requesterAdminID int64) ([]*domain.Admin, error) {
	requester, err := uc.GetAdmin(ctx, requesterAdminID)
	if err != nil {
		return nil, err
	}
	if !requester.IsSuperAdmin {
		return nil, errors.New(errors.CodeForbidden, "super admin required")
	}
	items, err := uc.repo.List(ctx)
	if err != nil {
		return nil, errors.Wrap(errors.CodeInternal, "list admins", err)
	}
	return items, nil
}

// CreateAdmin 仅允许超级管理员创建后台账号。
func (uc *AdminUseCase) CreateAdmin(ctx context.Context, requesterAdminID int64, admin *domain.Admin, password string) (*domain.Admin, error) {
	requester, err := uc.GetAdmin(ctx, requesterAdminID)
	if err != nil {
		return nil, err
	}
	if !requester.IsSuperAdmin {
		return nil, errors.New(errors.CodeForbidden, "super admin required")
	}

	admin.Email = strings.TrimSpace(admin.Email)
	admin.Nickname = strings.TrimSpace(admin.Nickname)
	admin.AvatarURL = strings.TrimSpace(admin.AvatarURL)
	if admin.Email == "" {
		return nil, errors.New(errors.CodeInvalidArg, "email is required")
	}
	if len(password) < 5 {
		return nil, errors.New(errors.CodeInvalidArg, "password must be at least 5 characters")
	}
	if admin.Nickname == "" {
		admin.Nickname = "后台账号"
	}

	exists, err := uc.repo.ExistsByEmail(ctx, admin.Email)
	if err != nil {
		return nil, errors.Wrap(errors.CodeInternal, "check admin email", err)
	}
	if exists {
		return nil, errors.New(errors.CodeConflict, "email already registered")
	}

	hash, err := authn.HashPassword(password)
	if err != nil {
		return nil, errors.Wrap(errors.CodeInternal, "hash password", err)
	}
	admin.PasswordHash = hash
	if err := uc.repo.Create(ctx, admin); err != nil {
		return nil, errors.Wrap(errors.CodeInternal, "create admin", err)
	}
	return admin, nil
}

// UpdateAdminPassword 允许超级管理员重置任意后台账号密码。
func (uc *AdminUseCase) UpdateAdminPassword(ctx context.Context, requesterAdminID, targetAdminID int64, newPassword string) error {
	requester, err := uc.GetAdmin(ctx, requesterAdminID)
	if err != nil {
		return err
	}
	if !requester.IsSuperAdmin {
		return errors.New(errors.CodeForbidden, "super admin required")
	}
	target, err := uc.GetAdmin(ctx, targetAdminID)
	if err != nil {
		return err
	}
	if len(newPassword) < 5 {
		return errors.New(errors.CodeInvalidArg, "password must be at least 5 characters")
	}
	if err := authn.ComparePassword(target.PasswordHash, newPassword); err == nil {
		return errors.New(errors.CodeInvalidArg, "new password must be different from current password")
	}
	hash, err := authn.HashPassword(newPassword)
	if err != nil {
		return errors.Wrap(errors.CodeInternal, "hash password", err)
	}
	if err := uc.repo.UpdatePasswordHash(ctx, targetAdminID, hash); err != nil {
		return errors.Wrap(errors.CodeInternal, "update target admin password", err)
	}
	return nil
}
