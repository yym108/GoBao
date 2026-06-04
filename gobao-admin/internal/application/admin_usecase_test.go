package application

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/yym108/gobao-admin/internal/domain"
	"github.com/yym108/gobao-pkg/authn"
)

type stubAdminRepo struct {
	byID    map[int64]*domain.Admin
	byEmail map[string]*domain.Admin
}

func (r *stubAdminRepo) Create(context.Context, *domain.Admin) error { return nil }
func (r *stubAdminRepo) ExistsByEmail(context.Context, string) (bool, error) {
	return false, nil
}
func (r *stubAdminRepo) FindByID(_ context.Context, id int64) (*domain.Admin, error) {
	return r.byID[id], nil
}
func (r *stubAdminRepo) FindByEmail(_ context.Context, email string) (*domain.Admin, error) {
	return r.byEmail[email], nil
}
func (r *stubAdminRepo) List(context.Context) ([]*domain.Admin, error) {
	items := make([]*domain.Admin, 0, len(r.byID))
	for _, item := range r.byID {
		items = append(items, item)
	}
	return items, nil
}
func (r *stubAdminRepo) UpdatePasswordHash(_ context.Context, adminID int64, passwordHash string) error {
	if item, ok := r.byID[adminID]; ok {
		item.PasswordHash = passwordHash
	}
	for _, item := range r.byEmail {
		if item.ID == adminID {
			item.PasswordHash = passwordHash
		}
	}
	return nil
}

func TestAdminUseCase_Login(t *testing.T) {
	hash, err := authn.HashPassword("admin123456")
	require.NoError(t, err)

	repo := &stubAdminRepo{
		byID: map[int64]*domain.Admin{
			1: {ID: 1, Email: "admin@test.com", PasswordHash: hash, Nickname: "Admin", IsSuperAdmin: true},
		},
		byEmail: map[string]*domain.Admin{
			"admin@test.com": {ID: 1, Email: "admin@test.com", PasswordHash: hash, Nickname: "Admin", IsSuperAdmin: true},
		},
	}
	uc := NewAdminUseCase(repo, authn.NewJWTManager("test-secret", time.Hour))

	token, expiresAt, adminID, err := uc.Login(context.Background(), "admin@test.com", "admin123456")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
	assert.Greater(t, expiresAt, time.Now().Unix())
	assert.Equal(t, int64(1), adminID)

	claims, err := authn.NewJWTManager("test-secret", time.Hour).Verify(token)
	require.NoError(t, err)
	assert.Equal(t, "admin", claims.Role)
}

func TestAdminUseCase_ChangePassword(t *testing.T) {
	hash, err := authn.HashPassword("12345")
	require.NoError(t, err)

	repo := &stubAdminRepo{
		byID: map[int64]*domain.Admin{
			1: {ID: 1, Email: "admin@admin", PasswordHash: hash, Nickname: "Super", IsSuperAdmin: true},
		},
		byEmail: map[string]*domain.Admin{
			"admin@admin": {ID: 1, Email: "admin@admin", PasswordHash: hash, Nickname: "Super", IsSuperAdmin: true},
		},
	}
	uc := NewAdminUseCase(repo, authn.NewJWTManager("test-secret", time.Hour))

	err = uc.ChangePassword(context.Background(), 1, "12345", "54321")
	require.NoError(t, err)
	err = authn.ComparePassword(repo.byID[1].PasswordHash, "54321")
	require.NoError(t, err)
}

func TestAdminUseCase_CreateAdmin_SuperAdminOnly(t *testing.T) {
	hash, err := authn.HashPassword("12345")
	require.NoError(t, err)
	repo := &stubAdminRepo{
		byID: map[int64]*domain.Admin{
			1: {ID: 1, Email: "admin@admin", PasswordHash: hash, Nickname: "Super", IsSuperAdmin: true},
		},
		byEmail: map[string]*domain.Admin{
			"admin@admin": {ID: 1, Email: "admin@admin", PasswordHash: hash, Nickname: "Super", IsSuperAdmin: true},
		},
	}
	uc := NewAdminUseCase(repo, authn.NewJWTManager("test-secret", time.Hour))

	admin, err := uc.CreateAdmin(context.Background(), 1, &domain.Admin{
		Email:    "ops@admin",
		Nickname: "运营",
	}, "88888")
	require.NoError(t, err)
	assert.Equal(t, "ops@admin", admin.Email)
}
