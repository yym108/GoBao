package mysql

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"github.com/yym108/gobao-product/internal/domain"
)

// MediaRepo 提供媒体资源的 GORM 仓储实现。
type MediaRepo struct {
	db *gorm.DB // GORM 数据库连接
}

// NewMediaRepo 构造媒体仓储。
func NewMediaRepo(db *gorm.DB) *MediaRepo {
	return &MediaRepo{db: db}
}

// Create 创建媒体资源并回填主键与时间字段。
func (r *MediaRepo) Create(ctx context.Context, asset *domain.MediaAsset) error {
	model := mediaAssetToModel(asset)
	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return err
	}
	asset.ID = model.ID
	asset.CreatedAt = model.CreatedAt
	asset.UpdatedAt = model.UpdatedAt
	return nil
}

// FindByID 按主键查询媒体资源。
func (r *MediaRepo) FindByID(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	var model MediaAssetModel
	if err := r.db.WithContext(ctx).First(&model, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return mediaAssetToDomain(&model), nil
}
