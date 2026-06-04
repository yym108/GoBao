CREATE TABLE IF NOT EXISTS admins (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(100) NOT NULL DEFAULT '',
  avatar_url VARCHAR(500) NOT NULL DEFAULT '',
  is_super_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO admins (email, password_hash, nickname, avatar_url, is_super_admin)
SELECT
  'admin@admin',
  '$2y$10$gCxJt5dnpJysx1ACcgFjVO8IIPqpIdRWzjU/ULHVVfj8RzFlB8Trq',
  'admin',
  '',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM admins WHERE email = 'admin@admin'
);

UPDATE admins
SET nickname = 'admin'
WHERE email = 'admin@admin';
