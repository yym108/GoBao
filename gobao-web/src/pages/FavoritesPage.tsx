import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteFavorite, fetchFavorites } from '../api/favorites';
import { PageTitle } from '../components/PageTitle';
import { resolveApiErrorMessage } from '../lib/errors';
import { removeFavoriteProductId } from '../lib/favorites';
import { formatPrice, formatUnixTime } from '../lib/format';
import { resolveFavoritesPanelCopy } from '../lib/storeCopy.ts';
import type { FavoriteItem } from '../lib/types';

/**
 * 收藏页当前已接入真实收藏接口，
 * 展示用户已收藏的商品快照，并支持取消收藏和跳转商品详情页。
 */
export function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeClosing, setNoticeClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchFavorites()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setFavorites(data.items);
        setTotal(data.total);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }
        setError(resolveApiErrorMessage(cause, '收藏列表加载失败'));
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

  /**
   * 收藏相关操作统一通过顶部轻提示反馈，避免在列表区插入过多状态块打断浏览。
   */
  useEffect(() => {
    if (!notice) {
      setNoticeClosing(false);
      return;
    }

    setNoticeClosing(false);
    const hideTimer = window.setTimeout(() => {
      setNoticeClosing(true);
    }, 2600);
    const removeTimer = window.setTimeout(() => {
      setNotice('');
      setNoticeClosing(false);
    }, 3000);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [notice]);

  /**
   * 取消收藏后直接刷新本地列表快照，保持当前页面逻辑简单稳定。
   */
  async function handleDeleteFavorite(item: FavoriteItem) {
    try {
      await deleteFavorite(item.product_id);
      const nextItems = removeFavoriteProductId(favorites, item.product_id);
      setFavorites(nextItems);
      setTotal(nextItems.length);
      setNotice(`已取消收藏 ${item.name}。`);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '取消收藏失败'));
    }
  }

  return (
    <div className="page stack">
      {notice ? <div className={`page-floating-notice${noticeClosing ? ' page-floating-notice--closing' : ''}`}>{notice}</div> : null}
      <PageTitle title="我的收藏" desc="集中查看你已标记的商品，方便后续比较与继续选购。" />

      <section className="session-grid">
        <article className="card card--strong stack">
          <div className="hero__eyebrow">收藏总览</div>
          <div className="stack">
            <strong>{total > 0 ? `当前已收藏 ${total} 件商品` : '当前还没有收藏的商品'}</strong>
            <div className="muted">{resolveFavoritesPanelCopy()}</div>
          </div>
          <div className="inline-actions">
            <Link to="/products" className="button button--primary">
              去逛商品
            </Link>
            <Link to="/profile" className="button button--ghost">
              返回个人页
            </Link>
          </div>
        </article>

        <article className="card stack">
          <div className="hero__eyebrow">收藏说明</div>
          <div className="stack">
            <strong>随时回到这里继续选购</strong>
            <div className="muted">可以查看商品详情、取消收藏，或回到商品页继续浏览。</div>
          </div>
        </article>
      </section>

      {error ? <div className="status status--error">{error}</div> : null}
      {loading ? <div className="loading">正在加载收藏列表...</div> : null}

      {!loading && !error && favorites.length > 0 ? (
        <section className="card stack">
          <div className="hero__eyebrow">收藏清单</div>
          <div className="surface-list">
            {favorites.map((item) => (
              <article key={item.product_id} className="surface-item">
                <div className="favorites-item">
                  <div
                    className={`favorites-item__thumb${item.image_url ? ' favorites-item__thumb--photo' : ''}`}
                    style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined}
                  >
                    {!item.image_url ? '◔' : null}
                  </div>

                  <div className="favorites-item__copy">
                    <strong>{item.name}</strong>
                    <div className="muted">{item.description || '当前商品暂无更多简介。'}</div>
                    {!item.available ? <div className="status status--error">{item.unavailable_reason || '该商品已不存在或已下线'}</div> : null}
                    <div className="muted">收藏于 {formatUnixTime(item.favorited_at)}</div>
                  </div>
                </div>

                <div className="favorites-item__meta">
                  <strong>{item.available ? formatPrice(item.price) : '暂不可购买'}</strong>
                  <div className="favorites-item__actions">
                    {item.available ? (
                      <Link to={`/products/${item.product_id}`} className="button button--ghost">
                        查看详情
                      </Link>
                    ) : (
                      <button type="button" className="button button--ghost" disabled>
                        已下线
                      </button>
                    )}
                    <button type="button" className="button button--secondary" onClick={() => handleDeleteFavorite(item)}>
                      取消收藏
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !error && !favorites.length ? (
        <section className="card card--strong stack">
          <div className="hero__eyebrow">收藏清单</div>
          <div className="stack">
            <strong>你的收藏夹还没有商品</strong>
            <div className="muted">去商品页挑选感兴趣的设备。加入收藏后，这里会按最近收藏时间倒序展示真实列表。</div>
          </div>
          <div className="inline-actions">
            <Link to="/products" className="button button--primary">
              去逛商品
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
