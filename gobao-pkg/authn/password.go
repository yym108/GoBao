package authn

import "golang.org/x/crypto/bcrypt"

// HashPassword 对明文密码进行 bcrypt 哈希。
// 每次调用即使传入相同密码，也会生成不同的哈希值（bcrypt 内含随机盐）。
//   - plain: 用户输入的明文密码
//
// 返回值:
//   - string: bcrypt 哈希字符串（包含算法标识、cost、盐和哈��值）
//   - error:  哈希失败时返回错误
func HashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost) // DefaultCost = 10
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ComparePassword 比对明文密码与 bcrypt 哈希是否匹配。
//   - hashed: 数据库中存储的 bcrypt 哈希字符串
//   - plain:  用户输入的明文密码
//
// 返回值:
//   - nil:   密码匹配
//   - error: 密码不匹配时返回 bcrypt.ErrMismatchedHashAndPassword
func ComparePassword(hashed, plain string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(plain))
}
