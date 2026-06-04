import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createAdminCategory,
  createAdminProductGroup,
  deleteAdminCategory,
  deleteAdminProductGroup,
  fetchCategories,
  fetchProductGroups,
  updateAdminCategory,
} from '../api/catalog';
import {
  buildAdminGroupRows,
  filterAdminGroupRows,
  sortAdminGroupRows,
  type GroupSortKey,
  type SortDirection,
} from '../lib/adminProductGroups';
import { AdminToast } from '../components/AdminToast';
import { AdminUnsavedNotice } from '../components/AdminUnsavedNotice';
import { productGroupPath } from '../lib/adminRoutes';
import { buildAdminToast, resolveApiErrorMessage, type AdminToastState } from '../lib/errors';
import type { Category, ProductGroup } from '../lib/types.ts';

/** 一级列表每页拉取的商品组数量。 */
const PAGE_SIZE = 20;

interface CategoryDraftState {
  id: number;
  name: string;
  sort_order: string;
}

/** 本地草稿类目使用负数 ID，避免与后端真实主键冲突。 */
const LOCAL_CATEGORY_DRAFT_ID_SEED = -1;

/** 可排序列的表头文案，表头渲染与排序按钮共用。 */
const SORT_COLUMN_LABELS: Record<GroupSortKey, string> = {
  name: '商品组',
  sort_order: '排序',
  status: '状态',
};

/**
 * 统一重排类目草稿的显示顺序。
 * 删除草稿或现有类目后，需要重新生成连续排序值，避免界面出现断档。
 */
function normalizeCategoryDraftOrders(items: CategoryDraftState[]): CategoryDraftState[] {
  return items.map((item, index) => ({
    ...item,
    sort_order: String(index + 1),
  }));
}

/**
 * 后台商品组列表页。
 * 一级页只负责检索、筛选、排序与进入二级详情页；版本、库存与媒体细节全部收口到详情页，
 * 数据源直接使用商品组列表接口，避免再对每个商品逐条拉详情造成的加载放大。
 */
