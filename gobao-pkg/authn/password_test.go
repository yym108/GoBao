package authn

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashAndCompare(t *testing.T) {
	hash, err := HashPassword("mypassword")
	require.NoError(t, err)
	assert.NoError(t, ComparePassword(hash, "mypassword"))
}

func TestWrongPassword(t *testing.T) {
	hash, err := HashPassword("correct")
	require.NoError(t, err)
	assert.Error(t, ComparePassword(hash, "wrong"))
}

func TestDifferentHashes(t *testing.T) {
	h1, err := HashPassword("same")
	require.NoError(t, err)
	h2, err := HashPassword("same")
	require.NoError(t, err)
	assert.NotEqual(t, h1, h2)
}
