import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addCartItem } from '../api/cart';
import { fetchProduct } from '../api/catalog';
import { addFavorite, deleteFavorite, fetchFavorites } from '../api/favorites';
import { useAuth } from '../auth/useAuth';
import { ProductOptionSelector } from '../components/ProductOptionSelector';
import { PageTitle } from '../components/PageTitle';
import { resolveApiErrorMessage } from '../lib/errors';
import { buildFavoriteProductIdSet } from '../lib/favorites';
import { formatPrice } from '../lib/format';
import { isProductOnSale, isProductPurchasable, resolveProductAvailabilityMessage } from '../lib/productAvailability.ts';
import { buildVariantSpecGroups, findBestMatchingVariant } from '../lib/productVariants.ts';
import type { ProductDetail, ProductGroup, ProductMedia, ProductVariant } from '../lib/types.ts';

export function ProductDetailPage() {
  const navigate = useNavigate();
  const params = useParams();
  const productId = Number(params.productId);
  const { isAuthenticated } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [group, setGroup] = useState<ProductGroup | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number>(0);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [successNoticeClosing, setSuccessNoticeClosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submittingCart, setSubmittingCart] = useState(false);
  const [submittingFavorite, setSubmittingFavorite] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [resolvedMedias, setResolvedMedias] = useState<ProductMedia[]>([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError('');

    fetchProduct(productId)
      .then((productData) => {
        setProduct(productData.product);
        setGroup(productData.group);
        setVariants(productData.variants);
        setResolvedMedias(productData.resolved_medias);
        setSelectedMediaIndex(0);
        setSelectedVariantId(productData.product.id || productData.default_product_id || productData.variants[0]?.id || 0);
      })
      .catch((cause) => {
        setError(resolveApiErrorMessage(cause, '商品详情加载失败'));
      })
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated || !productId) {
      setFavorited(false);
      return;
    }

    fetchFavorites()
      .then((data) => {
        if (!cancelled) {
          setFavorited(buildFavoriteProductIdSet(data.items).has(productId));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFavorited(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, productId]);

  /**
   * 详情页加购成功后统一走顶部轻提示，避免正文区反复插入成功消息块。
   */
  useEffect(() => {
    if (!successNotice) {
      setSuccessNoticeClosing(false);
      return;
    }

    setSuccessNoticeClosing(false);
    const hideTimer = window.setTimeout(() => {
      setSuccessNoticeClosing(true);
    }, 2600);
    const removeTimer = window.setTimeout(() => {
      setSuccessNotice('');
      setSuccessNoticeClosing(false);
    }, 3000);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [successNotice]);

  /**
   * 未登录时，详情页的加购与立即购买都先要求登录，并回跳当前商品页。
   */
  function redirectToLogin(reason: string) {
    navigate('/login', {
      state: {
        from: `/products/${selectedVariant?.id || productId}`,
        reason,
      },
    });
  }

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? variants[0] ?? null;
  const optionGroupViews = buildVariantSpecGroups(variants, selectedVariantId, group?.spec_keys ?? []);
  const currentHeroImage = resolvedMedias[selectedMediaIndex]?.image_url || selectedVariant?.image_url || group?.hero_image_url || product?.image_url || '';
  const selectedVariantOnSale = isProductOnSale(selectedVariant);
  const selectedVariantPurchasable = isProductPurchasable(selectedVariant);
  const availabilityMessage = resolveProductAvailabilityMessage(selectedVariant);

  useEffect(() => {
    if (!selectedVariant) {
      return;
    }
    if (selectedVariant.id !== productId) {
      navigate(`/products/${selectedVariant.id}`, { replace: true });
    }
  }, [navigate, productId, selectedVariant]);

  useEffect(() => {
    if (resolvedMedias.length === 0) {
      setSelectedMediaIndex(0)
      return
    }
    if (selectedMediaIndex >= resolvedMedias.length) {
      setSelectedMediaIndex(0)
    }
  }, [resolvedMedias, selectedMediaIndex])

  function handleSelectOption(specKey: string, specValue: string) {
    const nextVariant = findBestMatchingVariant({
      variants,
      selectedVariantId,
      specKey,
      specValue,
    });

    if (nextVariant) {
      setSelectedVariantId(nextVariant.id);
    }
  }

  /**
   * 商品详情页收藏直接提交当前商品 ID，商品展示快照以后端收藏接口返回为准。
   */
  async function handleToggleFavorite() {
    if (!selectedVariant) {
      return;
    }
    setError('');
    setSuccessNotice('');
    if (!isAuthenticated) {
      redirectToLogin('需要先登录后，才能将当前商品加入收藏。');
      return;
    }
    try {
      setSubmittingFavorite(true);
      if (!favorited) {
        await addFavorite(selectedVariant.id);
      } else {
        await deleteFavorite(selectedVariant.id);
      }
      setFavorited((current) => !current);
      setSuccessNotice(!favorited ? `已将 ${product?.name || selectedVariant.spec_label} 加入收藏。` : `已取消收藏 ${product?.name || selectedVariant.spec_label}。`);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, favorited ? '取消收藏失败' : '加入收藏失败'));
    } finally {
      setSubmittingFavorite(false);
    }
  }

  /**
   * 商品详情页加购直接提交当前选中的独立商品版本 ID，价格与规格摘要完全以后端快照为准。
   */
  async function handleAddToCart() {
    if (!product || !selectedVariant) {
      return;
    }
    setError('');
    setSuccessNotice('');
    if (!isAuthenticated) {
      redirectToLogin('需要先登录后，才能将当前商品加入购物车。');
      return;
    }
    try {
      setSubmittingCart(true);
      await addCartItem({
        product_id: selectedVariant.id,
        quantity: 1,
      });
      setSuccessNotice(`已将 ${product.name}${selectedVariant.spec_label ? ` ${selectedVariant.spec_label}` : ''} 加入购物车。`);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '加入购物车失败'));
    } finally {
      setSubmittingCart(false);
    }
  }

  /**
   * 立即购买先沿用当前商品的购物车链路，保证用户可以顺手继续结算。
   */
  async function handleBuyNow() {
    if (!product || !selectedVariant) {
      return;
    }
    setError('');
    setSuccessNotice('');
    if (!isAuthenticated) {
      redirectToLogin('需要先登录后，才能继续立即购买。');
      return;
    }
    try {
      setSubmittingCart(true);
      await addCartItem({
        product_id: selectedVariant.id,
        quantity: 1,
      });
      navigate('/cart');
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '立即购买暂不可用'));
    } finally {
      setSubmittingCart(false);
    }
  }

  if (loading) {
    return <div className="loading">正在加载商品详情...</div>;
  }

  if (error || !product) {
    return <div className="status status--error">{error || '商品不存在或已删除。'}</div>;
  }

  return (
    <div className="page stack">
      {successNotice ? <div className={`page-floating-notice${successNoticeClosing ? ' page-floating-notice--closing' : ''}`}>{successNotice}</div> : null}

      <PageTitle title={group?.hero_title || product.name} desc={group?.hero_subtitle || ''} />

      <section className="card detail">
        <div
          className="detail__image detail__image--photo"
          style={currentHeroImage
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(244, 246, 250, 0.16) 100%), url(${currentHeroImage})`,
              }
            : undefined}
        >
          {!currentHeroImage ? <span>◔</span> : null}
        </div>

        {resolvedMedias.length > 1 ? (
          <div className="detail__gallery" aria-label="商品图库">
            {resolvedMedias.map((media, index) => (
              <button
                key={`${media.id}-${index}`}
                className={`detail__thumbnail${selectedMediaIndex === index ? ' detail__thumbnail--active' : ''}`}
                type="button"
                onClick={() => setSelectedMediaIndex(index)}
                title={media.alt_text || product.name}
                style={media.image_url ? { backgroundImage: `url(${media.image_url})` } : undefined}
              >
                {!media.image_url ? <span>◔</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        <div className="detail__section">
          <div className="detail__price-line">
            <div className="price">{formatPrice(selectedVariant?.price ?? product.price)}</div>
            {!selectedVariantOnSale ? <div className="detail__caption detail__caption--soldout">{availabilityMessage}</div> : null}
            {selectedVariantOnSale && selectedVariant && selectedVariant.stock_quantity <= 0 ? <div className="detail__caption detail__caption--soldout">{availabilityMessage}</div> : null}
          </div>

          <p>{product.description || '当前商品暂无更多图文详情。'}</p>

          <div className="detail-options">
            <div className="detail-options__header">
              <h3>选配</h3>
            </div>

            <ProductOptionSelector groups={optionGroupViews} onSelect={handleSelectOption} />
          </div>

          {!selectedVariantOnSale ? <div className="notice notice--placeholder">{availabilityMessage}，请等待重新上架后再购买。</div> : null}
          {error ? <div className="status status--error">{error}</div> : null}
          <div className="detail-purchase">
            <button
              className={`button button--ghost${favorited ? ' button--ghost-active' : ''}`}
              type="button"
              onClick={handleToggleFavorite}
              disabled={submittingFavorite || submittingCart}
            >
              {submittingFavorite ? '收藏中...' : favorited ? '已收藏' : '加入收藏'}
            </button>
            <button className="button button--primary" type="button" onClick={handleAddToCart} disabled={submittingCart || !selectedVariantPurchasable}>
              {submittingCart ? '加入中...' : '加入购物车'}
            </button>
            <button className="button button--secondary" type="button" onClick={handleBuyNow} disabled={submittingCart || !selectedVariantPurchasable}>
              {submittingCart ? '处理中...' : '立即购买'}
            </button>
          </div>

          <div className="inline-actions">
            <Link className="button button--ghost" to="/products">
              返回商品列表
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
