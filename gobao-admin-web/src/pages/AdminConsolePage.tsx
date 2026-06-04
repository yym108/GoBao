import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminAccounts } from '../api/adminAuth';
import { fetchCategories, fetchProductGroups, fetchProducts } from '../api/catalog';
import { fetchAdminOrders } from '../api/orders';
import { useAdminAuth } from '../auth/useAdminAuth';
import { buildOrderOverview } from '../lib/adminOrders';
import { resolveApiErrorMessage } from '../lib/errors';
import { formatPrice } from '../lib/format';
import { resolveOrderStatusLabel, resolveOrderSummary } from '../lib/orderCenter';
import type { AdminAccountSummary, Category, Order, ProductGroup, ProductListItem } from '../lib/types';

interface ConsoleSnapshot {
  categories: Category[];
  groups: ProductGroup[];
  products: ProductListItem[];
  orders: Order[];
  orderTotal: number;
  accounts: AdminAccountSummary[];
}

const EMPTY_SNAPSHOT: ConsoleSnapshot = {
  categories: [],
  groups: [],
  products: [],
  orders: [],
  orderTotal: 0,
  accounts: [],
};

/**
 * 后台总览页从已落地接口读取真实数据。
 * 这里不新增聚合后端，先复用现有后台模块接口生成运营概览，后续可再收敛为专用 dashboard API。
 */
