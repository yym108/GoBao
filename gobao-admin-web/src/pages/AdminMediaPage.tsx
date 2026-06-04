import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  bindGroupMedia,
  bindProductMedia,
  deleteGroupMediaBinding,
  deleteProductMediaBinding,
  fetchCategories,
  fetchProduct,
  fetchProducts,
  updateAdminProductGroup,
  updateGroupMediaBinding,
  updateProductMediaBinding,
  uploadAdminMedia,
} from '../api/catalog';
import { resolveApiErrorMessage } from '../lib/errors';
import type { Category, ProductDetailResponse, ProductListItem, ProductMedia } from '../lib/types.ts';

interface AdminMediaRow {
  id: number;
  group_id: number;
  name: string;
  spec_label: string;
  category_name: string;
  cover_image_url: string;
  hero_image_url: string;
  group_medias: ProductMedia[];
  product_medias: ProductMedia[];
  resolved_medias: ProductMedia[];
}

interface UploadFormState {
  file: File | null;
  alt_text: string;
  target_scope: 'group' | 'product';
  usage_type: 'cover' | 'hero' | 'gallery';
  sort_order: string;
  is_primary: boolean;
}

const DEFAULT_UPLOAD_FORM: UploadFormState = {
  file: null,
  alt_text: '',
  target_scope: 'group',
  usage_type: 'gallery',
  sort_order: '1',
  is_primary: false,
};

/**
 * 将类目 ID 统一转成名称，避免后台图片资产页继续显示内部编号。
 */
function resolveCategoryName(categories: Category[], categoryId: number): string {
  return categories.find((item) => item.id === categoryId)?.name ?? `类目 ${categoryId}`;
}

/**
 * 将商品详情响应整理成图片媒体视角的后台行结构。
 * 当前后台媒体页直接基于真实详情结果渲染，以保证“查看结果”和“前台展示结果”一致。
 */
function buildMediaRows(
  products: ProductListItem[],
  details: Map<number, ProductDetailResponse>,
  categories: Category[],
): AdminMediaRow[] {
  return products.map((product) => {
    const detail = details.get(product.id);
    const group = detail?.group;
    return {
      id: product.id,
      group_id: product.group_id ?? group?.id ?? 0,
      name: product.name,
      spec_label: product.spec_label ?? '',
      category_name: resolveCategoryName(categories, product.category_id),
      cover_image_url: group?.cover_image_url ?? product.cover_image_url ?? '',
      hero_image_url: group?.hero_image_url ?? '',
      group_medias: detail?.group_medias ?? [],
      product_medias: detail?.product_medias ?? [],
      resolved_medias: detail?.resolved_medias ?? [],
    };
  });
}

/**
 * 生成商品组媒体推荐目录。
 * 目录规范需要与 product 服务当前的本地媒体目录约定保持一致。
 */
function buildGroupFolder(groupId: number, usageType: 'cover' | 'hero' | 'gallery'): string {
  return `groups/${groupId}/${usageType}`;
}

/**
 * 生成独立商品媒体推荐目录。
 * 当前独立商品只允许绑定版本差异图库，因此目录固定落到 gallery。
 */
function buildProductFolder(productId: number): string {
  return `products/${productId}/gallery`;
}

/**
 * 将浏览器 File 转为 base64 文本。
 * 当前后台上传接口走 JSON 请求体，因此由前端先完成 base64 编码。
 */
async function readFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

/**
 * 将排序输入收口为安全正整数。
 * 非法值统一回退为 1，避免把脏值直接交给后端。
 */
