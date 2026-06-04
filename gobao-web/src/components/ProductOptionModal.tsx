import { useEffect, useMemo, useState } from 'react';
import { formatPrice } from '../lib/format';
import { isProductOnSale, isProductPurchasable, resolveProductAvailabilityMessage } from '../lib/productAvailability.ts';
import { buildVariantSpecGroups, findBestMatchingVariant } from '../lib/productVariants.ts';
import { ProductOptionSelector } from './ProductOptionSelector';
import type { ProductDetailResponse, ProductVariant } from '../lib/types.ts';

interface ProductOptionModalProps {
  detail: ProductDetailResponse | null;
  open: boolean;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (variant: ProductVariant) => Promise<void> | void;
}

/**
 * 统一承接商品版本选配弹窗，列表页通过它在同组独立商品之间切换后进入加购流程。
 */
export function ProductOptionModal({
  detail,
  open,
  submitting = false,
  onCancel,
  onConfirm,
}: ProductOptionModalProps) {
  const [selectedVariantId, setSelectedVariantId] = useState(detail?.default_product_id ?? 0);

  useEffect(() => {
    if (!open || !detail) {
      return;
    }
    setSelectedVariantId(detail.default_product_id || detail.product.id || detail.variants[0]?.id || 0);
  }, [detail, open]);

  const selectedVariant = useMemo(() => {
    if (!detail) {
      return null;
    }
    return detail.variants.find((variant) => variant.id === selectedVariantId) ?? detail.variants[0] ?? null;
  }, [detail, selectedVariantId]);

  if (!open || !detail) {
    return null;
  }

  const modalDetail = detail;
  const { product, group } = modalDetail;
  const selectedVariantOnSale = isProductOnSale(selectedVariant);
  const selectedVariantPurchasable = isProductPurchasable(selectedVariant);
  const availabilityMessage = resolveProductAvailabilityMessage(selectedVariant);

  function handleSelectOption(specKey: string, specValue: string) {
    if (!selectedVariant) {
      return;
    }
    const nextVariant = findBestMatchingVariant({
      variants: modalDetail.variants,
      selectedVariantId,
      specKey,
      specValue,
    });

    if (nextVariant) {
      setSelectedVariantId(nextVariant.id);
    }
  }

  const optionGroupViews = buildVariantSpecGroups(modalDetail.variants, selectedVariantId, group.spec_keys ?? []);
  const displayImageURL = selectedVariant?.image_url || product.image_url || group.hero_image_url;

  return (
    <div className="product-option-modal" role="dialog" aria-modal="true" aria-labelledby="product-option-modal-title">
      <button className="product-option-modal__backdrop" type="button" aria-label="关闭选配弹窗" onClick={onCancel} />

      <div className="product-option-modal__panel">
        <div className="product-option-modal__header">
          <div>
            <p className="product-option-modal__eyebrow">配置选配</p>
            <h3 id="product-option-modal-title">{group.name || product.name}</h3>
          </div>
          <button className="product-option-modal__close" type="button" aria-label="关闭选配弹窗" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="product-option-modal__body">
          <div
            className={`product-option-modal__image${displayImageURL ? ' product-option-modal__image--photo' : ''}`}
            style={displayImageURL ? { backgroundImage: `url(${displayImageURL})` } : undefined}
            aria-hidden="true"
          >
            {!displayImageURL ? <span>◔</span> : null}
          </div>

          <div className="product-option-modal__content">
            <p className="product-option-modal__desc">{product.description || '当前商品暂无更多图文详情。'}</p>
            <div className="product-option-modal__price">{formatPrice(selectedVariant?.price ?? product.price)}</div>

            <div className="detail-options detail-options--modal">
              <div className="detail-options__header">
                <h3>选择你的配置</h3>
              </div>

              <ProductOptionSelector groups={optionGroupViews} onSelect={handleSelectOption} />
            </div>

            {!selectedVariantOnSale ? <div className="notice notice--placeholder">{availabilityMessage}</div> : null}
            {selectedVariantOnSale && selectedVariant?.stock_quantity === 0 ? <div className="notice notice--placeholder">{availabilityMessage}，请调整配置。</div> : null}
          </div>
        </div>

        <div className="product-option-modal__actions">
          <button className="button button--ghost" type="button" onClick={onCancel} disabled={submitting}>
            取消
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={() => selectedVariant && onConfirm(selectedVariant)}
            disabled={submitting || !selectedVariant || !selectedVariantPurchasable}
          >
            {submitting ? '加入中...' : '确认加入购物车'}
          </button>
        </div>
      </div>
    </div>
  );
}
