import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cancelOrder, fetchOrder, fetchOrders } from '../api/orders';
import { fetchPaymentByOrder, mockConfirmPayment } from '../api/payments';
import { PageTitle } from '../components/PageTitle';
import { resolveApiErrorMessage } from '../lib/errors';
import { formatPrice, formatUnixTime } from '../lib/format';
import { canCancelOrder, canMockConfirmPayment, resolveOrderAddress, resolveOrderStatusLabel, resolveOrderSummary, resolvePaymentStatusHint, resolvePaymentStatusLabel } from '../lib/orderCenter';
import type { Order, Payment } from '../lib/types';

/**
 * 订单页当前已接入真实订单列表接口，
 * 现在进一步接通支付状态、取消订单与 mock 支付确认，形成前端可验证的最小交易闭环。
 */
export function OrdersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [paymentsByOrderId, setPaymentsByOrderId] = useState<Record<number, Payment | null>>({});
  const [paymentLoadingByOrderId, setPaymentLoadingByOrderId] = useState<Record<number, boolean>>({});
  const [paymentErrorByOrderId, setPaymentErrorByOrderId] = useState<Record<number, string>>({});
  const [actioningKey, setActioningKey] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [actionNoticeVariant, setActionNoticeVariant] = useState<'success' | 'error'>('success');
  const [actionNoticeClosing, setActionNoticeClosing] = useState(false);

  useEffect(() => {
    const notice = (location.state as { checkoutNotice?: string } | null)?.checkoutNotice;
    if (!notice) {
      return;
    }
    setActionNoticeVariant('success');
    setActionNotice(notice);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchOrders()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setOrders(data.items);
        setTotal(data.total);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }
        setError(resolveApiErrorMessage(cause, '订单加载失败'));
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
   * 订单页的操作提示统一使用顶部轻提示，避免详情区因成功/失败消息频繁跳动。
   */
  useEffect(() => {
    if (!actionNotice) {
      setActionNoticeClosing(false);
      return;
    }

    setActionNoticeClosing(false);
    const hideTimer = window.setTimeout(() => {
      setActionNoticeClosing(true);
    }, 2600);
    const removeTimer = window.setTimeout(() => {
      setActionNotice('');
      setActionNoticeClosing(false);
    }, 3000);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [actionNotice]);

  /**
   * 仅在用户展开某一笔订单时读取对应支付单，避免列表初载就发起整页并发支付查询。
   */
  async function loadPayment(orderId: number) {
    setPaymentLoadingByOrderId((current) => ({ ...current, [orderId]: true }));
    setPaymentErrorByOrderId((current) => ({ ...current, [orderId]: '' }));

    try {
      const payment = await fetchPaymentByOrder(orderId);
      setPaymentsByOrderId((current) => ({ ...current, [orderId]: payment }));
    } catch (cause) {
      setPaymentErrorByOrderId((current) => ({
        ...current,
        [orderId]: resolveApiErrorMessage(cause, '支付状态加载失败'),
      }));
    } finally {
      setPaymentLoadingByOrderId((current) => ({ ...current, [orderId]: false }));
    }
  }

  /**
   * 操作成功后重新读取当前订单与支付单，确保页面展示以最新后端状态为准。
   */
  async function refreshOrderBundle(orderId: number) {
    const [nextOrder, nextPayment] = await Promise.all([fetchOrder(orderId), fetchPaymentByOrder(orderId)]);
    setOrders((current) => current.map((item) => (item.id === orderId ? nextOrder : item)));
    setPaymentsByOrderId((current) => ({ ...current, [orderId]: nextPayment }));
    setPaymentErrorByOrderId((current) => ({ ...current, [orderId]: '' }));
  }

  /**
   * 展开订单详情时只加载当前订单所需的支付信息；再次点击则收起详情。
   */
  function handleToggleExpand(orderId: number) {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }

    setExpandedOrderId(orderId);
    if (!(orderId in paymentsByOrderId) && !paymentLoadingByOrderId[orderId]) {
      void loadPayment(orderId);
    }
  }

  /**
   * 取消订单后立即回拉后端真实状态，避免前端凭按钮点击自行推导交易结果。
   */
  async function handleCancelOrder(orderId: number) {
    setActioningKey(`cancel:${orderId}`);
    try {
      await cancelOrder(orderId);
      await refreshOrderBundle(orderId);
      setActionNoticeVariant('success');
      setActionNotice('订单已取消。');
    } catch (cause) {
      setActionNoticeVariant('error');
      setActionNotice(resolveApiErrorMessage(cause, '取消订单失败'));
    } finally {
      setActioningKey('');
    }
  }

  /**
   * 模拟支付成功或失败后，页面会同步刷新支付状态与订单状态。
   */
  async function handleMockConfirm(orderId: number, paymentId: number, result: 'SUCCESS' | 'FAILED') {
    setActioningKey(`${result}:${orderId}`);
    try {
      await mockConfirmPayment(paymentId, result);
      await refreshOrderBundle(orderId);
      setActionNoticeVariant(result === 'SUCCESS' ? 'success' : 'error');
      setActionNotice(result === 'SUCCESS' ? '支付成功。' : '支付未成功。');
    } catch (cause) {
      setActionNoticeVariant('error');
      setActionNotice(resolveApiErrorMessage(cause, '支付状态更新失败'));
    } finally {
      setActioningKey('');
    }
  }

  return (
    <div className="page stack">
      {actionNotice ? <div className={`page-floating-notice${actionNoticeVariant === 'error' ? ' page-floating-notice--error' : ''}${actionNoticeClosing ? ' page-floating-notice--closing' : ''}`}>{actionNotice}</div> : null}
      <PageTitle title="我的订单" desc="查看你已提交的订单、处理状态与后续服务入口。" />

      <section className="session-grid">
        <article className="card card--strong stack">
          <div className="hero__eyebrow">订单总览</div>
          <div className="stack">
            <strong>{total > 0 ? `当前共有 ${total} 笔订单` : '当前还没有可展示的订单'}</strong>
            <div className="muted">
              在这里查看你的订单金额、状态、支付情况与商品信息。
            </div>
          </div>
          <div className="inline-actions">
            <Link to="/products" className="button button--primary">
              去选购
            </Link>
            <Link to="/profile" className="button button--ghost">
              返回个人页
            </Link>
          </div>
        </article>

        <article className="card stack">
          <div className="hero__eyebrow">订单说明</div>
          <div className="stack">
            <strong>展开任意订单即可查看完整信息</strong>
            <div className="muted">可查看商品明细、收货信息与支付状态。</div>
            <div className="muted">待支付的订单可以取消。</div>
          </div>
        </article>
      </section>

      {error ? <div className="status status--error">{error}</div> : null}
      {loading ? <div className="loading">正在加载订单列表...</div> : null}

      {!loading && !error && orders.length > 0 ? (
        <section className="card stack">
          <div className="hero__eyebrow">最近订单</div>
          <div className="surface-list">
            {orders.map((order) => (
              <article key={order.id} className="surface-item surface-item--order">
                <div className="surface-item__main">
                      <div className="stack">
                        <strong>{order.order_no}</strong>
                        <div className="muted">{resolveOrderSummary(order)}</div>
                    <div className="badge-row">
                      <span className="badge">{resolveOrderStatusLabel(order.status)}</span>
                      <span className="badge">下单于 {formatUnixTime(order.created_at)}</span>
                    </div>
                  </div>

                  <div className="stack surface-item__aside">
                    <strong>{formatPrice(order.total_amount)}</strong>
                    <div className="muted">共 {order.total_quantity} 件</div>
                    <div className="muted">{order.receiver_name || '收货信息待补充'}</div>
                    <div className="inline-actions">
                      <button className="button button--ghost" type="button" onClick={() => handleToggleExpand(order.id)}>
                        {expandedOrderId === order.id ? '收起详情' : '查看详情'}
                      </button>
                    </div>
                  </div>
                </div>

                {expandedOrderId === order.id ? (
                  <div className="order-detail-panel">
                    <section className="order-detail-panel__section">
                      <div className="hero__eyebrow">商品明细</div>
                      <div className="order-item-list">
                        {order.items.map((item) => (
                          <article key={item.id || `${order.id}-${item.product_id}`} className="order-item-card">
                            <div
                              className={`order-item-card__thumb${item.image_url ? ' order-item-card__thumb--photo' : ''}`}
                              style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined}
                            >
                              {!item.image_url ? '◔' : null}
                            </div>
                            <div className="stack">
                              <strong>{item.name}</strong>
                              {item.option_summary ? <div className="muted">{item.option_summary}</div> : null}
                              <div className="muted">
                                {formatPrice(item.price)} × {item.quantity}
                              </div>
                            </div>
                            <strong>{formatPrice(item.amount)}</strong>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="order-detail-panel__section order-detail-panel__section--grid">
                      <article className="card stack">
                        <div className="hero__eyebrow">收货信息</div>
                        <strong>{order.receiver_name || '暂未填写收货人'}</strong>
                        <div className="muted">{order.receiver_phone || '暂未填写联系电话'}</div>
                        <div className="muted">{resolveOrderAddress(order) || '暂未填写详细地址'}</div>
                      </article>

                      <article className="card stack">
                        <div className="hero__eyebrow">支付信息</div>
                        {paymentLoadingByOrderId[order.id] ? <div className="loading">正在同步支付状态...</div> : null}

                        {!paymentLoadingByOrderId[order.id] && paymentErrorByOrderId[order.id] ? (
                          <div className="status status--error">{paymentErrorByOrderId[order.id]}</div>
                        ) : null}

                        {!paymentLoadingByOrderId[order.id] && !paymentErrorByOrderId[order.id] ? (
                          paymentsByOrderId[order.id] ? (
                            <>
                              <strong>{paymentsByOrderId[order.id]?.payment_no}</strong>
                              <div className="badge-row">
                                <span className="badge">{resolvePaymentStatusLabel(paymentsByOrderId[order.id]?.status ?? '')}</span>
                              </div>
                              <div className="muted">支付金额 {formatPrice(paymentsByOrderId[order.id]?.amount ?? 0)}</div>
                              {(paymentsByOrderId[order.id]?.paid_at ?? 0) > 0 ? (
                                <div className="muted">支付完成于 {formatUnixTime(paymentsByOrderId[order.id]?.paid_at ?? 0)}</div>
                              ) : (
                                <div className="muted">{resolvePaymentStatusHint(paymentsByOrderId[order.id]?.status ?? '')}</div>
                              )}
                            </>
                          ) : (
                            <div className="notice">支付单正在创建或同步中，可以稍后展开刷新。</div>
                          )
                        ) : null}
                      </article>
                    </section>

                    <section className="order-detail-panel__section">
                      <div className="hero__eyebrow">订单操作</div>
                      <div className="detail-purchase">
                        <button
                          className="button button--ghost"
                          type="button"
                          onClick={() => handleToggleExpand(order.id)}
                        >
                          收起详情
                        </button>

                        <button
                          className="button button--ghost"
                          type="button"
                          onClick={() => void loadPayment(order.id)}
                          disabled={paymentLoadingByOrderId[order.id] || actioningKey !== ''}
                        >
                          {paymentLoadingByOrderId[order.id] ? '刷新中...' : '刷新支付状态'}
                        </button>

                        {canCancelOrder(order.status) ? (
                          <button
                            className="button button--secondary"
                            type="button"
                            onClick={() => void handleCancelOrder(order.id)}
                            disabled={actioningKey !== ''}
                          >
                            {actioningKey === `cancel:${order.id}` ? '取消中...' : '取消订单'}
                          </button>
                        ) : null}

                        {paymentsByOrderId[order.id] && canMockConfirmPayment(order.status, paymentsByOrderId[order.id]?.status ?? '') ? (
                          <button
                            className="button button--primary"
                            type="button"
                            onClick={() => void handleMockConfirm(order.id, paymentsByOrderId[order.id]?.id ?? 0, 'SUCCESS')}
                            disabled={actioningKey !== ''}
                          >
                            {actioningKey === `SUCCESS:${order.id}` ? '支付中...' : '确认支付'}
                          </button>
                        ) : null}
                      </div>
                    </section>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !error && !orders.length ? (
        <section className="card card--strong stack">
          <div className="hero__eyebrow">最近订单</div>
          <div className="stack">
            <strong>你还没有生成任何订单</strong>
            <div className="muted">先去商品页挑选设备。创建订单后，这里会按时间倒序展示你的真实订单记录。</div>
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
