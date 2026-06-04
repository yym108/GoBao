CREATE TABLE IF NOT EXISTS payments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  payment_no VARCHAR(64) NOT NULL UNIQUE,
  order_id BIGINT NOT NULL UNIQUE,
  order_no VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  amount BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'MOCK',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  paid_at DATETIME(3) NULL,
  KEY idx_payments_user_id (user_id),
  KEY idx_payments_status (status),
  KEY idx_payments_order_no (order_no)
);
