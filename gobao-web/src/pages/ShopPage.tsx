import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { addCartItem } from '../api/cart';
import { fetchCategories, fetchProduct, fetchProducts } from '../api/catalog';
import { addFavorite, deleteFavorite, fetchFavorites } from '../api/favorites';
import { useAuth } from '../auth/useAuth';
import { ProductOptionModal } from '../components/ProductOptionModal';
import { resolveApiErrorMessage } from '../lib/errors';
import { applyFavoriteToggle, buildFavoriteProductIdSet } from '../lib/favorites';
import { formatPrice } from '../lib/format';
import { isProductOnSale, resolveProductAvailabilityMessage } from '../lib/productAvailability.ts';
import type { Category, ProductDetailResponse, ProductListItem, ProductVariant } from '../lib/types.ts';

function resolveCategoryName(categories: Category[], categoryId: number): string {
  return categories.find((item) => item.id === categoryId)?.name ?? `系列 ${categoryId}`;
}

function BoutiqueProductCard({
  product,
  categories,
  onAddToCart,
  onAddToFavorite,
  isFavorited,
  favoriteSubmitting,
}: {
  product: ProductListItem;
  categories: Category[];
  onAddToCart: (product: ProductListItem) => void;
  onAddToFavorite: (product: ProductListItem) => void;
  isFavorited: boolean;
  favoriteSubmitting: boolean;
}) {
  const displayImageURL = product.cover_image_url || product.image_url;
  const onSale = isProductOnSale(product);
  const availabilityMessage = resolveProductAvailabilityMessage(product);

  return (
    <article className="boutique-card">
      <div className="boutique-card__link">
        <div className="boutique-card__copy">
          <p className="boutique-card__eyebrow">{resolveCategoryName(categories, product.category_id)}</p>
          <h3>{product.name}</h3>
          <p className="boutique-card__desc">{product.description || '简洁、克制、适合长期陈列的精品电子单品。'}</p>
          <div className="boutique-card__price-line">
            <span className="boutique-card__price">{formatPrice(product.price)}</span>
          </div>
          {!onSale ? <div className="boutique-card__notice">{availabilityMessage}</div> : null}
        </div>

        <div className="boutique-card__visual">
          <div
            className={`boutique-card__device${displayImageURL ? ' boutique-card__device--photo' : ''}`}
            style={displayImageURL ? { backgroundImage: `url(${displayImageURL})` } : undefined}
            aria-hidden="true"
          >
            {!displayImageURL ? <span>◔</span> : null}
          </div>
        </div>

        <div className="boutique-card__footer">
          <div className="boutique-card__actions">
            <Link className="boutique-card__cta" to={`/products/${product.id}`}>
              进一步了解
            </Link>
            <button
              className={`boutique-card__cart boutique-card__cart--favorite${isFavorited ? ' boutique-card__cart--favorite-active' : ''}`}
              type="button"
              disabled={favoriteSubmitting}
              onClick={() => onAddToFavorite(product)}
            >
              {favoriteSubmitting ? '处理中...' : isFavorited ? '已收藏' : '收藏'}
            </button>
            <button className="boutique-card__cart" type="button" onClick={() => onAddToCart(product)} disabled={!onSale}>
              {onSale ? '加入购物车' : '当前无法购买'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ShopPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [favoriteProductIds, setFavoriteProductIds] = useState<Set<number>>(new Set());
  // 类目筛选由 URL 查询参数驱动，让首页类目入口可以带 ?category=<id> 直接进入并自动筛选，
  // 同时浏览器前进 / 后退与链接分享都能保留当前产品线。
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryId = Number(searchParams.get('category')) || 0;
  const [page, setPage] = useState(1);

  /**
   * 把类目切换收敛为统一入口：写回 URL 并回到第一页。
   * 选「全部产品」时清空 category 参数，保持地址栏干净。
   */
  function handleSelectCategory(nextCategoryId: number) {
    setSearchParams(nextCategoryId > 0 ? { category: String(nextCategoryId) } : {});
    setPage(1);
  }
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cartNotice, setCartNotice] = useState('');
  const [cartNoticeClosing, setCartNoticeClosing] = useState(false);
  const [favoriteSubmittingId, setFavoriteSubmittingId] = useState(0);
  const [optionDetail, setOptionDetail] = useState<ProductDetailResponse | null>(null);
  const [loadingOption, setLoadingOption] = useState(false);
  const [submittingOption, setSubmittingOption] = useState(false);

  useEffect(() => {
    fetchCategories()
      .then((data) => setCategories(data.items))
      .catch((cause) => {
        setError(resolveApiErrorMessage(cause, '产品线加载失败'));
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setFavoriteProductIds(new Set());
      return;
    }

    fetchFavorites()
      .then((data) => {
        if (!cancelled) {
          setFavoriteProductIds(buildFavoriteProductIdSet(data.items));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFavoriteProductIds(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // 类目变化（含来自首页类目入口的外部跳转）时回到第一页，避免沿用上一产品线的页码。
  useEffect(() => {
    setPage(1);
  }, [categoryId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchProducts({ categoryId, page, pageSize: 12 })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setProducts(data.items);
        setTotal(data.total);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }
        setError(resolveApiErrorMessage(cause, '商品加载失败'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 12)), [total]);

  /**
   * 顶部轻提示用于承接加购成功反馈，避免把成功状态插入正文打断浏览节奏。
   */
  useEffect(() => {
    if (!cartNotice) {
      setCartNoticeClosing(false);
      return;
    }

    setCartNoticeClosing(false);
    const hideTimer = window.setTimeout(() => {
      setCartNoticeClosing(true);
    }, 2600);
    const removeTimer = window.setTimeout(() => {
      setCartNotice('');
      setCartNoticeClosing(false);
    }, 3000);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [cartNotice]);

  /**
   * 将当前商品以最小数据结构加入购物车，失败时复用统一错误提示。
   */
  function handleAddToCart(product: ProductListItem) {
    setCartNotice('');
    setError('');
    if (!isProductOnSale(product)) {
      setCartNotice(resolveProductAvailabilityMessage(product));
      return;
    }
    if (!isAuthenticated) {
      navigate('/login', {
        state: {
          from: `/products/${product.id}`,
          reason: '需要先登录后，才能将商品加入购物车。',
        },
      });
      return;
    }
    setLoadingOption(true);
    fetchProduct(product.id)
      .then((detail) => {
        setOptionDetail(detail);
      })
      .catch((cause) => {
        setError(resolveApiErrorMessage(cause, '商品选配加载失败'));
      })
      .finally(() => {
        setLoadingOption(false);
      });
  }

  /**
   * 商品列表页收藏直接按 product_id 提交，真实展示字段以后端收藏快照为准。
   */
  async function handleToggleFavorite(product: ProductListItem) {
    setCartNotice('');
    setError('');
    if (!isAuthenticated) {
      navigate('/login', {
        state: {
          from: `/products/${product.id}`,
          reason: '需要先登录后，才能将商品加入收藏。',
        },
      });
      return;
    }
    try {
      setFavoriteSubmittingId(product.id);
      const shouldFavorite = !favoriteProductIds.has(product.id);
      if (shouldFavorite) {
        await addFavorite(product.id);
      } else {
        await deleteFavorite(product.id);
      }
      setFavoriteProductIds((current) => applyFavoriteToggle(current, product.id, shouldFavorite));
      setCartNotice(shouldFavorite ? `已将 ${product.name} 加入收藏。` : `已取消收藏 ${product.name}。`);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, favoriteProductIds.has(product.id) ? '取消收藏失败' : '加入收藏失败'));
    } finally {
      setFavoriteSubmittingId(0);
    }
  }

  /**
   * 列表页确认选配后直接提交当前版本对应的独立商品 ID，价格与规格摘要完全以后端快照为准。
   */
  async function handleConfirmAddToCart(variant: ProductVariant) {
    if (!optionDetail) {
      return;
    }
    try {
      setSubmittingOption(true);
      await addCartItem({
        product_id: variant.id,
        quantity: 1,
      });
      setOptionDetail(null);
      setCartNotice(`已将 ${optionDetail.product.name}${variant.spec_label ? ` ${variant.spec_label}` : ''} 加入购物车。`);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '加入购物车失败'));
    } finally {
      setSubmittingOption(false);
    }
  }

  return (
    <div className="boutique-page">
      {cartNotice ? <div className={`page-floating-notice${cartNoticeClosing ? ' page-floating-notice--closing' : ''}`}>{cartNotice}</div> : null}
      <ProductOptionModal
        detail={optionDetail}
        open={Boolean(optionDetail)}
        submitting={submittingOption}
        onCancel={() => {
          if (!submittingOption) {
            setOptionDetail(null);
          }
        }}
        onConfirm={handleConfirmAddToCart}
      />

      <section className="boutique-hero">
        <div className="boutique-hero__copy">
          <p className="boutique-hero__eyebrow">在线商店</p>
          <h1>{categoryId === 0 ? '探索我们的电子产品。' : resolveCategoryName(categories, categoryId)}</h1>
          <p>
            当前商品页按精品电子商店定位展示：少量精选、清晰分组、重视产品本身的层级与质感。
            列表页只保留每个产品系列的主展示卡片，具体版本选择统一放到详情页与加购选配中完成。
          </p>
        </div>

        <div className="boutique-hero__meta">
          <span>当前页 {page}</span>
          <span>共 {total} 件商品</span>
        </div>
      </section>

      <section className="boutique-toolbar">
        <div className="boutique-toolbar__tabs">
          <button
            className={categoryId === 0 ? 'boutique-tab boutique-tab--active' : 'boutique-tab'}
            type="button"
            onClick={() => handleSelectCategory(0)}
          >
            全部产品
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              className={categoryId === category.id ? 'boutique-tab boutique-tab--active' : 'boutique-tab'}
              type="button"
              onClick={() => handleSelectCategory(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="boutique-toolbar__hint">
          当前支持系列筛选、分页浏览、版本选配、收藏、加购与下单链路。
        </div>
      </section>

      {error ? <div className="status status--error">{error}</div> : null}
      {loading ? <div className="loading">正在陈列精选电子产品...</div> : null}
      {loadingOption ? <div className="loading">正在加载商品选配...</div> : null}
      {!loading && !products.length ? <div className="empty">当前产品线下暂无商品。</div> : null}

      <section className="boutique-grid">
        {products.map((product) => (
          <BoutiqueProductCard
            key={product.id}
            product={product}
            categories={categories}
            onAddToCart={handleAddToCart}
            isFavorited={favoriteProductIds.has(product.id)}
            favoriteSubmitting={favoriteSubmittingId === product.id}
            onAddToFavorite={(nextProduct) => {
              if (!favoriteSubmittingId || favoriteSubmittingId === nextProduct.id) {
                void handleToggleFavorite(nextProduct);
              }
            }}
          />
        ))}
      </section>

      <section className="boutique-pagination">
        <button className="button button--ghost" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          上一页
        </button>
        <button
          className="button button--primary"
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((current) => current + 1)}
        >
          下一页
        </button>
      </section>
    </div>
  );
}
