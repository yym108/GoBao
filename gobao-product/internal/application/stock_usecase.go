package application

import (
	"context"
	"errors"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/domain"
)

// StockUseCase 库存扣减/回补编排。
// DeductStock/RestoreStock 仅由 Order 服务通过内部 gRPC 调用,不暴露 HTTP。
type StockUseCase struct {
	prodRepo  domain.ProductRepository // 商品仓储，保留给后台商品级库存设置校验使用
	stockRepo domain.StockRepository   // 独立商品库存仓储，同时承接后台设置与交易库存读写
}

// NewStockUseCase 构造函数。
//   - prodRepo: 商品仓储实现，供后台商品级库存设置校验商品存在
//   - stockRepo: 独立商品库存仓储，供后台设置与交易库存读写
func NewStockUseCase(prodRepo domain.ProductRepository, stockRepo domain.StockRepository) *StockUseCase {
	return &StockUseCase{
		prodRepo:  prodRepo,
		stockRepo: stockRepo,
	}
}

// DeductStock 原子扣减独立商品库存。
// 业务规则:
//  1. quantity > 0;
//  2. 商品必须存在(软删除视为不存在);
//  3. CAS 冲突(版本不匹配或库存不足)映射为 CodeAborted,调用方可重试。
//
// 参数:
//   - ctx: 上下文
//   - productID: 商品 ID
//   - quantity: 扣减数量,必须 > 0
//
// 返回:
//   - int32: 扣减后剩余库存
//   - error: 错误信息
func (uc *StockUseCase) DeductStock(ctx context.Context, productID int64, quantity int32) (int32, error) {
	if quantity <= 0 {
		return 0, pkgerrors.New(pkgerrors.CodeInvalidArg, "quantity 必须大于 0")
	}
	if productID <= 0 {
		return 0, pkgerrors.New(pkgerrors.CodeInvalidArg, "product_id 必须大于 0")
	}
	remaining, err := uc.stockRepo.Deduct(ctx, productID, quantity)
	if err != nil {
		if errors.Is(err, domain.ErrStockCASConflict) {
			return 0, pkgerrors.New(pkgerrors.CodeAborted, "库存并发冲突,请重试")
		}
		return 0, err
	}
	return remaining, nil
}

// UpdateStock 直接设置库存数量(商家后台一键修改上架数量)。
// 业务规则:
//  1. quantity >= 0;
//  2. 商品必须存在;
//  3. CAS 冲突映射为 CodeAborted。
//
// 参数:
//   - ctx: 上下文
//   - productID: 商品 ID
//   - quantity: 目标库存数量,必须 >= 0
//   - expectedVersion: 商家读取库存时看到的版本号
func (uc *StockUseCase) UpdateStock(ctx context.Context, productID int64, quantity int32, expectedVersion int32) error {
	if quantity < 0 {
		return pkgerrors.New(pkgerrors.CodeInvalidArg, "quantity 不能为负数")
	}
	p, err := uc.prodRepo.FindByID(ctx, productID)
	if err != nil {
		return err
	}
	if p == nil {
		return pkgerrors.New(pkgerrors.CodeNotFound, "商品不存在")
	}
	if err := uc.stockRepo.SetQuantity(ctx, productID, quantity, expectedVersion); err != nil {
		if errors.Is(err, domain.ErrStockCASConflict) {
			return pkgerrors.New(pkgerrors.CodeAborted, "库存并发冲突,请重试")
		}
		return err
	}
	return nil
}

// RestoreStock 原子回补独立商品库存(用于订单取消/退款场景)。
// 业务规则与 DeductStock 一致,CAS 冲突同样映射为 CodeAborted。
//
// 参数:
//   - ctx: 上下文
//   - productID: 商品 ID
//   - quantity: 回补数量,必须 > 0
//
// 返回:
//   - int32: 回补后剩余库存
//   - error: 错误信息
func (uc *StockUseCase) RestoreStock(ctx context.Context, productID int64, quantity int32) (int32, error) {
	if quantity <= 0 {
		return 0, pkgerrors.New(pkgerrors.CodeInvalidArg, "quantity 必须大于 0")
	}
	if productID <= 0 {
		return 0, pkgerrors.New(pkgerrors.CodeInvalidArg, "product_id 必须大于 0")
	}
	remaining, err := uc.stockRepo.Restore(ctx, productID, quantity)
	if err != nil {
		if errors.Is(err, domain.ErrStockCASConflict) {
			return 0, pkgerrors.New(pkgerrors.CodeAborted, "库存并发冲突,请重试")
		}
		return 0, err
	}
	return remaining, nil
}
