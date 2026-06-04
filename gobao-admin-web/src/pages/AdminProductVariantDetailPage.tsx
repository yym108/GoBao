import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createAdminProduct,
  deleteAdminProduct,
  fetchCategories,
  fetchProduct,
  updateAdminProduct,
  updateAdminProductStock,
} from '../api/catalog';
import { resolveApiErrorMessage } from '../lib/errors';
import { formatPrice } from '../lib/format';
import {
  alignSpecValuesToKeys,
  deriveSpecLabel,
  formatCentsToYuan,
  parseSpecValuesToPairs,
  parseYuanToCents,
  serializeSpecValues,
  type SpecPair,
} from '../lib/adminProductVariantForm';
import { productGroupPath, productVariantPath } from '../lib/adminRoutes';
import type { Category, ProductDetailResponse, ProductListItem } from '../lib/types.ts';

interface AdminProductRow extends ProductListItem {
  group_id: number;
  category_name: string;
  resolved_media_count: number;
  variant_count: number;
  stock_quantity: number;
  status_label: string;
}

interface ProductEditorFormState {
  name: string;
  description: string;
  /** 价格以「元」录入，提交时再转换为后端使用的「分」。 */
  price: string;
  category_id: string;
  image_url: string;
  sort_order: string;
  status: string;
}

interface StockEditorFormState {
  quantity: string;
}

const DEFAULT_EDITOR_FORM: ProductEditorFormState = {
  name: '',
  description: '',
  price: '',
  category_id: '',
  image_url: '',
  sort_order: '1',
  status: '1',
};

const DEFAULT_STOCK_FORM: StockEditorFormState = {
  quantity: '0',
};

/**
 * 子商品状态码统一映射为后台文案。
 * 三级页的版本切换条、状态摘要与表单展示共用同一套文案映射。
 */
function resolveStatusLabel(status: number): string {
  if (status === 1) {
    return '在售';
  }
  if (status === 2) {
    return '下架';
  }
  return '未知';
}

/**
 * 将类目编号转换为类目名称。
 * 子商品三级页直接展示类目名称，避免运营在版本编辑时对内部编号做换算。
 */
function resolveCategoryName(categories: Category[], categoryId: number): string {
  return categories.find((item) => item.id === categoryId)?.name ?? `类目 ${categoryId}`;
}

/**
 * 将详情真值写入子商品编辑表单。
 * 三级页的商品基础信息始终以后端详情结果为准，避免前端自行猜测默认值。
 */
function buildEditorForm(detail: ProductDetailResponse): ProductEditorFormState {
  return {
    name: detail.product.name,
    description: detail.product.description,
    price: formatCentsToYuan(detail.product.price),
    category_id: String(detail.product.category_id),
    image_url: detail.product.image_url,
    sort_order: String(detail.product.sort_order || 1),
    status: String(detail.product.status || 1),
  };
}

/**
 * 将库存快照写入库存表单。
 * 库存并发版本号由页面在提交时自动取详情快照，不再交给运营手工维护。
 */
function buildStockForm(detail: ProductDetailResponse): StockEditorFormState {
  return {
    quantity: String(detail.product.stock_quantity || 0),
  };
}

/**
 * 将字符串输入收口为整数。
 * 非法值统一回退为 0，由后端继续做最终业务校验。
 */
