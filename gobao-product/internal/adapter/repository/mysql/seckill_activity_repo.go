package mysql

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"github.com/yym108/gobao-product/internal/domain"
)

// SeckillActivityRepo 秒杀活动仓储 GORM 实现。
// 该仓储负责秒杀活动主数据的创建、查询和更新。
type SeckillActivityRepo struct {
	db *gorm.DB // GORM 数据库连接
}

// NewSeckillActivityRepo 构造秒杀活动仓储。
//   - db: 应用级 GORM 数据库连接
func NewSeckillActivityRepo(db *gorm.DB) *SeckillActivityRepo {
	return &SeckillActivityRepo{db: db}
}

// Create 创建秒杀活动记录，成功后回填主键和时间字段。
//   - ctx: 上下文
//   - activity: 秒杀活动领域对象
func (r *SeckillActivityRepo) Create(ctx context.Context, activity *domain.SeckillActivity) error {
	model := seckillActivityToModel(activity)
	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return err
	}
	activity.ID = model.ID
	activity.CreatedAt = model.CreatedAt
	activity.UpdatedAt = model.UpdatedAt
	return nil
}

// FindByID 按主键查询秒杀活动，未找到返回 (nil, nil)。
//   - ctx: 上下文
//   - id: 秒杀活动主键
func (r *SeckillActivityRepo) FindByID(ctx context.Context, id int64) (*domain.SeckillActivity, error) {
	var model SeckillActivityModel
	if err := r.db.WithContext(ctx).First(&model, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return seckillActivityToDomain(&model), nil
}

// Update 全量更新秒杀活动的可变字段。
//   - ctx: 上下文
//   - activity: 包含最新字段的秒杀活动领域对象
func (r *SeckillActivityRepo) Update(ctx context.Context, activity *domain.SeckillActivity) error {
	return r.db.WithContext(ctx).Model(&SeckillActivityModel{ID: activity.ID}).Updates(map[string]any{
		"product_id":    activity.ProductID,
		"title":         activity.Title,
		"seckill_price": activity.SeckillPrice,
		"seckill_stock": activity.SeckillStock,
		"status":        activity.Status,
		"start_at":      activity.StartAt,
		"end_at":        activity.EndAt,
		"updated_at":    activity.UpdatedAt,
	}).Error
}
