package mysql

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/yym108/gobao-admin/internal/domain"
)

func setupTestRepo(t *testing.T) *AdminRepo {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&AdminModel{}))
	return NewAdminRepo(db)
}

func TestAdminRepo_CreateAndFind(t *testing.T) {
	repo := setupTestRepo(t)
	admin := &domain.Admin{
		Email:        "admin@test.com",
		PasswordHash: "hash",
		Nickname:     "Admin",
		IsSuperAdmin: true,
	}

	err := repo.Create(context.Background(), admin)
	require.NoError(t, err)
	assert.Positive(t, admin.ID)

	got, err := repo.FindByEmail(context.Background(), "admin@test.com")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, admin.ID, got.ID)
	assert.Equal(t, "Admin", got.Nickname)
	assert.True(t, got.IsSuperAdmin)
}