function parseInteger(input: string): number {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

/**
 * 子商品三级页。
 * 当前页面只承接子商品基础信息与库存，商品组图片与详情图库统一留在上一级页面维护。
 */
export function AdminProductVariantDetailPage() {
  const navigate = useNavigate();
  const { groupId, productId } = useParams<{ groupId: string; productId: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ProductDetailResponse | null>(null);
  const [editorMode, setEditorMode] = useState<'edit' | 'create'>('edit');
  const [editorForm, setEditorForm] = useState<ProductEditorFormState>(DEFAULT_EDITOR_FORM);
  const [specPairs, setSpecPairs] = useState<SpecPair[]>([]);
  const [stockForm, setStockForm] = useState<StockEditorFormState>(DEFAULT_STOCK_FORM);
  const [savingPage, setSavingPage] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const parsedGroupId = Number.parseInt(groupId ?? '', 10);
  const parsedProductId = Number.parseInt(productId ?? '', 10);

  /**
   * 读取当前子商品详情，并补齐同组版本与图片真值。
   * 三级页只围绕当前子商品工作，所有版本切换都通过重新拉取详情实现。
   */
  async function loadProductDetail(preferredSelectedProductId?: number | null) {
    const targetProductId = preferredSelectedProductId ?? parsedProductId;
    if (Number.isNaN(targetProductId) || targetProductId <= 0) {
      setError('子商品编号无效，无法进入编辑页');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [categoryRes, detail] = await Promise.all([
        fetchCategories(),
        fetchProduct(targetProductId),
      ]);

      setCategories(categoryRes.items);
      setSelectedDetail(detail);
      setSelectedProductId(detail.product.id);
      setEditorForm(buildEditorForm(detail));
      // 规格维度由商品组定义，子商品只在这些维度上回填值。
      setSpecPairs(alignSpecValuesToKeys(detail.group.spec_keys ?? [], parseSpecValuesToPairs(detail.product.spec_values_json)));
      setStockForm(buildStockForm(detail));
      setEditorMode('edit');
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '子商品详情加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProductDetail();
  }, [parsedProductId]);

  const rows = useMemo(() => {
    if (!selectedDetail) {
      return [] as AdminProductRow[];
    }

    return selectedDetail.variants.map((variant) => ({
      id: variant.id,
      name: variant.name || selectedDetail.group.name || selectedDetail.product.name,
      description: variant.description || selectedDetail.product.description,
      price: variant.price,
      category_id: variant.category_id || selectedDetail.product.category_id,
      image_url: variant.image_url,
      cover_image_url: selectedDetail.group.cover_image_url,
      status: variant.status,
      group_id: variant.group_id,
      spec_label: variant.spec_label,
      spec_values_json: variant.spec_values_json,
      sort_order: variant.sort_order,
      created_at: variant.created_at || 0,
      updated_at: variant.updated_at || 0,
      category_name: resolveCategoryName(categories, variant.category_id || selectedDetail.product.category_id),
      resolved_media_count: selectedDetail.product_medias.length,
      variant_count: selectedDetail.variants.length || 1,
      stock_quantity: variant.stock_quantity,
      status_label: resolveStatusLabel(variant.status),
    }));
  }, [categories, selectedDetail]);

  const selectedRow = useMemo(
    () => (selectedProductId ? rows.find((item) => item.id === selectedProductId) ?? null : null),
    [rows, selectedProductId],
  );
  const overview = useMemo(() => {
    return {
      totalProducts: rows.length,
      mediaCount: selectedDetail?.group_medias.length ?? 0,
      lowStock: rows.filter((item) => item.stock_quantity > 0 && item.stock_quantity <= 10).length,
    };
  }, [rows, selectedDetail]);

  /**
   * 切换同组版本时改到对应三级路由。
   * 所有版本状态都以后端详情接口重建，避免本地拼接不同版本快照。
   */
  function handleSelectProduct(productID: number) {
    if (productID === selectedProductId) {
      return;
    }
    setSuccess('');
    setError('');
    const groupID = selectedDetail?.group.id || parsedGroupId;
    navigate(productVariantPath(groupID, productID));
  }

  /**
   * 切换到新增同系列版本模式。
   * 创建态复用当前商品组与类目，减少后台重复录入。
   */
  function handleStartCreateVariant() {
    if (!selectedDetail) {
      return;
    }
    setEditorMode('create');
    setSuccess('');
    setError('');
    setEditorForm({
      ...buildEditorForm(selectedDetail),
      name: selectedDetail.group.name || selectedDetail.product.name,
      price: '',
      sort_order: String((selectedDetail.variants.length || 0) + 1),
    });
    // 新版本沿用商品组维度，值全部留空待填。
    setSpecPairs(alignSpecValuesToKeys(selectedDetail.group.spec_keys ?? [], []));
    setStockForm({ quantity: '0' });
  }

  /**
   * 重置子商品编辑器到后端真值。
   * 这样可以快速丢弃当前输入，回到已确认的详情快照。
   */
  function handleResetEditor() {
    setEditorMode('edit');
    setSuccess('');
    setError('');
    if (selectedDetail) {
      setEditorForm(buildEditorForm(selectedDetail));
      setSpecPairs(alignSpecValuesToKeys(selectedDetail.group.spec_keys ?? [], parseSpecValuesToPairs(selectedDetail.product.spec_values_json)));
      setStockForm(buildStockForm(selectedDetail));
      return;
    }
    setEditorForm(DEFAULT_EDITOR_FORM);
    setSpecPairs([]);
    setStockForm(DEFAULT_STOCK_FORM);
  }

  /**
   * 更新某个规格维度的值。
   * 维度名由商品组定义、此处只读，子商品只能修改值来区分配置。
   */
  function handleSpecValueChange(index: number, value: string) {
    setSpecPairs((current) => current.map((pair, position) => (position === index ? { ...pair, value } : pair)));
  }

  /**
   * 子商品编辑表单按字段名更新。
   * 所有数值型字段在提交前再统一收口为数字。
   */
  function handleEditorChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setEditorForm((current) => ({ ...current, [name]: value }));
  }

  /**
   * 库存表单按字段名更新。
   * 当前只维护库存数量，并发版本号由提交时自动取详情快照。
   */
  function handleStockChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setStockForm((current) => ({ ...current, [name]: value }));
  }

  /**
   * 一次性保存当前三级页全部改动。
   * 基础信息与库存统一由页面底部总操作提交，避免分段保存导致版本状态不一致。
   */
  async function handleSubmitPage() {
    setSavingPage(true);
    setError('');
    setSuccess('');

    try {
      // 所属商品组在三级页固定为当前进入的组，不允许在此迁移版本到别的组。
      const groupId = selectedDetail?.product.group_id || parsedGroupId;
      const basePayload = {
        name: editorForm.name.trim(),
        description: editorForm.description.trim(),
        price: parseYuanToCents(editorForm.price),
        category_id: parseInteger(editorForm.category_id),
        image_url: editorForm.image_url.trim(),
        group_id: groupId,
        spec_label: deriveSpecLabel(specPairs),
        spec_values_json: serializeSpecValues(specPairs),
        sort_order: parseInteger(editorForm.sort_order),
        status: parseInteger(editorForm.status),
      };

      if (editorMode === 'create') {
        // 新增版本时库存数量直接作为初始库存写入，不再二次调用库存接口。
        const created = await createAdminProduct({
          ...basePayload,
          initial_stock: parseInteger(stockForm.quantity),
        });
        setSuccess('新版本已创建并写入库存');
        navigate(productVariantPath(selectedDetail?.group.id || parsedGroupId, created.product.id));
        return;
      }
      if (!selectedProductId) {
        throw new Error('当前没有选中的子商品可供编辑');
      }

      await updateAdminProduct(selectedProductId, basePayload);
      // 并发版本号自动取最近一次详情快照，CAS 在后台静默生效。
      await updateAdminProductStock(selectedProductId, {
        quantity: parseInteger(stockForm.quantity),
        expected_version: selectedDetail?.product.stock_version ?? 0,
      });
      setSuccess('当前子商品页面改动已保存');
      await loadProductDetail(selectedProductId);
      setEditorMode('edit');
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, editorMode === 'create' ? '创建子商品版本失败' : '保存当前子商品页面失败'));
    } finally {
      setSavingPage(false);
    }
  }

  /**
   * 删除当前子商品版本。
   * 删除成功后退回商品组页，避免停留在失效的三级路由上。
   */
  async function handleDeleteSelectedProduct() {
    if (!selectedProductId) {
      return;
    }

    const confirmed = window.confirm('确认删除当前独立商品版本吗？此操作会影响下单与库存真值。');
    if (!confirmed) {
      return;
    }

    setDeletingProduct(true);
    setError('');
    setSuccess('');

    try {
      await deleteAdminProduct(selectedProductId);
      navigate(productGroupPath(selectedDetail?.group.id || parsedGroupId), { replace: true });
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '删除商品失败'));
    } finally {
      setDeletingProduct(false);
    }
  }

  return (
    <>
      <section className="admin-hero admin-hero--compact">
        <div className="admin-hero__copy">
          <p className="admin-hero__eyebrow">子商品编辑</p>
          <h1>集中维护当前子商品的信息与库存。</h1>
          <p>这里处理具体子商品的基础信息、价格、规格和库存。商品组封面、详情页顶部大图与详情页图集请在商品组页维护。</p>
        </div>
        <div className="admin-hero__actions">
          <Link className="admin-button admin-button--ghost" to={productGroupPath(selectedDetail?.group.id || parsedGroupId)}>返回商品组</Link>
          <button className="admin-button admin-button--primary" type="button" onClick={handleStartCreateVariant} disabled={!selectedDetail}>新增同系列版本</button>
          <button className="admin-button admin-button--secondary" type="button" onClick={() => void loadProductDetail(selectedProductId)}>刷新详情</button>
        </div>
      </section>

      {loading ? <div className="status status--info">正在加载子商品详情...</div> : null}
      {!loading && error ? <div className="status status--error">{error}</div> : null}
      {!loading && success ? <div className="status status--success">{success}</div> : null}

      {!loading && !error && selectedDetail ? (
        <>
          <section className="admin-product-command-bar">
            <div className="admin-product-command-bar__main">
              <strong>{editorMode === 'create' ? '新增同系列版本' : selectedRow?.spec_label || selectedDetail.product.name}</strong>
              <span>{selectedDetail.group.name || '未命名商品组'} / 当前版本 #{editorMode === 'create' ? '新建' : selectedDetail.product.id}</span>
            </div>
            <div className="admin-product-command-bar__metrics">
              <span>同系列 {overview.totalProducts}</span>
              <span>组内图片 {overview.mediaCount}</span>
              <span>低库存 {overview.lowStock}</span>
            </div>
          </section>

          <section className="admin-product-workbench admin-product-workbench--variant">
            <div className="admin-product-workbench__main">
            <section className="admin-panel admin-panel--wide admin-product-editor-panel">
              <div className="admin-panel__header">
                <div>
                  <p className="admin-panel__eyebrow">子商品编辑器</p>
                  <h2>{editorMode === 'create' ? '新增同系列版本' : '编辑当前版本'}</h2>
                </div>
                <button className="admin-button admin-button--ghost" type="button" onClick={handleResetEditor}>重置表单</button>
              </div>

              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>商品名称</span>
                  <input name="name" value={editorForm.name} onChange={handleEditorChange} placeholder="请输入商品名称" />
                </label>
                <label className="admin-field">
                  <span>所属商品组</span>
                  <input value={`${selectedDetail.group.name || '未命名商品组'} / ${selectedDetail.group.slug || '未设置标识'}`} readOnly disabled />
                </label>
                <label className="admin-field">
                  <span>类目</span>
                  <select name="category_id" value={editorForm.category_id} onChange={handleEditorChange}>
                    <option value="">请选择类目</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>状态</span>
                  <select name="status" value={editorForm.status} onChange={handleEditorChange}>
                    <option value="1">在售</option>
                    <option value="2">下架</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>价格（元）</span>
                  <input name="price" value={editorForm.price} onChange={handleEditorChange} placeholder="例如 8999.00" />
                </label>
                <label className="admin-field">
                  <span>排序</span>
                  <input name="sort_order" value={editorForm.sort_order} onChange={handleEditorChange} placeholder="同系列内越小越靠前" />
                </label>
                <div className="admin-field admin-field--full">
                  <span>规格配置（维度由商品组定义，这里只填值）</span>
                  <div className="admin-spec-editor">
                    {specPairs.length > 0 ? (
                      specPairs.map((pair, index) => (
                        <div className="admin-spec-editor__row" key={`spec-value-${pair.key}`}>
                          <input className="admin-spec-editor__key" value={pair.key} readOnly disabled />
                          <input
                            className="admin-spec-editor__value"
                            value={pair.value}
                            onChange={(event) => handleSpecValueChange(index, event.target.value)}
                            placeholder={`请输入${pair.key}的值`}
                          />
                        </div>
                      ))
                    ) : (
                      <p className="admin-field-hint">当前商品组还没有定义规格维度。请先返回商品组页定义维度（如 芯片 / 内存 / 存储），再回到这里填值。</p>
                    )}
                    {specPairs.length > 0 ? (
                      <p className="admin-field-hint">规格文案将自动生成：{deriveSpecLabel(specPairs) || '（暂无，填值后生成）'}</p>
                    ) : null}
                  </div>
                </div>
                <div className="admin-field admin-field--full">
                  <span>当前主图</span>
                  <div className="admin-inline-media">
                    <div className={`admin-inline-media__thumb${editorForm.image_url ? ' admin-inline-media__thumb--photo' : ''}`} style={editorForm.image_url ? { backgroundImage: `url(${editorForm.image_url})` } : undefined} />
                    <div className="admin-inline-media__copy">
                      <strong>{editorForm.image_url ? '已设置商品主图' : '当前未设置主图'}</strong>
                      <span>这是本子商品的主图。详情页图集与系列图片请在商品组页维护。</span>
                    </div>
                  </div>
                </div>
                <label className="admin-field admin-field--full">
                  <span>商品描述</span>
                  <textarea name="description" value={editorForm.description} onChange={handleEditorChange} rows={5} placeholder="请输入商品描述" />
                </label>
              </div>

              <div className="admin-divider" />

              <div className="admin-panel__header">
                <div>
                  <p className="admin-panel__eyebrow">库存设置</p>
                  <h2>库存数量</h2>
                </div>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>库存数量</span>
                  <input name="quantity" value={stockForm.quantity} onChange={handleStockChange} placeholder="请输入库存数量" />
                </label>
              </div>
            </section>
            </div>

            <aside className="admin-product-inspector">
              <section className="admin-panel admin-panel--compact">
                <div className="admin-panel__header">
                  <div>
                    <p className="admin-panel__eyebrow">同系列版本</p>
                    <h2>{selectedDetail.group.name || selectedDetail.product.name}</h2>
                  </div>
                </div>
                <div className="admin-variant-strip admin-variant-strip--column">
                  {rows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={`admin-variant-strip__item${row.id === selectedProductId ? ' admin-variant-strip__item--active' : ''}`}
                      onClick={() => handleSelectProduct(row.id)}
                    >
                      <div className={`admin-variant-strip__thumb${row.image_url ? ' admin-variant-strip__thumb--photo' : ''}`} style={row.image_url ? { backgroundImage: `url(${row.image_url})` } : undefined} />
                      <div className="admin-variant-strip__copy">
                        <strong>{row.spec_label || row.name}</strong>
                        <span>{formatPrice(row.price)} / 库存 {row.stock_quantity}</span>
                        <span>{row.status_label} / {row.category_name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="admin-panel admin-panel--compact">
                <div className="admin-panel__header">
                  <div>
                    <p className="admin-panel__eyebrow">当前版本摘要</p>
                    <h2>{selectedRow?.status_label ?? '新增草稿'}</h2>
                  </div>
                </div>
                <div className="admin-product-inspector__summary">
                  <div>
                    <span>价格</span>
                    <strong>{editorForm.price ? `¥${editorForm.price}` : '待填写'}</strong>
                  </div>
                  <div>
                    <span>库存</span>
                    <strong>{stockForm.quantity || '0'}</strong>
                  </div>
                  <div>
                    <span>规格</span>
                    <strong>{deriveSpecLabel(specPairs) || '未设置'}</strong>
                  </div>
                </div>
                <p className="admin-field-hint">价格、规格、库存都是子商品交易真值，保存后会直接影响用户端选配、加购和下单。</p>
              </section>
            </aside>
          </section>

          <section className="admin-panel admin-panel--dense">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">页面操作</p>
                <h2>保存当前子商品</h2>
              </div>
            </div>
            <div className="admin-form-actions">
              <button className="admin-button admin-button--primary" type="button" disabled={savingPage || (editorMode === 'edit' && !selectedProductId)} onClick={() => void handleSubmitPage()}>
                {savingPage ? '正在保存当前页面...' : editorMode === 'create' ? '创建并保存当前页面' : '保存当前页面全部改动'}
              </button>
              {editorMode === 'edit' ? (
                <button className="admin-button admin-button--secondary" type="button" onClick={() => void handleDeleteSelectedProduct()} disabled={deletingProduct || !selectedProductId}>
                  {deletingProduct ? '正在删除...' : '删除商品'}
                </button>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
