import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCategories, fetchProducts } from '../api/catalog';
import { useAuth } from '../auth/useAuth';
import { resolveApiErrorMessage } from '../lib/errors';
import { formatPrice } from '../lib/format';
import { isProductOnSale } from '../lib/productAvailability';
import type { Category, ProductListItem } from '../lib/types';

/**
 * 首页只展示用户可理解的系列名，找不到类目时回退为通用文案。
 */
function resolveCategoryName(categories: Category[], categoryId: number): string {
  return categories.find((item) => item.id === categoryId)?.name ?? '精选产品';
}

/**
 * 首页卡片优先使用商品组封面图，避免不同版本图影响入口页陈列稳定性。
 */
function resolveProductImage(product: ProductListItem): string {
  return product.cover_image_url || product.image_url || '';
}

export function HomePage() {
  const { user, isAuthenticated } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 右侧大卡片在多个商品间循环展示，heroIndex 为当前展示位，heroPaused 用于鼠标悬停时暂停轮播。
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);

  /**
   * 首页读取真实类目与商品列表，后端不可用时仅降级展示错误，不阻断静态入口。
   */
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchCategories(),
      fetchProducts({ page: 1, pageSize: 6 }),
    ])
      .then(([categoryData, productData]) => {
        if (cancelled) {
          return;
        }
        setCategories(categoryData.items);
        setProducts(productData.items.slice(0, 6));
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(resolveApiErrorMessage(cause, '首页内容加载失败'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 右侧大卡片只轮播上架可售商品，过滤掉下架 / 无效（如未命名占位）的商品组，避免展示空价无图卡片。
  const heroProducts = useMemo(() => products.filter((item) => isProductOnSale(item)), [products]);

  // 商品就绪后每隔数秒推进一位，悬停或可售商品不足两件时停止轮播。
  useEffect(() => {
    if (heroProducts.length <= 1 || heroPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroProducts.length);
    }, 4200);

    return () => {
      window.clearInterval(timer);
    };
  }, [heroProducts.length, heroPaused]);

  // 取模兜底，避免可售商品数量变化后 heroIndex 越界。
  const heroProduct = heroProducts.length ? heroProducts[heroIndex % heroProducts.length] : undefined;
  const spotlightProducts = useMemo(() => products.slice(1, 5), [products]);
  // 类目入口改为横向滚动展示，这里放开数量限制，产品线再多也能通过左右滚动查看。
  const visibleCategories = categories;
  const heroImage = heroProduct ? resolveProductImage(heroProduct) : '';

  return (
    <div className="home-entry">
      <section className="home-entry__hero">
        <div className="home-entry__hero-copy">
          <p className="home-entry__eyebrow">GoBao Store</p>
          <h1>精选电子产品，从一个清晰的选择开始。</h1>
          <p>
            少量精品、真实库存、后端定价。浏览产品系列，选择适合自己的版本，然后继续完成购物车、地址、订单与支付流程。
          </p>
          <div className="home-entry__actions">
            <Link className="button button--primary" to="/products">
              选购产品
            </Link>
            <Link className="button button--ghost" to={isAuthenticated ? '/profile' : '/login'}>
              {isAuthenticated ? '进入个人中心' : '登录后继续'}
            </Link>
          </div>
        </div>

        <Link
          className="home-entry__hero-card"
          to={heroProduct ? `/products/${heroProduct.id}` : '/products'}
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
        >
          {/* key 绑定 heroIndex，每次切换商品都重挂载并重放淡入动画，形成渐变过渡。 */}
          <div key={`copy-${heroIndex}`} className="home-entry__hero-card-copy home-entry__hero-fade">
            <span>{heroProduct ? resolveCategoryName(categories, heroProduct.category_id) : '本周推荐'}</span>
            <h2>{heroProduct?.name ?? '为你的桌面挑选一件主角。'}</h2>
            <p>{heroProduct?.description || '进入商品页，查看当前已经接入后端的精品电子产品。'}</p>
            {heroProduct ? <strong>{formatPrice(heroProduct.price)}</strong> : null}
          </div>
          <div
            key={`device-${heroIndex}`}
            className={`home-entry__hero-device home-entry__hero-fade${heroImage ? ' home-entry__hero-device--photo' : ''}`}
            style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
            aria-hidden="true"
          >
            {!heroImage ? <span>◔</span> : null}
          </div>
        </Link>
      </section>

      <section className="home-entry__strip" aria-label="商店入口">
        <Link to="/products" className="home-entry__strip-item">
          <strong>全部产品</strong>
          <span>浏览当前可售商品</span>
        </Link>
        {visibleCategories.map((category) => (
          <Link
            key={category.id}
            to={`/products?category=${category.id}`}
            className="home-entry__strip-item"
          >
            <strong>{category.name}</strong>
            <span>查看产品线</span>
          </Link>
        ))}
      </section>

      {error ? <div className="status status--error">{error}</div> : null}
      {loading ? <div className="loading">正在准备首页陈列...</div> : null}

      <section className="home-entry__section-heading">
        <div>
          <p>精选陈列</p>
          <h2>从少量关键产品开始浏览。</h2>
        </div>
        <Link to="/products">查看全部产品</Link>
      </section>

      <section className="home-entry__product-grid">
        {(spotlightProducts.length ? spotlightProducts : products).map((product) => {
          const imageURL = resolveProductImage(product);
          return (
            <Link key={product.id} className="home-entry__product-card" to={`/products/${product.id}`}>
              <div className="home-entry__product-copy">
                <span>{resolveCategoryName(categories, product.category_id)}</span>
                <h3>{product.name}</h3>
                <p>{product.description || '查看详情，选择具体规格版本。'}</p>
                <strong>{formatPrice(product.price)}</strong>
              </div>
              <div
                className={`home-entry__product-visual${imageURL ? ' home-entry__product-visual--photo' : ''}`}
                style={imageURL ? { backgroundImage: `url(${imageURL})` } : undefined}
                aria-hidden="true"
              >
                {!imageURL ? <span>◔</span> : null}
              </div>
            </Link>
          );
        })}
      </section>

      <section className="home-entry__service-grid">
        <article className="home-entry__service-card home-entry__service-card--dark">
          <span>购买流程</span>
          <h2>挑选、下单、收货，一站式轻松完成。</h2>
          <p>浏览心仪商品，选好规格加入购物车，填写收货地址即可下单付款，全程顺畅无忧。</p>
          <Link to="/cart">查看购物车</Link>
        </article>

        <article className="home-entry__service-card">
          <span>账户服务</span>
          <h2>{isAuthenticated ? `${user?.nickname || '用户'}，继续管理你的账户。` : '登录后使用完整商店能力。'}</h2>
          <p>{isAuthenticated ? '进入个人中心管理订单、收藏、地址与账户信息。' : '登录后可收藏商品、加入购物车、选择地址并创建订单。'}</p>
          <Link to={isAuthenticated ? '/profile' : '/login'}>{isAuthenticated ? '前往个人中心' : '登录 / 注册'}</Link>
        </article>
      </section>
    </div>
  );
}
