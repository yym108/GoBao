import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchProduct } from '../api/catalog';
import { fetchSeckillActivity, purchaseSeckill } from '../api/seckill';
import { useAuth } from '../auth/useAuth';
import { PageTitle } from '../components/PageTitle';
import { resolveApiErrorMessage } from '../lib/errors';
import { createRequestId, formatPrice, formatUnixTime } from '../lib/format';
import type { ProductDetail, SeckillActivity, SeckillPurchaseResult } from '../lib/types';

export function SeckillPage() {
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const initialId = Number(searchParams.get('activityId') ?? '1');
  const [activityId, setActivityId] = useState(Number.isNaN(initialId) ? 1 : initialId);
  const [activity, setActivity] = useState<SeckillActivity | null>(null);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [requestId, setRequestId] = useState(createRequestId());
  const [result, setResult] = useState<SeckillPurchaseResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setResult(null);

    fetchSeckillActivity(activityId)
      .then(async (data) => {
        if (cancelled) {
          return;
        }
        setActivity(data.activity);
        const productData = await fetchProduct(data.activity.product_id);
        if (!cancelled) {
          setProduct(productData.product);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(resolveApiErrorMessage(cause, '秒杀活动加载失败'));
          setActivity(null);
          setProduct(null);
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
  }, [activityId]);

  async function handlePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setResult(null);

    try {
      const response = await purchaseSeckill(activityId, {
        request_id: requestId,
        quantity: 1,
      });
      setResult(response);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '抢购请求失败'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page stack">
      <PageTitle
        title="秒杀活动详情 / 抢购页"
        desc="当前仅能完成活动查询与抢购排队。秒杀结果查询仍未开放，相关说明以下方红色提示为准。"
      />

      <section className="card split">
        <form className="form" onSubmit={(event) => event.preventDefault()}>
          <div className="field">
            <label htmlFor="activityId">活动 ID</label>
            <input
              id="activityId"
              type="number"
              min={1}
              value={activityId}
              onChange={(event) => setActivityId(Math.max(1, Number(event.target.value) || 1))}
            />
          </div>

          <div className="notice notice--placeholder">
            文档未提供活动列表接口，因此当前页面需要手动输入活动 ID 进行联调。
          </div>
        </form>

        <div className="card card--strong">
          <h3>抢购前说明</h3>
          <p className="muted">当前购买接口要求登录且 `quantity` 固定为 1；重试时必须复用同一个 `request_id`。</p>
          <div className="chips">
            <span className="chip">{isAuthenticated ? '已登录，可直接抢购' : '未登录，请先登录'}</span>
            <span className="chip chip--placeholder">活动结果查询接口未开放</span>
          </div>
        </div>
      </section>

      {error ? <div className="status status--error">{error}</div> : null}
      {loading ? <div className="loading">正在读取秒杀活动...</div> : null}

      {activity && product ? (
        <section className="card detail">
          <div className="detail__section">
            <div className="chips">
              <span className="chip">活动 ID {activity.id}</span>
              <span className="chip">商品 ID {activity.product_id}</span>
              <span className="chip">状态 {activity.status}</span>
            </div>

            <h2>{activity.title}</h2>
            <div className="detail__price-line">
              <div className="price price--seckill">{formatPrice(activity.seckill_price)}</div>
              <div className="detail__caption">原价 {formatPrice(product.price)}</div>
            </div>

            <div className="stack small">
              <div>活动库存：{activity.seckill_stock}</div>
              <div>开始时间：{formatUnixTime(activity.start_at)}</div>
              <div>结束时间：{formatUnixTime(activity.end_at)}</div>
              <div>关联商品库存：{product.stock_quantity}</div>
            </div>

            <div className="tip">
              秒杀流量控制与 Redis 预扣库存都在后端完成；本页只负责按文档生成请求并展示排队结果。
            </div>
          </div>

          <div className="card card--strong">
            <form className="form" onSubmit={handlePurchase}>
              <div className="field">
                <label htmlFor="requestId">request_id</label>
                <input
                  id="requestId"
                  type="text"
                  value={requestId}
                  onChange={(event) => setRequestId(event.target.value)}
                  required
                />
              </div>

              <div className="inline-actions">
                <button className="button button--secondary" type="button" onClick={() => setRequestId(createRequestId())}>
                  重新生成
                </button>
                <button className="button button--primary" type="submit" disabled={!isAuthenticated || submitting}>
                  {submitting ? '提交中...' : '发起抢购'}
                </button>
              </div>

              {!isAuthenticated ? (
                <div className="status status--info">
                  请先 <Link to="/login">登录</Link> 再发起抢购。
                </div>
              ) : null}
            </form>

            {result ? (
              <div className="status status--success">
                已进入排队：request_id={result.request_id}，剩余活动库存 {result.remaining}。当前后端未开放结果查询接口，请以排队成功为止。
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
