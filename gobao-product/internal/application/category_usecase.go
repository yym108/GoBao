// Package application 编排领域对象与仓储,把业务规则转换成仓储调用。
// 此层不依赖任何 RPC/HTTP 框架,错误统一通过 pkgerrors.New(Code, msg) 表达。
package application

import (
	"context"
	"strings"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/domain"
)

// CategoryUseCase 类目相关业务编排。
type CategoryUseCase struct {
	repo      domain.CategoryRepository     // 类目仓储,由构造函数注入
	groupRepo domain.ProductGroupRepository // 商品组仓储,删除类目时用于清空关联商品组类目
}

// NewCategoryUseCase 构造函数,依赖通过参数注入便于测试替换。
//   - repo: 类目仓储实现
//   - groupRepo: 商品组仓储实现
func NewCategoryUseCase(repo domain.CategoryRepository, groupRepo domain.ProductGroupRepository) *CategoryUseCase {
	return &CategoryUseCase{repo: repo, groupRepo: groupRepo}
}

// Create 创建类目。
// 业务规则:
//  1. name 去除首尾空白后不可为空(防止纯空格名称);
//  2. 名称必须全局唯一,重复返回 CodeConflict;
//  3. sortOrder 允许任意 int32(包含 0/负数),由前端约定排序逻辑。
//
// 参数:
//   - ctx: 上下文
//   - name: 类目名称
//   - sortOrder: 排序权重
func (uc *CategoryUseCase) Create(ctx context.Context, name string, sortOrder int32) (*domain.Category, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "name 不能为空")
	}
	exists, err := uc.repo.ExistsByName(ctx, name, 0)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, pkgerrors.New(pkgerrors.CodeConflict, "类目名称已存在")
	}
	c := &domain.Category{Name: name, SortOrder: sortOrder}
	if err := uc.repo.Create(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

// Get 按 ID 查询单个类目,未找到返回 CodeNotFound。
//   - ctx: 上下文
//   - id: 类目主键
func (uc *CategoryUseCase) Get(ctx context.Context, id int64) (*domain.Category, error) {
	c, err := uc.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "类目不存在")
	}
	return c, nil
}

// List 全量查询类目列表,顺序由仓储层保证(sort_order asc, id asc)。
//   - ctx: 上下文
func (uc *CategoryUseCase) List(ctx context.Context) ([]*domain.Category, error) {
	return uc.repo.List(ctx)
}

// Update 更新类目。
// 业务规则:
//  1. 类目必须存在;
//  2. name 去空白后不为空;
//  3. 改名时必须唯一(排除自身 ID)。
//
// 参数:
//   - ctx: 上下文
//   - id: 类目主键
//   - name: 新名称
//   - sortOrder: 新排序权重
func (uc *CategoryUseCase) Update(ctx context.Context, id int64, name string, sortOrder int32) (*domain.Category, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "name 不能为空")
	}
	c, err := uc.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "类目不存在")
	}
	exists, err := uc.repo.ExistsByName(ctx, name, id)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, pkgerrors.New(pkgerrors.CodeConflict, "类目名称已存在")
	}
	c.Name = name
	c.SortOrder = sortOrder
	if err := uc.repo.Update(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

// Delete 删除类目。
// 业务规则:
//  1. 类目必须存在；
//  2. 删除前先把挂在该类目下的商品组统一置为暂无类目；
//  3. 类目商品本身保留原 category_id，不在这里联动改写。
//     - ctx: 上下文
//     - id: 类目主键
func (uc *CategoryUseCase) Delete(ctx context.Context, id int64) error {
	c, err := uc.repo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if c == nil {
		return pkgerrors.New(pkgerrors.CodeNotFound, "类目不存在")
	}
	if uc.groupRepo != nil {
		if err := uc.groupRepo.ClearCategoryByCategoryID(ctx, id); err != nil {
			return err
		}
	}
	return uc.repo.Delete(ctx, id)
}