export function AdminProductsPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<GroupSortKey>('sort_order');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [deletingId, setDeletingId] = useState(0);
  const [categoryDrafts, setCategoryDrafts] = useState<CategoryDraftState[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState(0);
  const [toast, setToast] = useState<AdminToastState | null>(null);
  const [nextLocalCategoryDraftId, setNextLocalCategoryDraftId] = useState(LOCAL_CATEGORY_DRAFT_ID_SEED);

  /**
   * 加载当前页商品组。
   * 类目过滤交给接口 category_id 参数完成，关键词与状态在本页内即时过滤。
   */
  async function loadGroups(targetPage: number, categoryValue: string) {
    setLoading(true);
    setError('');

    try {
      const categoryId = categoryValue === 'all' ? undefined : Number(categoryValue);
      const [categoryRes, groupRes] = await Promise.all([
        fetchCategories(),
        fetchProductGroups({ page: targetPage, pageSize: PAGE_SIZE, categoryId }),
      ]);
      setCategories(categoryRes.items);
      setCategoryDrafts(
        categoryRes.items.map((item) => ({
          id: item.id,
          name: item.name,
          sort_order: String(item.sort_order),
        })),
      );
      setGroups(groupRes.items);
      setTotal(groupRes.total);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '商品组列表加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGroups(page, categoryFilter);
    // 仅在分页或类目过滤变化时重新拉取，关键词/状态/排序均为本页内处理。
  }, [page, categoryFilter]);

  /**
   * 判断当前类目区是否存在本地未保存改动。
   * 右下角固定提示只关注本页的类目草稿，避免运营切换页面后漏存。
   */
  const hasUnsavedCategoryChanges = useMemo(() => {
    if (categories.length !== categoryDrafts.length) {
      return true;
    }

    return categoryDrafts.some((draft, index) => {
      const source = categories[index];
      if (!source) {
        return true;
      }
      return draft.id !== source.id || draft.name !== source.name || Number(draft.sort_order) !== source.sort_order;
    });
  }, [categories, categoryDrafts]);

  /**
   * 在一级页直接创建空白商品组草稿。
   * 新系列入口从列表层发起，创建成功后进入二级页继续完成内容编辑。
   */
  async function handleCreateDraftGroup() {
    setCreatingGroup(true);
    setError('');
    setSuccess('');

    try {
      const created = await createAdminProductGroup({
        name: '未命名商品组',
        slug: `draft-group-${Date.now()}`,
        hero_title: '',
        hero_subtitle: '',
        hero_image_url: '',
        category_id: 0,
        status: 2,
        sort_order: 9999,
        cover_image_url: '',
        spec_keys: [],
      });
      setToast(buildAdminToast('success', '空白商品组已创建，正在进入编辑页'));
      navigate(productGroupPath(created.group.id));
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '创建空白商品组失败')));
    } finally {
      setCreatingGroup(false);
    }
  }

  /**
   * 删除一个商品组。
   * 组下仍有独立商品时后端会返回前置条件失败，这里把原始报错透出给运营，便于先清理版本再删组。
   */
  async function handleDeleteGroup(group: ProductGroup) {
    const confirmed = window.confirm(`确认删除商品组「${group.name}」吗？该操作不可撤销。`);
    if (!confirmed) {
      return;
    }

    setDeletingId(group.id);
    setError('');
    setSuccess('');

    try {
      await deleteAdminProductGroup(group.id);
      setError('');
      setSuccess('');
      setToast(buildAdminToast('success', `商品组「${group.name}」已删除`));
      await loadGroups(page, categoryFilter);
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '删除商品组失败，请确认组下已无独立商品')));
    } finally {
      setDeletingId(0);
    }
  }

  /**
   * 切换排序列。
   * 再次点击同一列在升降序间切换，切换到新列时默认升序。
   */
  function handleSort(key: GroupSortKey) {
    if (key === sortKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  /**
   * 更新类目草稿输入态。
   * 一级页直接维护顶部导航与商品筛选使用的类目真值，方便运营即时调整。
   */
  function handleCategoryDraftChange(categoryId: number, field: 'name' | 'sort_order', value: string) {
    setCategoryDrafts((current) =>
      current.map((item) => (item.id === categoryId ? { ...item, [field]: value } : item)),
    );
  }

  /**
   * 在本地草稿列表中左右调整类目顺序。
   * 后端实际排序值统一在保存时重算，避免运营手输序号造成重复或断档。
   */
  function handleMoveCategory(categoryId: number, direction: 'left' | 'right') {
    setCategoryDrafts((current) => {
      const index = current.findIndex((item) => item.id === categoryId);
      if (index < 0) {
        return current;
      }

      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);

      return next.map((item, draftIndex) => ({
        ...item,
        sort_order: String(draftIndex + 1),
      }));
    });
  }

  /**
   * 新建一个本地空白类目草稿。
   * 当前页统一采用“先改草稿、后总保存”的交互，新增类目也不应立即写入后端。
   */
  function handleCreateCategory() {
    setCreatingCategory(true);
    setCategoryDrafts((current) => [
      ...current,
      {
        id: nextLocalCategoryDraftId,
        name: '未命名类目',
        sort_order: String(current.length + 1),
      },
    ]);
    setNextLocalCategoryDraftId((current) => current - 1);
    setToast(buildAdminToast('warning', '已新增本地类目草稿，请保存类目改动后生效'));
    setCreatingCategory(false);
  }

  /**
   * 统一保存全部类目草稿。
   * 当前页允许先连续调整多个类目的名称和顺序，再一次性提交到后端，减少碎片化操作。
   */
  async function handleSaveCategories() {
    setSavingCategories(true);
    setError('');
    setSuccess('');

    try {
      for (const [index, draft] of categoryDrafts.entries()) {
        const payload = {
          name: draft.name.trim() || '未命名类目',
          sort_order: index + 1,
        };
        if (draft.id > 0) {
          await updateAdminCategory(draft.id, payload);
          continue;
        }
        await createAdminCategory(payload);
      }
      setToast(buildAdminToast('success', '类目改动已保存'));
      await loadGroups(page, categoryFilter);
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '保存类目改动失败')));
    } finally {
      setSavingCategories(false);
    }
  }

  /**
   * 删除单个类目。
   * 若仍被商品引用，后端会阻止删除，这里直接向运营透出结果。
   */
  async function handleDeleteCategory(draft: CategoryDraftState) {
    if (draft.id <= 0) {
      setError('');
      setSuccess('');
      setCategoryDrafts((current) => normalizeCategoryDraftOrders(current.filter((item) => item.id !== draft.id)));
      setToast(buildAdminToast('warning', `本地类目草稿「${draft.name || '未命名类目'}」已删除`));
      return;
    }

    const confirmed = window.confirm(`确认删除类目「${draft.name || '未命名类目'}」吗？`);
    if (!confirmed) {
      return;
    }

    setDeletingCategoryId(draft.id);
    setError('');
    setSuccess('');

    try {
      const response = await deleteAdminCategory(draft.id);
      setError('');
      setSuccess('');
      setCategories((current) => current.filter((item) => item.id !== draft.id));
      setCategoryDrafts((current) => normalizeCategoryDraftOrders(current.filter((item) => item.id !== draft.id)));
      setGroups((current) =>
        current.map((item) => (item.category_id === draft.id ? { ...item, category_id: 0 } : item)),
      );
      if (response.warning) {
        setToast(buildAdminToast('warning', response.warning));
      } else {
        setToast(buildAdminToast('success', `类目「${draft.name || '未命名类目'}」已删除`));
      }
      if (categoryFilter === String(draft.id)) {
        setCategoryFilter('all');
      }
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '删除类目失败')));
    } finally {
      setDeletingCategoryId(0);
    }
  }

  const rows = useMemo(() => buildAdminGroupRows(groups, categories), [groups, categories]);

  const visibleRows = useMemo(() => {
    const filtered = filterAdminGroupRows(rows, { keyword, statusFilter });
    return sortAdminGroupRows(filtered, sortKey, sortDir);
  }, [rows, keyword, statusFilter, sortKey, sortDir]);

  const overview = useMemo(() => ({
    total,
    onSale: rows.filter((item) => item.status === 1).length,
    coverReady: rows.filter((item) => item.cover_ready).length,
  }), [rows, total]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /**
   * 渲染一个可点击的排序表头。
   * 当前排序列展示升降序箭头，点击表头切换排序列或方向。
   */
  function renderSortHeader(key: GroupSortKey) {
    const indicator = sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return (
      <button className="admin-sort-button" type="button" onClick={() => handleSort(key)}>
        {SORT_COLUMN_LABELS[key]}
        <span aria-hidden="true">{indicator}</span>
      </button>
    );
  }

  return (
    <>
      <AdminToast toast={toast} onClose={() => setToast(null)} />
      <AdminUnsavedNotice visible={hasUnsavedCategoryChanges} />

      <section className="admin-hero admin-hero--compact admin-hero--slim">
        <div className="admin-hero__copy">
          <p className="admin-hero__eyebrow">商品管理</p>
          <h1>以商品组为单位管理商品</h1>
        </div>
        <div className="admin-hero__actions">
          <button className="admin-button admin-button--primary" type="button" onClick={() => void handleCreateDraftGroup()} disabled={creatingGroup}>
            {creatingGroup ? '正在创建草稿组...' : '新增商品组'}
          </button>
          <button className="admin-button admin-button--secondary" type="button" onClick={() => void loadGroups(page, categoryFilter)}>
            刷新列表
          </button>
        </div>
      </section>

      <section className="admin-overview-grid admin-overview-grid--compact">
        <article className="admin-stat-card">
          <p>商品组总数</p>
          <strong>{overview.total}</strong>
          <span>当前类目下的商品组总量</span>
        </article>
        <article className="admin-stat-card admin-stat-card--accent">
          <p>在售中</p>
          <strong>{overview.onSale}</strong>
          <span>本页中前台可见的商品组</span>
        </article>
        <article className="admin-stat-card admin-stat-card--success">
          <p>封面完整</p>
          <strong>{overview.coverReady}</strong>
          <span>本页中已配置封面或头图的商品组</span>
        </article>
      </section>

      <section className="admin-panel admin-panel--dense">
        <div className="admin-panel__header admin-panel__header--stacked-mobile">
          <div>
            <p className="admin-panel__eyebrow">类目管理</p>
            <h2>维护前台顶部类目入口</h2>
          </div>
          <div className="admin-panel__meta">
            <span>当前共 {categoryDrafts.length} 个类目</span>
            <span>顾客端顶部导航会直接显示这里维护的类目</span>
          </div>
        </div>

        <div className="admin-inline-actions">
          <button className="admin-button admin-button--primary admin-button--small" type="button" onClick={() => void handleCreateCategory()} disabled={creatingCategory}>
            {creatingCategory ? '新增中...' : '新增类目'}
          </button>
        </div>

        <div className="admin-category-editor-list">
          {categoryDrafts.map((draft, index) => (
            <article key={draft.id} className="admin-category-editor-card">
              <span className="admin-category-editor-card__order" aria-label={`当前排序第 ${index + 1} 位`}>
                {index + 1}
              </span>
              <label className="admin-field admin-field--compact">
                <span>类目名称</span>
                <input value={draft.name} onChange={(event: ChangeEvent<HTMLInputElement>) => handleCategoryDraftChange(draft.id, 'name', event.target.value)} placeholder="例如 Mac / iPhone / iPad / 穿戴" />
              </label>
              <div className="admin-category-editor-card__actions">
                <button
                  className="admin-icon-button"
                  type="button"
                  aria-label="向左移动"
                  title="向左移动"
                  disabled={index === 0}
                  onClick={() => handleMoveCategory(draft.id, 'left')}
                >
                  ‹
                </button>
                <button
                  className="admin-icon-button"
                  type="button"
                  aria-label="向右移动"
                  title="向右移动"
                  disabled={index === categoryDrafts.length - 1}
                  onClick={() => handleMoveCategory(draft.id, 'right')}
                >
                  ›
                </button>
                <button
                  className="admin-button admin-button--danger admin-button--small"
                  type="button"
                  onClick={() => void handleDeleteCategory(draft)}
                  disabled={deletingCategoryId === draft.id}
                >
                  {deletingCategoryId === draft.id ? '删除中...' : '删除'}
                </button>
              </div>
            </article>
          ))}
          {categoryDrafts.length === 0 ? <div className="notice notice--placeholder">当前还没有类目，请先新增类目。</div> : null}
        </div>

        {categoryDrafts.length > 0 ? (
          <div className="admin-inline-actions admin-inline-actions--end">
            <button className="admin-button admin-button--primary admin-button--small" type="button" onClick={() => void handleSaveCategories()} disabled={savingCategories}>
              {savingCategories ? '保存中...' : '保存类目改动'}
            </button>
          </div>
        ) : null}
      </section>

      <section className="admin-panel admin-panel--dense">
        <div className="admin-panel__header admin-panel__header--stacked-mobile">
          <div>
            <p className="admin-panel__eyebrow">运营列表</p>
            <h2>商品组列表</h2>
          </div>
          <div className="admin-panel__meta">
            <span>共 {total} 个商品组</span>
            <span>本页 {groups.length} 个 · 筛选后 {visibleRows.length} 个</span>
          </div>
        </div>

        <div className="admin-filter-bar">
          <label className="admin-filter-field admin-filter-field--wide">
            <span>搜索</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索商品组名称、类目或状态"
            />
          </label>
          <label className="admin-filter-field">
            <span>类目</span>
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">全部类目</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field">
            <span>状态</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">全部状态</option>
              <option value="1">在售</option>
              <option value="2">下架</option>
            </select>
          </label>
        </div>

        {loading ? <div className="loading">正在加载商品组数据...</div> : null}
        {!loading && error ? <div className="status status--error">{error}</div> : null}

        {!loading && !error ? (
          <div className="admin-table-wrap admin-table-wrap--dense">
            <table className="admin-table admin-table--dense">
              <thead>
                <tr>
                  <th>{renderSortHeader('name')}</th>
                  <th>类目</th>
                  <th>{renderSortHeader('sort_order')}</th>
                  <th>{renderSortHeader('status')}</th>
                  <th>封面</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="admin-product-cell admin-product-cell--dense">
                        <div
                          className={`admin-product-cell__thumb${(row.cover_image_url || row.hero_image_url) ? ' admin-product-cell__thumb--photo' : ''}`}
                          style={(row.cover_image_url || row.hero_image_url) ? { backgroundImage: `url(${row.cover_image_url || row.hero_image_url})` } : undefined}
                          aria-hidden="true"
                        />
                        <div className="admin-product-cell__copy">
                          <strong>{row.name}</strong>
                          <span>{row.slug || '未设置标识'}</span>
                        </div>
                      </div>
                    </td>
                    <td>{row.category_name}</td>
                    <td>{row.sort_order}</td>
                    <td>
                      <span className={`admin-badge${row.status === 1 ? ' admin-badge--accent' : ''}`}>{row.status_label}</span>
                    </td>
                    <td>
                      <span className={`admin-badge${row.cover_ready ? ' admin-badge--success' : ' admin-badge--danger'}`}>
                        {row.cover_ready ? '完整' : '缺失'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <Link className="admin-button admin-button--ghost admin-button--small" to={productGroupPath(row.id)}>
                          进入编辑
                        </Link>
                        <button
                          className="admin-button admin-button--danger admin-button--small"
                          type="button"
                          onClick={() => void handleDeleteGroup(row)}
                          disabled={deletingId === row.id}
                        >
                          {deletingId === row.id ? '删除中...' : '删除'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="notice notice--placeholder">当前筛选条件下没有匹配的商品组。</div>
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
