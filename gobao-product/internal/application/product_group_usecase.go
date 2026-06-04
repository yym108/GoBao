// Package application 编排商品组相关业务规则。
// 商品组负责前台页面聚合与展示元信息维护，不承担交易与库存真值。
package application

import (
	"context"
	"strings"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/domain"
)

// ProductGroupUseCase 编排商品组后台维护能力。
// 当前后台通过它维护系列页标题、封面、Hero 图、排序和所属类目。
type ProductGroupUseCase struct {
	repo    domain.ProductGroupRepository // 商品组仓储
	catRepo domain.CategoryRepository     // 类目仓储，用于校验所属类目存在
}

// NewProductGroupUseCase 构造商品组用例。
//   - repo: 商品组仓储实现
//   - catRepo: 类目仓储实现
func NewProductGroupUseCase(repo domain.ProductGroupRepository, catRepo domain.CategoryRepository) *ProductGroupUseCase {
	return &ProductGroupUseCase{repo: repo, catRepo: catRepo}
}

// Create 创建商品组。
// 业务规则：
//  1. name、slug 去空白后均不能为空；
//  2. slug 必须唯一；
//  3. category_id 允许为空；传 0 表示当前商品组暂未归类；
//  4. status 为空时默认启用。
func (uc *ProductGroupUseCase) Create(ctx context.Context, group *domain.ProductGroup) (*domain.ProductGroup, error) {
	group.Name = strings.TrimSpace(group.Name)
	group.Slug = strings.TrimSpace(group.Slug)
	group.HeroTitle = strings.TrimSpace(group.HeroTitle)
	group.HeroSubtitle = strings.TrimSpace(group.HeroSubtitle)
	group.HeroImageURL = strings.TrimSpace(group.HeroImageURL)
	group.CoverImageURL = strings.TrimSpace(group.CoverImageURL)

	if group.Name == "" {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "name 不能为空")
	}
	if group.Slug == "" {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "slug 不能为空")
	}
	if err := uc.ensureCategoryExists(ctx, group.CategoryID); err != nil {
		return nil, err
	}
	exists, err := uc.repo.ExistsBySlug(ctx, group.Slug, 0)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, pkgerrors.New(pkgerrors.CodeConflict, "商品组 slug 已存在")
	}
	if group.Status == 0 {
		group.Status = 1
	}
	if err := uc.repo.Create(ctx, group); err != nil {
		return nil, err
	}
	return group, nil
}

// List 分页查询商品组。
// page/pageSize 的保护逻辑与商品列表保持一致，避免后台分页参数越界。
func (uc *ProductGroupUseCase) List(ctx context.Context, categoryID int64, page, pageSize int) ([]domain.ProductGroup, int64, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return uc.repo.List(ctx, categoryID, page, pageSize)
}

// Update 更新商品组。
// 业务规则：
//  1. 商品组必须存在；
//  2. name、slug 去空白后不能为空；
//  3. slug 更新后仍需保持唯一；
//  4. category_id 允许改为 0，表示当前商品组暂未归类。
func (uc *ProductGroupUseCase) Update(ctx context.Context, id int64, update *domain.ProductGroup) (*domain.ProductGroup, error) {
	update.Name = strings.TrimSpace(update.Name)
	update.Slug = strings.TrimSpace(update.Slug)
	update.HeroTitle = strings.TrimSpace(update.HeroTitle)
	update.HeroSubtitle = strings.TrimSpace(update.HeroSubtitle)
	update.HeroImageURL = strings.TrimSpace(update.HeroImageURL)
	update.CoverImageURL = strings.TrimSpace(update.CoverImageURL)

	if update.Name == "" {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "name 不能为空")
	}
	if update.Slug == "" {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "slug 不能为空")
	}

	group, err := uc.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if group == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品组不存在")
	}

	if err := uc.ensureCategoryExists(ctx, update.CategoryID); err != nil {
		return nil, err
	}
	exists, err := uc.repo.ExistsBySlug(ctx, update.Slug, id)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, pkgerrors.New(pkgerrors.CodeConflict, "商品组 slug 已存在")
	}

	group.Name = update.Name
	group.Slug = update.Slug
	group.HeroTitle = update.HeroTitle
	group.HeroSubtitle = update.HeroSubtitle
	group.HeroImageURL = update.HeroImageURL
	group.CoverImageURL = update.CoverImageURL
	group.CategoryID = update.CategoryID
	group.Status = update.Status
	group.SortOrder = update.SortOrder
	group.SpecKeys = update.SpecKeys

	if err := uc.repo.Update(ctx, group); err != nil {
		return nil, err
	}
	return group, nil
}

// Delete 删除商品组。
// 删除前必须确认其下没有独立商品，避免出现孤儿商品版本。
func (uc *ProductGroupUseCase) Delete(ctx context.Context, id int64) error {
	group, err := uc.repo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if group == nil {
		return pkgerrors.New(pkgerrors.CodeNotFound, "商品组不存在")
	}
	count, err := uc.repo.CountProductsByGroupID(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品组下仍有关联商品,无法删除")
	}
	return uc.repo.Delete(ctx, id)
}

// ensureCategoryExists 统一校验商品组所属类目是否存在。
// category_id=0 视为暂无类目，直接放行。
func (uc *ProductGroupUseCase) ensureCategoryExists(ctx context.Context, categoryID int64) error {
	if categoryID == 0 {
		return nil
	}
	if categoryID < 0 {
		return pkgerrors.New(pkgerrors.CodeInvalidArg, "category_id 无效")
	}
	cat, err := uc.catRepo.FindByID(ctx, categoryID)
	if err != nil {
		return err
	}
	if cat == nil {
		return pkgerrors.New(pkgerrors.CodeFailedPrecondition, "类目不存在")
	}
	return nil
}
