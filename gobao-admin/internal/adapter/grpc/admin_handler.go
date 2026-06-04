// Package grpc 提供 Admin 服务的 gRPC Handler 实现。
package grpc

import (
	"context"

	"github.com/yym108/gobao-admin/internal/application"
	"github.com/yym108/gobao-admin/internal/domain"
	"github.com/yym108/gobao-pkg/errors"
	adminv1 "github.com/yym108/gobao-proto/gen/go/gobao/admin/v1"
)

// AdminHandler 实现 proto 生成的 AdminServiceServer 接口。
type AdminHandler struct {
	adminv1.UnimplementedAdminServiceServer
	uc *application.AdminUseCase // 管理员业务用例
}

// NewAdminHandler 构造 Admin gRPC Handler。
func NewAdminHandler(uc *application.AdminUseCase) *AdminHandler {
	return &AdminHandler{uc: uc}
}

// Login 处理管理员登录 RPC。
func (h *AdminHandler) Login(ctx context.Context, req *adminv1.LoginRequest) (*adminv1.LoginResponse, error) {
	if req.GetEmail() == "" {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "email is required")).Err()
	}
	if req.GetPassword() == "" {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "password is required")).Err()
	}

	token, expiresAt, adminID, err := h.uc.Login(ctx, req.GetEmail(), req.GetPassword())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &adminv1.LoginResponse{
		AccessToken: token,
		ExpiresAt:   expiresAt,
		AdminId:     adminID,
	}, nil
}

// GetAdmin 返回管理员基础资料。
func (h *AdminHandler) GetAdmin(ctx context.Context, req *adminv1.GetAdminRequest) (*adminv1.GetAdminResponse, error) {
	if req.GetAdminId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "admin_id must be positive")).Err()
	}

	admin, err := h.uc.GetAdmin(ctx, req.GetAdminId())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &adminv1.GetAdminResponse{
		AdminId:      admin.ID,
		Email:        admin.Email,
		Nickname:     admin.Nickname,
		AvatarUrl:    admin.AvatarURL,
		IsSuperAdmin: admin.IsSuperAdmin,
	}, nil
}

// ChangePassword 处理管理员自改密码 RPC。
func (h *AdminHandler) ChangePassword(ctx context.Context, req *adminv1.ChangePasswordRequest) (*adminv1.ChangePasswordResponse, error) {
	if req.GetAdminId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "admin_id must be positive")).Err()
	}
	if req.GetCurrentPassword() == "" || req.GetNewPassword() == "" {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "current_password and new_password are required")).Err()
	}
	if err := h.uc.ChangePassword(ctx, req.GetAdminId(), req.GetCurrentPassword(), req.GetNewPassword()); err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &adminv1.ChangePasswordResponse{Message: "password changed"}, nil
}

// ListAdmins 处理后台账号列表 RPC，仅超管可用。
func (h *AdminHandler) ListAdmins(ctx context.Context, req *adminv1.ListAdminsRequest) (*adminv1.ListAdminsResponse, error) {
	if req.GetRequesterAdminId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "requester_admin_id must be positive")).Err()
	}
	items, err := h.uc.ListAdmins(ctx, req.GetRequesterAdminId())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	resp := &adminv1.ListAdminsResponse{Items: make([]*adminv1.AdminSummary, 0, len(items))}
	for _, item := range items {
		resp.Items = append(resp.Items, &adminv1.AdminSummary{
			AdminId:      item.ID,
			Email:        item.Email,
			Nickname:     item.Nickname,
			AvatarUrl:    item.AvatarURL,
			IsSuperAdmin: item.IsSuperAdmin,
		})
	}
	return resp, nil
}

// CreateAdmin 处理创建后台账号 RPC，仅超管可用。
func (h *AdminHandler) CreateAdmin(ctx context.Context, req *adminv1.CreateAdminRequest) (*adminv1.CreateAdminResponse, error) {
	if req.GetRequesterAdminId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "requester_admin_id must be positive")).Err()
	}
	admin, err := h.uc.CreateAdmin(ctx, req.GetRequesterAdminId(), &domain.Admin{
		Email:        req.GetEmail(),
		Nickname:     req.GetNickname(),
		AvatarURL:    req.GetAvatarUrl(),
		IsSuperAdmin: req.GetIsSuperAdmin(),
	}, req.GetPassword())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &adminv1.CreateAdminResponse{
		Admin: &adminv1.AdminSummary{
			AdminId:      admin.ID,
			Email:        admin.Email,
			Nickname:     admin.Nickname,
			AvatarUrl:    admin.AvatarURL,
			IsSuperAdmin: admin.IsSuperAdmin,
		},
	}, nil
}

// UpdateAdminPassword 处理超管重置后台账号密码 RPC。
func (h *AdminHandler) UpdateAdminPassword(ctx context.Context, req *adminv1.UpdateAdminPasswordRequest) (*adminv1.UpdateAdminPasswordResponse, error) {
	if req.GetRequesterAdminId() <= 0 || req.GetTargetAdminId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "requester_admin_id and target_admin_id must be positive")).Err()
	}
	if req.GetNewPassword() == "" {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "new_password is required")).Err()
	}
	if err := h.uc.UpdateAdminPassword(ctx, req.GetRequesterAdminId(), req.GetTargetAdminId(), req.GetNewPassword()); err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &adminv1.UpdateAdminPasswordResponse{Message: "password updated"}, nil
}
