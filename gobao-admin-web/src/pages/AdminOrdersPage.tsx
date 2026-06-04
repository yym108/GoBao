import { Fragment, useEffect, useMemo, useState } from 'react';
import { cancelAdminOrder, fetchAdminOrders } from '../api/orders';
import { ORDER_STATUS_FILTERS, buildOrderOverview } from '../lib/adminOrders';
import { resolveApiErrorMessage } from '../lib/errors';
import { formatPrice, formatUnixTime } from '../lib/format';
import { canCancelOrder, resolveOrderAddress, resolveOrderStatusLabel, resolveOrderSummary } from '../lib/orderCenter';
import type { Order } from '../lib/types';

/** 一级订单列表每页拉取数量。 */
const PAGE_SIZE = 20;

/**
 * 后台订单中心页。
 * 管理员只读工作台：跨用户分页查看全部订单、按状态筛选、展开详情，并可关闭未支付订单。
 */
export function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [emailInput, setEmailInput] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [page, setPage] = useState(1);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [closingId, setClosingId] = useState(0);

  /**
   * 加载当前页订单。
   * 状态过滤交给后端 status 参数完成，分页 total 也以后端返回为准。
   */
  async function loadOrders(targetPage: number, status: string, email: string) {
    setLoading(true);
    setError('');

    try {
      const res = await fetchAdminOrders({
        page: targetPage,
        pageSize: PAGE_SIZE,
        status: status === 'all' ? undefined : status,
        email: email || undefined,
      });
      setOrders(res.items);
      setTotal(res.total);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '订单列表加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders(page, statusFilter, emailFilter);
  }, [page, statusFilter, emailFilter]);

  /**
   * 应用邮箱搜索：把输入框内容设为生效筛选并回到第一页。
   */
  function handleSearchEmail() {
    setEmailFilter(emailInput.trim());
    setPage(1);
  }

  /**
   * 清除邮箱筛选。
   */
  function handleClearEmail() {
    setEmailInput('');
    setEmailFilter('');
    setPage(1);
  }

  /**
   * 关闭一笔未支付订单。
   * 关闭后重新拉取当前页，确保状态以后端真值为准。
   */
  async function handleCloseOrder(order: Order) {
    const confirmed = window.confirm(`确认关闭订单 ${order.order_no} 吗？该操作会取消订单并回补库存。`);
    if (!confirmed) {
      return;
    }

    setClosingId(order.id);
    setError('');
    setSuccess('');

    try {
      await cancelAdminOrder(order.id);
      setSuccess(`订单 ${order.order_no} 已关闭`);
      await loadOrders(page, statusFilter, emailFilter);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '关闭订单失败'));
    } finally {
      setClosingId(0);
    }
  }

  /**
   * 展开/收起订单详情。
   * 管理员列表接口已带回订单明细，详情直接复用列表数据，无需二次请求。
   */
  function handleToggleExpand(orderId: number) {
    setExpandedOrderId((current) => (current === orderId ? null : orderId));
  }

  const overview = useMemo(() => buildOrderOverview(orders), [orders]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <section className="admin-hero admin-hero--compact admin-hero--slim">
        <div className="admin-hero__copy">
          <p className="admin-hero__eyebrow">订单中心</p>
          <h1>查看与管理全部订单</h1>
        </div>
        <div className="admin-hero__actions">
          <button className="admin-button admin-button--secondary" type="button" onClick={() => void loadOrders(page, statusFilter, emailFilter)}>
            刷新订单
          </button>
        </div>
      </section>

      {success ? <div className="status status--success">{success}</div> : null}

      <section className="admin-overview-grid admin-overview-grid--compact">
        <article className="admin-stat-card">
          <p>订单总数</p>
          <strong>{total}</strong>
          <span>当前筛选条件下的订单总量</span>
        </article>
        <article className="admin-stat-card admin-stat-card--warning">
          <p>待支付</p>
          <strong>{overview.created}</strong>
          <span>本页中待支付订单数</span>
        </article>
        <article className="admin-stat-card admin-stat-card--success">
          <p>已支付</p>
          <strong>{overview.paid}</strong>
          <span>本页中已支付订单数</span>
        </article>
        <article className="admin-stat-card">
          <p>已取消</p>
          <strong>{overview.cancelled}</strong>
          <span>本页中已取消订单数</span>
        </article>
      </section>

      <section className="admin-panel admin-panel--dense">
        <div className="admin-panel__header admin-panel__header--stacked-mobile">
          <div>
            <p className="admin-panel__eyebrow">履约列表</p>
            <h2>全部订单</h2>
          </div>
          <div className="admin-panel__meta">
            <span>共 {total} 笔</span>
            <span>第 {page} / {totalPages} 页</span>
          </div>
        </div>

        <div className="admin-filter-bar">
          <label className="admin-filter-field">
            <span>状态</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              {ORDER_STATUS_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field admin-filter-field--wide">
            <span>买家邮箱</span>
            <input
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSearchEmail();
                }
              }}
              placeholder="按买家邮箱精确搜索"
            />
          </label>
          <div className="admin-filter-actions">
            <button className="admin-button admin-button--primary admin-button--small" type="button" onClick={handleSearchEmail}>
              搜索
            </button>
            {emailFilter ? (
              <button className="admin-button admin-button--ghost admin-button--small" type="button" onClick={handleClearEmail}>
                清除
              </button>
            ) : null}
          </div>
        </div>
        {emailFilter ? <div className="admin-panel__meta"><span>当前按邮箱 {emailFilter} 筛选</span></div> : null}

        {loading ? <div className="loading">正在加载订单数据...</div> : null}
        {!loading && error ? <div className="status status--error">{error}</div> : null}

        {!loading && !error ? (
          <div className="admin-table-wrap admin-table-wrap--dense">
            <table className="admin-table admin-table--dense">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>用户</th>
                  <th>商品</th>
                  <th>金额</th>
                  <th>下单时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <Fragment key={order.id}>
                    <tr>
                      <td><strong>{order.order_no}</strong></td>
                      <td>#{order.user_id}</td>
                      <td>{resolveOrderSummary(order)}</td>
                      <td>{formatPrice(order.total_amount)}</td>
                      <td>{formatUnixTime(order.created_at)}</td>
                      <td>
                        <span className={`admin-badge${order.status === 'PAID' ? ' admin-badge--success' : order.status === 'CANCELLED' ? ' admin-badge--danger' : ' admin-badge--warning'}`}>
                          {resolveOrderStatusLabel(order.status)}
                        </span>
                      </td>
                      <td>
                        <div className="admin-table-actions">
                          <button className="admin-button admin-button--ghost admin-button--small" type="button" onClick={() => handleToggleExpand(order.id)}>
                            {expandedOrderId === order.id ? '收起' : '详情'}
                          </button>
                          {canCancelOrder(order.status) ? (
                            <button
                              className="admin-button admin-button--danger admin-button--small"
                              type="button"
                              onClick={() => void handleCloseOrder(order)}
                              disabled={closingId === order.id}
                            >
                              {closingId === order.id ? '关闭中...' : '关闭订单'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {expandedOrderId === order.id ? (
                      <tr className="admin-order-detail-row">
                        <td colSpan={7}>
                          <div className="admin-order-detail">
                            <div className="admin-order-detail__section">
                              <p className="admin-panel__eyebrow">商品明细</p>
                              {order.items.length > 0 ? (
                                order.items.map((item) => (
                                  <div className="admin-order-detail__item" key={item.id || `${order.id}-${item.product_id}`}>
                                    <span>{item.name}{item.option_summary ? ` · ${item.option_summary}` : ''}</span>
                                    <span>{formatPrice(item.price)} × {item.quantity}</span>
                                    <strong>{formatPrice(item.amount)}</strong>
                                  </div>
                                ))
                              ) : (
                                <div className="notice notice--placeholder">当前订单暂无商品明细。</div>
                              )}
                            </div>
                            <div className="admin-order-detail__section">
                              <p className="admin-panel__eyebrow">收货信息</p>
                              <div><strong>{order.receiver_name || '暂未填写收货人'}</strong> · {order.receiver_phone || '暂无电话'}</div>
                              <div className="muted">{resolveOrderAddress(order) || '暂无详细地址'}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="notice notice--placeholder">当前筛选条件下没有订单。</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <div className="admin-pagination">
              <button
                className="admin-button admin-button--ghost admin-button--small"
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                上一页
              </button>
              <span className="admin-pagination__info">第 {page} / {totalPages} 页</span>
              <button
                className="admin-button admin-button--ghost admin-button--small"
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
