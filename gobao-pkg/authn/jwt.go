// Package authn 提供认证相关的公共能力，包括 JWT 签发/校验和密码哈希。
package authn

import (
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims 是 JWT 校验成功后返回给调用方的业务数据。
// 只包含业务需要的字段，不暴露 JWT 库的内部类型。
type Claims struct {
	UserID int64  // 用户 ID
	Email  string // 用户邮箱
	Role   string // 账号角色，区分普通用户与管理员
}

// jwtClaims 是 JWT 内部使用的声明结构，嵌入标准声明（过期时间、签发时间等）。
// 不导出——调用方只看到 Claims。
type jwtClaims struct {
	Email                string `json:"email"` // 自定义字段：用户邮箱，序列化到 JWT Payload
	Role                 string `json:"role"`  // 自定义字段：账号角色，供 Gateway 路由鉴权分流
	jwt.RegisteredClaims        // 嵌入标准声明：Subject(userID)、ExpiresAt、IssuedAt
}

// JWTManager 封装 JWT 的签发与校验逻辑，持有签名密钥和有效期配置。
// 并发安全——构造后字段不可变，多 goroutine 可同时调用 Sign/Verify。
type JWTManager struct {
	secret []byte        // HMAC-SHA256 签名密钥（[]byte 避免每次转换）
	expiry time.Duration // token 有效时长，如 24h
}

// NewJWTManager 构造 JWTManager。
//   - secret: HMAC-SHA256 签名密钥字符串
//   - expiry: token 有效时长（如 24*time.Hour）
func NewJWTManager(secret string, expiry time.Duration) *JWTManager {
	return &JWTManager{secret: []byte(secret), expiry: expiry}
}

// Sign 为指定用户签发 JWT。
//   - userID: 用户 ID，存入标准字段 Subject（转为字符串）
//   - email:  用户邮箱，存入自定义字段
//
// 返回值:
//   - token:     签名后的 JWT 字符串（Header.Payload.Signature）
//   - expiresAt: 过期时间的 Unix 秒数
//   - err:       签名失败时返回错误
func (m *JWTManager) Sign(userID int64, email string) (string, int64, error) {
	return m.SignWithRole(userID, email, "user")
}

// SignWithRole 为指定账号签发携带角色信息的 JWT。
// 默认用户侧仍通过 Sign 走 role=user，管理员服务则显式传入 role=admin。
func (m *JWTManager) SignWithRole(userID int64, email, role string) (string, int64, error) {
	now := time.Now()
	exp := now.Add(m.expiry)
	if role == "" {
		role = "user"
	}
	claims := jwtClaims{
		Email: email,
		Role:  role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(userID, 10), // int64 → string，存入标准 sub 字段
			IssuedAt:  jwt.NewNumericDate(now),       // 签发时间
			ExpiresAt: jwt.NewNumericDate(exp),       // 过期时间
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims) // 创建未签名 token，指定 HS256 算��
	signed, err := token.SignedString(m.secret)                // 用 secret 进行 HMAC-SHA256 签名
	if err != nil {
		return "", 0, err
	}
	return signed, exp.Unix(), nil
}

// Verify 校验 JWT 字符串并提取业务数据。
// 验证流程：算法白名单检查 → 签名比对 → 过期时间检查 → 解析 Claims。
//   - tokenStr: 待校验的 JWT 字符串
//
// 返回值:
//   - *Claims: 校验成功返回用户 ID 和邮箱
//   - error:   token 无效、过期、被篡改时返回错误
func (m *JWTManager) Verify(tokenStr string) (*Claims, error) {
	// ParseWithClaims: 解码 → 验签 → 过期检查，一步完成
	// keyFunc 回调: 返回验签密钥（支持多密钥轮转场景，这里只有一个 secret）
	// WithValidMethods: 限制只接受 HS256 算法，防御 "alg:none" 攻击
	token, err := jwt.ParseWithClaims(tokenStr, &jwtClaims{}, func(_ *jwt.Token) (any, error) {
		return m.secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	// 类型断言：确保解析结果是 jwtClaims 类型
	claims, ok := token.Claims.(*jwtClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	// Subject 存的是 userID 的字符串形式，转回 int64
	userID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid subject: %w", err)
	}

	role := claims.Role
	if role == "" {
		role = "user"
	}

	return &Claims{UserID: userID, Email: claims.Email, Role: role}, nil
}