function normalizeSortOrder(input: string): number {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

/**
 * 将商品组媒体用途统一翻译为后台文案。
 * 运营人员在媒体列表里需要直接看懂当前图片绑定到了哪个展示位。
 */
function resolveUsageLabel(usageType: string): string {
  if (usageType === 'cover') {
    return '封面图';
  }
  if (usageType === 'hero') {
    return 'Hero 图';
  }
  if (usageType === 'gallery') {
    return '详情图库';
  }
  return '未标注';
}

/**
 * 从商品详情快照中构造商品组更新载荷。
 * 媒体页只改图片字段，其他商品组展示信息继续沿用后端真值，避免覆盖旧数据。
 */
function buildGroupUpdatePayload(
  detail: ProductDetailResponse,
  overrides: Partial<{ hero_image_url: string; cover_image_url: string }>,
) {
  return {
    name: detail.group.name,
    slug: detail.group.slug,
    hero_title: detail.group.hero_title,
    hero_subtitle: detail.group.hero_subtitle,
    hero_image_url: overrides.hero_image_url ?? detail.group.hero_image_url,
    category_id: detail.group.category_id,
    status: detail.group.status,
    sort_order: detail.group.sort_order,
    cover_image_url: overrides.cover_image_url ?? detail.group.cover_image_url,
    spec_keys: detail.group.spec_keys ?? [],
  };
}

/**
 * 判断某张商品组媒体是否仍被商品组主数据引用。
 * 删除或切换用途前需要用它决定是否同步清空 Hero 图或封面图字段。
 */
function resolveGroupMediaFieldOverrides(
  row: AdminMediaRow,
  detail: ProductDetailResponse | undefined,
  media: ProductMedia,
  nextUsageType?: string,
): Partial<{ hero_image_url: string; cover_image_url: string }> | null {
  if (!detail?.group.id) {
    return null;
  }

  const overrides: Partial<{ hero_image_url: string; cover_image_url: string }> = {};
  const shouldKeepAsCover = nextUsageType === 'cover';
  const shouldKeepAsHero = nextUsageType === 'hero';

  if (row.cover_image_url === media.image_url && !shouldKeepAsCover) {
    overrides.cover_image_url = '';
  }
  if (row.hero_image_url === media.image_url && !shouldKeepAsHero) {
    overrides.hero_image_url = '';
  }

  if (!Object.keys(overrides).length) {
    return null;
  }
  return overrides;
}

/**
 * 后台图片媒体页。
 * 该页当前承担后台最小媒体闭环：
 * 1. 查看媒体覆盖状态；
 * 2. 上传并绑定图片；
 * 3. 删除已有绑定；
 * 4. 每次操作后回拉后端真值刷新结果。
 */
export function AdminMediaPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [details, setDetails] = useState<Map<number, ProductDetailResponse>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(DEFAULT_UPLOAD_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [removingBindingKey, setRemovingBindingKey] = useState('');
  const [assigningBindingKey, setAssigningBindingKey] = useState('');
  const [savingBindingKey, setSavingBindingKey] = useState('');
  const [bindingSortInputs, setBindingSortInputs] = useState<Record<string, string>>({});

  /**
   * 统一加载后台媒体页所需的类目、商品入口与详情聚合数据。
   * 所有上传、绑定、删除动作结束后都复用这条刷新路径，以后端真值为准。
   */
  async function loadMediaRows() {
    setLoading(true);
    setError('');

    try {
      const [categoryRes, productRes] = await Promise.all([
        fetchCategories(),
        fetchProducts({ page: 1, pageSize: 24 }),
      ]);

      setCategories(categoryRes.items);
      setProducts(productRes.items);

      const detailEntries = await Promise.all(
        productRes.items.map(async (item) => {
          const detail = await fetchProduct(item.id);
          return [item.id, detail] as const;
        }),
      );

      const detailMap = new Map(detailEntries);
      const nextSortInputs: Record<string, string> = {};
      for (const [productID, detail] of detailMap.entries()) {
        for (const media of detail.group_medias ?? []) {
          nextSortInputs[`group-${detail.group.id || detail.product.group_id}-${media.binding_id || media.id}`] = String(media.sort_order || 1);
        }
        for (const media of detail.product_medias ?? []) {
          nextSortInputs[`product-${productID}-${media.binding_id || media.id}`] = String(media.sort_order || 1);
        }
      }
      setDetails(detailMap);
      setBindingSortInputs(nextSortInputs);
      if (!selectedProductId && productRes.items.length > 0) {
        setSelectedProductId(productRes.items[0].id);
      }
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '媒体数据加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMediaRows();
  }, []);

  const rows = useMemo(() => buildMediaRows(products, details, categories), [categories, details, products]);
  const selectedRow = useMemo(
    () => rows.find((item) => item.id === selectedProductId) ?? rows[0] ?? null,
    [rows, selectedProductId],
  );

  const overview = useMemo(() => {
    return {
      total: rows.length,
      coverReady: rows.filter((item) => item.cover_image_url).length,
      heroReady: rows.filter((item) => item.hero_image_url).length,
      richGallery: rows.filter((item) => item.resolved_medias.length >= 3).length,
    };
  }, [rows]);

  /**
   * 处理上传文件变更。
   * 这里只同步本地表单状态，不在选择文件时立即触发上传。
   */
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setUploadForm((current) => ({ ...current, file }));
  }

  /**
   * 提交上传并绑定表单。
   * 当前后台先走最小两段式链路：上传文件 -> 绑定到商品组或独立商品。
   */
  async function handleSubmitMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRow) {
      setError('请先选择一个商品入口后再上传图片');
      setSuccess('');
      return;
    }
    if (!uploadForm.file) {
      setError('请选择需要上传的图片文件');
      setSuccess('');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const contentBase64 = await readFileAsBase64(uploadForm.file);
      const targetScope = uploadForm.target_scope;
      const usageType = targetScope === 'product' ? 'gallery' : uploadForm.usage_type;
      const folder = targetScope === 'group'
        ? buildGroupFolder(selectedRow.group_id, usageType)
        : buildProductFolder(selectedRow.id);
      const uploadRes = await uploadAdminMedia({
        folder,
        file_name: uploadForm.file.name,
        alt_text: uploadForm.alt_text.trim(),
        mime_type: uploadForm.file.type || 'application/octet-stream',
        content_base64: contentBase64,
      });
      const sortOrder = normalizeSortOrder(uploadForm.sort_order);

      if (targetScope === 'group') {
        await bindGroupMedia(selectedRow.group_id, {
          media_id: uploadRes.media.id,
          usage_type: usageType,
          sort_order: sortOrder,
          is_primary: uploadForm.is_primary,
        });
        if (usageType === 'cover' || usageType === 'hero') {
          const detail = details.get(selectedRow.id);
          if (detail?.group.id) {
            await updateAdminProductGroup(
              detail.group.id,
              buildGroupUpdatePayload(
                detail,
                usageType === 'cover'
                  ? { cover_image_url: uploadRes.media.public_url }
                  : { hero_image_url: uploadRes.media.public_url },
              ),
            );
          }
        }
      } else {
        await bindProductMedia(selectedRow.id, {
          media_id: uploadRes.media.id,
          usage_type: 'gallery',
          sort_order: sortOrder,
          is_primary: uploadForm.is_primary,
        });
      }

      setUploadForm(DEFAULT_UPLOAD_FORM);
      setSuccess('媒体上传并绑定成功');
      await loadMediaRows();
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '媒体上传或绑定失败'));
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * 将某张已绑定商品组图片直接设为封面图或 Hero 图。
   * 媒体资源与商品组主数据都在这里同步，避免后台仍需跳到商品组页二次保存。
   */
  async function handleAssignGroupMedia(row: AdminMediaRow, media: ProductMedia, target: 'cover' | 'hero') {
    const detail = details.get(row.id);
    if (!detail?.group.id) {
      setError('当前商品入口缺少商品组信息，暂时无法设置主视觉图片');
      setSuccess('');
      return;
    }

    const bindingKey = `${target}-${row.group_id}-${media.binding_id || media.id}`;
    setAssigningBindingKey(bindingKey);
    setError('');
    setSuccess('');

    try {
      await updateAdminProductGroup(
        detail.group.id,
        buildGroupUpdatePayload(
          detail,
          target === 'cover'
            ? { cover_image_url: media.image_url }
            : { hero_image_url: media.image_url },
        ),
      );
      setSuccess(target === 'cover' ? '商品组封面图已更新' : '商品组 Hero 图已更新');
      await loadMediaRows();
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, target === 'cover' ? '更新封面图失败' : '更新 Hero 图失败'));
    } finally {
      setAssigningBindingKey('');
    }
  }

  /**
   * 更新某条已绑定媒体的排序或主图标记。
   * 当前先提供稳定的表单式编辑，避免在最小实现阶段引入拖拽状态同步复杂度。
   */
  async function handleSaveBinding(
    target: 'group' | 'product',
    row: AdminMediaRow,
    media: ProductMedia,
    overrides?: Partial<{ usage_type: string; is_primary: boolean }>,
  ) {
    const bindingID = media.binding_id || media.id;
    const bindingKey = `${target}-${target === 'group' ? row.group_id : row.id}-${bindingID}`;
    const sortOrder = normalizeSortOrder(bindingSortInputs[bindingKey] ?? String(media.sort_order || 1));
    setSavingBindingKey(bindingKey);
    setError('');
    setSuccess('');

    try {
      if (target === 'group') {
        const detail = details.get(row.id);
        const nextUsageType = overrides?.usage_type ?? media.usage_type;
        await updateGroupMediaBinding(row.group_id, bindingID, {
          usage_type: nextUsageType,
          sort_order: sortOrder,
          is_primary: overrides?.is_primary ?? media.is_primary,
        });
        const groupFieldOverrides = resolveGroupMediaFieldOverrides(row, detail, media, nextUsageType);
        if (detail?.group.id && groupFieldOverrides) {
          await updateAdminProductGroup(detail.group.id, buildGroupUpdatePayload(detail, groupFieldOverrides));
        }
        setSuccess('商品组媒体绑定已更新');
      } else {
        await updateProductMediaBinding(row.id, bindingID, {
          usage_type: 'gallery',
          sort_order: sortOrder,
          is_primary: overrides?.is_primary ?? media.is_primary,
        });
        setSuccess('独立商品媒体绑定已更新');
      }
      await loadMediaRows();
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '更新媒体绑定失败'));
    } finally {
      setSavingBindingKey('');
    }
  }

  /**
   * 删除商品组或独立商品上的一条媒体绑定。
   * 删除完成后重新读取详情接口，确保后台看到的结果与前台最终图库保持一致。
   */
  async function handleDeleteBinding(target: 'group' | 'product', ownerId: number, bindingId: number) {
    const bindingKey = `${target}-${ownerId}-${bindingId}`;
    setRemovingBindingKey(bindingKey);
    setError('');
    setSuccess('');

    try {
      if (target === 'group') {
        const row = rows.find((item) => item.group_id === ownerId);
        const media = row?.group_medias.find((item) => item.binding_id === bindingId);
        await deleteGroupMediaBinding(ownerId, bindingId);
        const detail = row ? details.get(row.id) : undefined;
        if (row && media && detail?.group.id) {
          const groupFieldOverrides = resolveGroupMediaFieldOverrides(row, detail, media);
          if (groupFieldOverrides) {
            await updateAdminProductGroup(detail.group.id, buildGroupUpdatePayload(detail, groupFieldOverrides));
          }
        }
      } else {
        await deleteProductMediaBinding(ownerId, bindingId);
      }
      setSuccess('媒体绑定已删除');
      await loadMediaRows();
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '删除媒体绑定失败'));
    } finally {
      setRemovingBindingKey('');
    }
  }

  return (
    <>
      <section className="admin-hero">
        <div className="admin-hero__copy">
          <p className="admin-hero__eyebrow">图片媒体</p>
          <h1>把上传、绑定与删除操作直接接到真实媒体链路上。</h1>
          <p>
            当前页面会直接读取真实商品详情里的媒体聚合结果，并通过后台接口完成上传、商品组绑定、独立商品绑定与删除绑定操作。
          </p>
        </div>
        <div className="admin-hero__actions">
          <button className="admin-button admin-button--primary" type="button" onClick={() => void loadMediaRows()}>
            刷新媒体
          </button>
          <button className="admin-button admin-button--secondary" type="button" onClick={() => void loadMediaRows()}>
            扫描缺图项
          </button>
        </div>
      </section>

      <section className="admin-overview-grid">
        <article className="admin-stat-card">
          <p>媒体入口</p>
          <strong>{overview.total}</strong>
          <span>当前后台已检查的商品入口数量</span>
        </article>
        <article className="admin-stat-card admin-stat-card--success">
          <p>封面图已就绪</p>
          <strong>{overview.coverReady}</strong>
          <span>已有可供列表陈列使用的封面图</span>
        </article>
        <article className="admin-stat-card admin-stat-card--accent">
          <p>Hero 图已就绪</p>
          <strong>{overview.heroReady}</strong>
          <span>已有商品详情主视觉图</span>
        </article>
        <article className="admin-stat-card admin-stat-card--danger">
          <p>多图详情已完成</p>
          <strong>{overview.richGallery}</strong>
          <span>最终详情页至少可展示 3 张图片</span>
        </article>
      </section>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="admin-panel__eyebrow">上传与绑定</p>
            <h2>媒体操作台</h2>
          </div>
        </div>

        {success ? <div className="status status--success">{success}</div> : null}
        {error && !loading ? <div className="status status--error">{error}</div> : null}

        <div className="admin-media-workbench">
          <div className="admin-media-workbench__selector">
            <label htmlFor="admin-media-product">当前商品入口</label>
            <select
              id="admin-media-product"
              value={selectedRow?.id ?? 0}
              onChange={(event) => setSelectedProductId(Number(event.target.value))}
              disabled={rows.length === 0}
            >
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}{row.spec_label ? ` / ${row.spec_label}` : ''}
                </option>
              ))}
            </select>
            {selectedRow ? (
              <span className="muted">
                商品组 ID：{selectedRow.group_id}，独立商品 ID：{selectedRow.id}
              </span>
            ) : null}
          </div>

          <form className="admin-media-form" onSubmit={handleSubmitMedia}>
            <div className="field">
              <label htmlFor="admin-media-file">图片文件</label>
              <input id="admin-media-file" type="file" accept="image/*" onChange={handleFileChange} />
            </div>

            <div className="field">
              <label htmlFor="admin-media-alt">替代文本</label>
              <input
                id="admin-media-alt"
                type="text"
                value={uploadForm.alt_text}
                onChange={(event) => setUploadForm((current) => ({ ...current, alt_text: event.target.value }))}
                placeholder="例如：MacBook Air 银色主视觉"
              />
            </div>

            <div className="admin-media-form__grid">
              <div className="field">
                <label htmlFor="admin-media-scope">绑定目标</label>
                <select
                  id="admin-media-scope"
                  value={uploadForm.target_scope}
                  onChange={(event) => {
                    const nextScope = event.target.value as 'group' | 'product';
                    setUploadForm((current) => ({
                      ...current,
                      target_scope: nextScope,
                      usage_type: nextScope === 'product' ? 'gallery' : current.usage_type,
                    }));
                  }}
                >
                  <option value="group">商品组</option>
                  <option value="product">独立商品</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="admin-media-usage">用途</label>
                <select
                  id="admin-media-usage"
                  value={uploadForm.target_scope === 'product' ? 'gallery' : uploadForm.usage_type}
                  onChange={(event) => setUploadForm((current) => ({
                    ...current,
                    usage_type: event.target.value as 'cover' | 'hero' | 'gallery',
                  }))}
                  disabled={uploadForm.target_scope === 'product'}
                >
                  <option value="gallery">图库</option>
                  <option value="cover">封面图</option>
                  <option value="hero">Hero 图</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="admin-media-sort">排序</label>
                <input
                  id="admin-media-sort"
                  type="number"
                  min="1"
                  value={uploadForm.sort_order}
                  onChange={(event) => setUploadForm((current) => ({ ...current, sort_order: event.target.value }))}
                />
              </div>
            </div>

            <label className="admin-media-form__checkbox">
              <input
                type="checkbox"
                checked={uploadForm.is_primary}
                onChange={(event) => setUploadForm((current) => ({ ...current, is_primary: event.target.checked }))}
              />
              <span>设为主图</span>
            </label>

            <div className="admin-media-form__actions">
              <button className="admin-button admin-button--primary" type="submit" disabled={submitting || !selectedRow}>
                {submitting ? '上传处理中...' : '上传并绑定'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <p className="admin-panel__eyebrow">图片覆盖情况</p>
            <h2>媒体总览</h2>
          </div>
        </div>

        {loading ? <div className="loading">正在加载媒体数据...</div> : null}
        {!loading && !error ? (
          <div className="admin-media-grid">
            {rows.map((row) => (
              <article key={row.id} className="admin-media-card">
                <div className="admin-media-card__header">
                  <div>
                    <p>{row.category_name}</p>
                    <h3>{row.name}</h3>
                    <span>{row.spec_label || '默认版本入口'}</span>
                  </div>
                  <div className="admin-media-card__badges">
                    <span className={`admin-badge${row.cover_image_url ? ' admin-badge--success' : ' admin-badge--danger'}`}>
                      {row.cover_image_url ? '封面图' : '缺封面'}
                    </span>
                    <span className={`admin-badge${row.hero_image_url ? ' admin-badge--accent' : ' admin-badge--warning'}`}>
                      {row.hero_image_url ? 'Hero 图' : '缺 Hero'}
                    </span>
                  </div>
                </div>

                <div className="admin-media-card__preview">
                  <div
                    className={`admin-media-card__hero${row.cover_image_url ? ' admin-media-card__hero--photo' : ''}`}
                    style={row.cover_image_url ? { backgroundImage: `url(${row.cover_image_url})` } : undefined}
                    aria-hidden="true"
                  />
                </div>

                <div className="admin-media-card__metrics">
                  <div>
                    <strong>{row.group_medias.length}</strong>
                    <span>商品组公共图</span>
                  </div>
                  <div>
                    <strong>{row.product_medias.length}</strong>
                    <span>版本专属图</span>
                  </div>
                  <div>
                    <strong>{row.resolved_medias.length}</strong>
                    <span>最终详情图</span>
                  </div>
                </div>

                <div className="admin-media-strip">
                  {row.resolved_medias.slice(0, 5).map((media, index) => (
                    <div
                      key={`${media.id}-${index}`}
                      className={`admin-media-strip__item${media.image_url ? ' admin-media-strip__item--photo' : ''}`}
                      style={media.image_url ? { backgroundImage: `url(${media.image_url})` } : undefined}
                      title={media.alt_text || row.name}
                      aria-hidden="true"
                    />
                  ))}
                  {row.resolved_medias.length === 0 ? <span className="admin-media-strip__empty">暂无详情图</span> : null}
                </div>

                <div className="admin-media-binding-section">
                  <div className="admin-media-binding-section__group">
                    <div className="admin-media-binding-section__title">
                      <strong>商品组绑定</strong>
                      <span>{row.group_medias.length} 张</span>
                    </div>
                    {row.group_medias.length > 0 ? (
                      row.group_medias.map((media) => (
                        <div key={`group-${row.group_id}-${media.binding_id}-${media.id}`} className="admin-media-binding-item">
                          <div
                            className={`admin-media-binding-item__thumb${media.image_url ? ' admin-media-binding-item__thumb--photo' : ''}`}
                            style={media.image_url ? { backgroundImage: `url(${media.image_url})` } : undefined}
                            aria-hidden="true"
                          />
                          <div className="admin-media-binding-item__copy">
                            <strong>{media.alt_text || row.name}</strong>
                            <span>绑定 ID：{media.binding_id || '-'}</span>
                            <span>
                              用途：{resolveUsageLabel(media.usage_type)} / 排序：{media.sort_order}{media.is_primary ? ' / 主图' : ''}
                            </span>
                            <span>
                              {row.cover_image_url === media.image_url ? '当前封面图' : '未作为封面图'}
                              {' / '}
                              {row.hero_image_url === media.image_url ? '当前 Hero 图' : '未作为 Hero 图'}
                            </span>
                          </div>
                          <div className="admin-media-binding-item__actions">
                            <label className="admin-media-binding-item__sort">
                              <span>排序</span>
                              <input
                                type="number"
                                min="1"
                                value={bindingSortInputs[`group-${row.group_id}-${media.binding_id || media.id}`] ?? String(media.sort_order || 1)}
                                onChange={(event) => setBindingSortInputs((current) => ({
                                  ...current,
                                  [`group-${row.group_id}-${media.binding_id || media.id}`]: event.target.value,
                                }))}
                              />
                            </label>
                            <button
                              className="admin-button admin-button--secondary"
                              type="button"
                              disabled={savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}` && media.is_primary}
                              onClick={() => void handleSaveBinding('group', row, media, { is_primary: true })}
                            >
                              {savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}` ? '保存中...' : '设为主图'}
                            </button>
                            <button
                              className="admin-button admin-button--ghost"
                              type="button"
                              disabled={savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}`}
                              onClick={() => void handleSaveBinding('group', row, media)}
                            >
                              {savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}` ? '保存中...' : '保存排序'}
                            </button>
                            <button
                              className="admin-button admin-button--ghost"
                              type="button"
                              disabled={savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}` || media.usage_type === 'gallery'}
                              onClick={() => void handleSaveBinding('group', row, media, { usage_type: 'gallery' })}
                            >
                              {savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}` ? '保存中...' : '切到图库'}
                            </button>
                            <button
                              className="admin-button admin-button--ghost"
                              type="button"
                              disabled={savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}` || media.usage_type === 'cover'}
                              onClick={() => void handleSaveBinding('group', row, media, { usage_type: 'cover' })}
                            >
                              {savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}` ? '保存中...' : '切到封面'}
                            </button>
                            <button
                              className="admin-button admin-button--ghost"
                              type="button"
                              disabled={savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}` || media.usage_type === 'hero'}
                              onClick={() => void handleSaveBinding('group', row, media, { usage_type: 'hero' })}
                            >
                              {savingBindingKey === `group-${row.group_id}-${media.binding_id || media.id}` ? '保存中...' : '切到 Hero'}
                            </button>
                            <button
                              className="admin-button admin-button--secondary"
                              type="button"
                              disabled={row.cover_image_url === media.image_url || assigningBindingKey === `cover-${row.group_id}-${media.binding_id || media.id}`}
                              onClick={() => void handleAssignGroupMedia(row, media, 'cover')}
                            >
                              {assigningBindingKey === `cover-${row.group_id}-${media.binding_id || media.id}` ? '设置中...' : '设为封面图'}
                            </button>
                            <button
                              className="admin-button admin-button--secondary"
                              type="button"
                              disabled={row.hero_image_url === media.image_url || assigningBindingKey === `hero-${row.group_id}-${media.binding_id || media.id}`}
                              onClick={() => void handleAssignGroupMedia(row, media, 'hero')}
                            >
                              {assigningBindingKey === `hero-${row.group_id}-${media.binding_id || media.id}` ? '设置中...' : '设为 Hero 图'}
                            </button>
                            <button
                              className="admin-button admin-button--ghost"
                              type="button"
                              disabled={!media.binding_id || removingBindingKey === `group-${row.group_id}-${media.binding_id}`}
                              onClick={() => void handleDeleteBinding('group', row.group_id, media.binding_id)}
                            >
                              {removingBindingKey === `group-${row.group_id}-${media.binding_id}` ? '删除中...' : '删除绑定'}
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="notice notice--placeholder">当前商品组还没有已绑定的后台媒体。</div>
                    )}
                  </div>

                  <div className="admin-media-binding-section__group">
                    <div className="admin-media-binding-section__title">
                      <strong>独立商品绑定</strong>
                      <span>{row.product_medias.length} 张</span>
                    </div>
                    {row.product_medias.length > 0 ? (
                      row.product_medias.map((media) => (
                        <div key={`product-${row.id}-${media.binding_id}-${media.id}`} className="admin-media-binding-item">
                          <div
                            className={`admin-media-binding-item__thumb${media.image_url ? ' admin-media-binding-item__thumb--photo' : ''}`}
                            style={media.image_url ? { backgroundImage: `url(${media.image_url})` } : undefined}
                            aria-hidden="true"
                          />
                          <div className="admin-media-binding-item__copy">
                            <strong>{media.alt_text || row.name}</strong>
                            <span>绑定 ID：{media.binding_id || '-'}</span>
                            <span>用途：{resolveUsageLabel(media.usage_type)} / 排序：{media.sort_order}{media.is_primary ? ' / 主图' : ''}</span>
                          </div>
                          <div className="admin-media-binding-item__actions">
                            <label className="admin-media-binding-item__sort">
                              <span>排序</span>
                              <input
                                type="number"
                                min="1"
                                value={bindingSortInputs[`product-${row.id}-${media.binding_id || media.id}`] ?? String(media.sort_order || 1)}
                                onChange={(event) => setBindingSortInputs((current) => ({
                                  ...current,
                                  [`product-${row.id}-${media.binding_id || media.id}`]: event.target.value,
                                }))}
                              />
                            </label>
                            <button
                              className="admin-button admin-button--secondary"
                              type="button"
                              disabled={savingBindingKey === `product-${row.id}-${media.binding_id || media.id}` && media.is_primary}
                              onClick={() => void handleSaveBinding('product', row, media, { is_primary: true })}
                            >
                              {savingBindingKey === `product-${row.id}-${media.binding_id || media.id}` ? '保存中...' : '设为主图'}
                            </button>
                            <button
                              className="admin-button admin-button--ghost"
                              type="button"
                              disabled={savingBindingKey === `product-${row.id}-${media.binding_id || media.id}`}
                              onClick={() => void handleSaveBinding('product', row, media)}
                            >
                              {savingBindingKey === `product-${row.id}-${media.binding_id || media.id}` ? '保存中...' : '保存排序'}
                            </button>
                            <button
                              className="admin-button admin-button--ghost"
                              type="button"
                              disabled={!media.binding_id || removingBindingKey === `product-${row.id}-${media.binding_id}`}
                              onClick={() => void handleDeleteBinding('product', row.id, media.binding_id)}
                            >
                              {removingBindingKey === `product-${row.id}-${media.binding_id}` ? '删除中...' : '删除绑定'}
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="notice notice--placeholder">当前独立商品还没有已绑定的专属媒体。</div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
