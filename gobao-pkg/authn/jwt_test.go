package authn

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSignAndVerify(t *testing.T) {
	mgr := NewJWTManager("test-secret", time.Hour)
	token, expiresAt, err := mgr.Sign(42, "alice@example.com")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
	assert.Greater(t, expiresAt, time.Now().Unix())

	claims, err := mgr.Verify(token)
	require.NoError(t, err)
	assert.Equal(t, int64(42), claims.UserID)
	assert.Equal(t, "alice@example.com", claims.Email)
	assert.Equal(t, "user", claims.Role)
}

func TestSignWithRoleAndVerify(t *testing.T) {
	mgr := NewJWTManager("test-secret", time.Hour)
	token, _, err := mgr.SignWithRole(7, "admin@example.com", "admin")
	require.NoError(t, err)

	claims, err := mgr.Verify(token)
	require.NoError(t, err)
	assert.Equal(t, int64(7), claims.UserID)
	assert.Equal(t, "admin@example.com", claims.Email)
	assert.Equal(t, "admin", claims.Role)
}

func TestExpiredToken(t *testing.T) {
	mgr := NewJWTManager("test-secret", -time.Hour)
	token, _, err := mgr.Sign(1, "bob@example.com")
	require.NoError(t, err)

	_, err = mgr.Verify(token)
	assert.Error(t, err)
}

func TestInvalidSecret(t *testing.T) {
	mgr1 := NewJWTManager("secret-1", time.Hour)
	token, _, err := mgr1.Sign(1, "test@example.com")
	require.NoError(t, err)

	mgr2 := NewJWTManager("secret-2", time.Hour)
	_, err = mgr2.Verify(token)
	assert.Error(t, err)
}

func TestMalformedToken(t *testing.T) {
	mgr := NewJWTManager("test-secret", time.Hour)
	_, err := mgr.Verify("not-a-jwt-token")
	assert.Error(t, err)
}