export function AdminConsolePage() {
  const { admin } = useAdminAuth();
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /**
   * 并行拉取总览所需的真实数据。
   * 后台账号列表只有超级管理员可访问，普通管理员跳过该请求以保留总览页可用性。
   */
  async function loadDashboard() {
    setLoading(true);
    setError('');

    try {
      const [categoryRes, groupRes, productRes, orderRes, accountRes] = await Promise.all([
        fetchCategories(),
        fetchProductGroups({ page: 1, pageSize: 200 }),
        fetchProducts({ page: 1, pageSize: 200 }),
        fetchAdminOrders({ page: 1, pageSize: 8 }),
        admin?.is_super_admin ? fetchAdminAccounts() : Promise.resolve({ items: [] }),
      ]);

      setSnapshot({
        categories: categoryRes.items,
        groups: groupRes.items,
        products: productRes.items,
        orders: orderRes.items,
        orderTotal: orderRes.total,
        accounts: accountRes.items,
      });
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '后台总览数据加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, [admin?.is_super_admin]);

  const groupOverview = useMemo(() => ({
    onSale: snapshot.groups.filter((item) => item.status === 1).length,
    offSale: snapshot.groups.filter((item) => item.status !== 1).length,
    missingCover: snapshot.groups.filter((item) => !item.cover_image_url).length,
  }), [snapshot.groups]);

  const productOverview = useMemo(() => ({
    onSale: snapshot.products.filter((item) => item.status === 1).length,
    offSale: snapshot.products.filter((item) => item.status !== 1).length,
  }), [snapshot.products]);

  const orderOverview = useMemo(() => buildOrderOverview(snapshot.orders), [snapshot.orders]);
  const superAdminCount = useMemo(
    () => snapshot.accounts.filter((account) => account.is_super_admin).length,
    [snapshot.accounts],
  );

  const latestGroups = useMemo(
    () => snapshot.groups.slice().sort((a, b) => a.sort_order - b.sort_order).slice(0, 5),
    [snapshot.groups],
  );
  const latestOrders = useMemo(() => snapshot.orders.slice(0, 2), [snapshot.orders]);

  return (
    <>
      <section className="admin-hero admin-hero--compact admin-dashboard-hero">
        <div className="admin-hero__copy">
          <p className="admin-hero__eyebrow">后台总览</p>
          <h1>运营概览</h1>
          <p>汇总你权限范围内的商品、订单与类目当前状态。</p>
        </div>
        <div className="admin-hero__actions">
          <button className="admin-button admin-button--primary" type="button" onClick={() => void loadDashboard()}>
            刷新数据
          </button>
        </div>
      </section>

      {loading ? <div className="loading">正在加载后台总览数据...</div> : null}
      {!loading && error ? <div className="status status--error">{error}</div> : null}

      <section className="admin-dashboard-stat-grid">
        <article className="admin-stat-card admin-dashboard-stat-card admin-stat-card--accent">
          <p>商品组</p>
          <strong>{snapshot.groups.length}</strong>
          <span>上架 {groupOverview.onSale} 个，下架 {groupOverview.offSale} 个</span>
        </article>
        <article className="admin-stat-card admin-dashboard-stat-card">
          <p>商品版本</p>
          <strong>{snapshot.products.length}</strong>
          <span>上架 {productOverview.onSale} 个，下架 {productOverview.offSale} 个</span>
        </article>
        <article className="admin-stat-card admin-dashboard-stat-card admin-stat-card--warning">
          <p>订单</p>
          <strong>{snapshot.orderTotal}</strong>
          <span>待支付 {orderOverview.created} 笔，已支付 {orderOverview.paid} 笔</span>
        </article>
        <article className="admin-stat-card admin-dashboard-stat-card admin-stat-card--success">
          <p>{admin?.is_super_admin ? '后台账号' : '当前身份'}</p>
          <strong>{admin?.is_super_admin ? snapshot.accounts.length : '普通'}</strong>
          <span>{admin?.is_super_admin ? `超级管理员 ${superAdminCount} 个` : '账号列表仅超级管理员可查看'}</span>
        </article>
      </section>

      <section className="admin-content-grid admin-content-grid--products">
        <div className="admin-panel admin-panel--wide">
          <div className="admin-panel__header">
            <div>
              <p className="admin-panel__eyebrow">商品状态</p>
              <h2>商品组与陈列质量</h2>
            </div>
            <Link className="admin-button admin-button--secondary" to="/products">
              进入商品管理
            </Link>
          </div>

          <div className="admin-dashboard-metrics">
            <article>
              <span>类目</span>
              <strong>{snapshot.categories.length}</strong>
            </article>
            <article>
              <span>缺少封面</span>
              <strong>{groupOverview.missingCover}</strong>
            </article>
            <article>
              <span>上架商品组</span>
              <strong>{groupOverview.onSale}</strong>
            </article>
          </div>

          <div className="admin-table-wrap admin-table-wrap--dense">
            <table className="admin-table admin-table--dense admin-dashboard-table">
              <thead>
                <tr>
                  <th>商品组</th>
                  <th>类目</th>
                  <th>状态</th>
                  <th>排序</th>
                </tr>
              </thead>
              <tbody>
                {latestGroups.map((group) => {
                  const category = snapshot.categories.find((item) => item.id === group.category_id);
                  return (
                    <tr key={group.id}>
                      <td>
                        <div className="admin-order-cell">
                          <strong>{group.name || '未命名商品组'}</strong>
                          <span>{group.cover_image_url ? '封面已配置' : '缺少封面图'}</span>
                        </div>
                      </td>
                      <td>{category?.name || '暂无类目'}</td>
                      <td>
                        <span className={`admin-badge${group.status === 1 ? ' admin-badge--accent' : ' admin-badge--warning'}`}>
                          {group.status === 1 ? '上架' : '下架'}
                        </span>
                      </td>
                      <td>{group.sort_order}</td>
                    </tr>
                  );
                })}
                {!latestGroups.length ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="notice">当前还没有商品组数据。</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-side-stack">
          <section className="admin-panel admin-panel--dense">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">账号与数据</p>
                <h2>管理入口</h2>
              </div>
            </div>
            <div className="admin-dashboard-actions">
              <Link to="/users">
                <strong>用户账户</strong>
                <span>{admin?.is_super_admin ? `${snapshot.accounts.length} 个后台账号` : '维护当前后台账号密码'}</span>
              </Link>
              <Link to="/products">
                <strong>类目维护</strong>
                <span>{snapshot.categories.length} 个前台类目</span>
              </Link>
            </div>
          </section>

          <section className="admin-panel admin-panel--dense">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">订单状态</p>
                <h2>最近订单</h2>
              </div>
              <Link className="admin-button admin-button--ghost admin-button--small" to="/orders">
                订单中心
              </Link>
            </div>
            <div className="admin-dashboard-list">
              {latestOrders.map((order) => (
                <article key={order.id}>
                  <div className="admin-dashboard-list__main">
                    <strong>{order.order_no || `订单 ${order.id}`}</strong>
                    <span>{resolveOrderSummary(order)}</span>
                  </div>
                  <div className="admin-dashboard-list__meta">
                    <span className="admin-dashboard-list__amount">{formatPrice(order.total_amount)}</span>
                    <span>{resolveOrderStatusLabel(order.status)}</span>
                  </div>
                </article>
              ))}
              {!latestOrders.length ? <div className="notice">当前还没有订单数据。</div> : null}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
