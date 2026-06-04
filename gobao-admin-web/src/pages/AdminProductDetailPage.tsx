import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  bindGroupMedia,
  createAdminProduct,
  deleteGroupMediaBinding,
  deleteAdminProductGroup,
  fetchCategories,
  fetchProduct,
  fetchProducts,
  fetchProductGroups,
  updateGroupMediaBinding,
  updateAdminProduct,
  updateAdminProductGroup,
  uploadAdminMedia,
} from '../api/catalog';
import {
  buildProductCardPreview,
  deriveSpecKeysFromVariants,
  resolveDefaultVariant,
  type ProductCardPreviewState,
} from '../lib/adminProductGroupDetail';
import { AdminToast } from '../components/AdminToast';
import { AdminUnsavedNotice } from '../components/AdminUnsavedNotice';
import { productVariantPath, productsPath } from '../lib/adminRoutes';
import { buildAdminToast, resolveApiErrorMessage, type AdminToastState } from '../lib/errors';
import { formatPrice } from '../lib/format';
import type { Category, ProductDetailResponse, ProductGroup, ProductMedia, ProductVariant } from '../lib/types.ts';

interface ProductCardEditorFormState {
  title: string;
  cover_image_url: string;
}

interface ProductDetailEditorFormState {
  slug: string;
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string;
  category_id: string;
  status: string;
  sort_order: string;
}

interface UploadFormState {
  file: File | null;
  alt_text: string;
  sort_order: string;
}

interface GroupVariantRow extends ProductVariant {
  category_name: string;
  status_label: string;
}

const DEFAULT_PRODUCT_CARD_FORM: ProductCardEditorFormState = {
  title: '',
  cover_image_url: '',
};

const DEFAULT_DETAIL_EDITOR_FORM: ProductDetailEditorFormState = {
  slug: '',
  hero_title: '',
  hero_subtitle: '',
  hero_image_url: '',
  category_id: '',
  status: '1',
  sort_order: '1',
};

const DEFAULT_UPLOAD_FORM: UploadFormState = {
  file: null,
  alt_text: '',
  sort_order: '1',
};

/**
 * 后台商品组状态文案统一收口。
 * 商品组页只需要展示启用与停用两种状态，未知值继续保留兜底文案。
 */
function resolveStatusLabel(status: number): string {
  if (status === 1) {
    return '启用';
  }
  if (status === 2) {
    return '停用';
  }
  return '未知';
}

/**
 * 将类目编号转换为类目名称。
 * 后台二级页直接展示可读类目，避免运营在组页里对内部编号做人工映射。
 */
function resolveCategoryName(categories: Category[], categoryId: number): string {
  if (categoryId <= 0) {
    return '暂无类目';
  }
  return categories.find((item) => item.id === categoryId)?.name ?? `类目 ${categoryId}`;
}

/**
 * 将商品组真值写入表单。
 * 商品组页的编辑表单始终以后端详情接口返回值为准，避免局部状态漂移。
 */
function buildProductCardEditorForm(detail: ProductDetailResponse): ProductCardEditorFormState {
  return {
    title: detail.product.name || detail.group.name,
    cover_image_url: detail.group.cover_image_url || detail.product.image_url,
  };
}

/**
 * 将商品组真值写入详情页编辑表单。
 * 商品组的详情头图、标题、状态和排序由二级页统一维护，不再和列表卡片字段混放。
 */
function buildProductDetailEditorForm(group: ProductGroup): ProductDetailEditorFormState {
  return {
    slug: group.slug,
    hero_title: group.hero_title,
    hero_subtitle: group.hero_subtitle,
    hero_image_url: group.hero_image_url,
    category_id: String(group.category_id || ''),
    status: String(group.status || 1),
    sort_order: String(group.sort_order || 1),
  };
}

/**
 * 将字符串输入收口为整数。
 * 非法值统一回退为 0，最终业务校验继续交由后端兜底。
 */
function parseInteger(input: string): number {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

/**
 * 商品组媒体用途映射为「显示位置」文案。
 * 直接用图片最终呈现的位置命名，让运营一眼看出每张图会显示在哪里。
 */
function resolveMediaUsageLabel(usageType: string): string {
  if (usageType === 'cover') {
    return '商品列表封面';
  }
  if (usageType === 'hero') {
    return '详情页顶部大图';
  }
  if (usageType === 'gallery') {
    return '详情页图集';
  }
  return '未指定显示位置';
}

/**
 * 将商品组图片候选项整理成选择器标签。
 * 这里直接带出用途、排序和主图标记，减少运营误选图片的概率。
 */
function buildGroupMediaOptionLabel(media: ProductMedia, index: number): string {
  const title = media.alt_text?.trim() || `图片 ${index + 1}`;
  const usageLabel = resolveMediaUsageLabel(media.usage_type);
  const primaryLabel = media.is_primary ? ' / 主图' : '';
  return `${title}（${usageLabel} / 排序 ${media.sort_order}${primaryLabel}）`;
}

/**
 * 商品组图片目录沿用 Product 服务当前约定。
 * 后台上传直接落到组目录下，保证与现有图片服务结构一致。
 */
function buildGroupFolder(groupId: number): string {
  return `groups/${groupId}/library`;
}

/**
 * 将浏览器选择的图片编码为 base64 文本。
 * 后台上传接口当前仍然走 JSON 请求体，因此前端保留最小编码转换。
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
 * 排序输入统一收口为正整数。
 * 非法值统一回退为 1，减少后台误填造成的排序异常。
 */
function normalizeSortOrder(input: string): number {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

/**
 * 从商品详情快照中构造商品组更新载荷。
 * 图片区更新只改图片引用字段，其他商品组元信息继续沿用后端真值。
 */
function buildGroupUpdatePayload(
  cardForm: ProductCardEditorFormState,
  detailForm: ProductDetailEditorFormState,
  specKeys: string[],
) {
  return {
    name: cardForm.title.trim(),
    slug: detailForm.slug.trim(),
    hero_title: detailForm.hero_title.trim(),
    hero_subtitle: detailForm.hero_subtitle.trim(),
    hero_image_url: detailForm.hero_image_url.trim(),
    category_id: parseInteger(detailForm.category_id),
    status: parseInteger(detailForm.status),
    sort_order: parseInteger(detailForm.sort_order),
    cover_image_url: cardForm.cover_image_url.trim(),
    // 仅保留修剪后非空的维度名，避免空白维度污染子商品的规格录入。
    spec_keys: specKeys.map((key) => key.trim()).filter((key) => key.length > 0),
  };
}

/**
 * 若图片用途调整后不再承载封面或主视觉，需要同步清空商品组主数据引用。
 * 这样可以避免前台仍然指向一张已经切用途或删除绑定的图片。
 */
function resolveGroupMediaFieldOverrides(
  detail: ProductDetailResponse | null,
  media: ProductMedia,
): Partial<{ hero_image_url: string; cover_image_url: string }> | null {
  if (!detail?.group.id) {
    return null;
  }

  const overrides: Partial<{ hero_image_url: string; cover_image_url: string }> = {};

  if (detail.group.cover_image_url === media.image_url) {
    overrides.cover_image_url = '';
  }
  if (detail.group.hero_image_url === media.image_url) {
    overrides.hero_image_url = '';
  }

  return Object.keys(overrides).length > 0 ? overrides : null;
}

/**
 * 根据图片 URL 反查当前商品组已绑定媒体。
 * 商品组表单继续以 URL 为真值，这里只负责恢复预览对象。
 */
function findGroupMediaByURL(items: ProductMedia[], imageURL: string): ProductMedia | null {
  const target = imageURL.trim();
  if (!target) {
    return null;
  }
  return items.find((item) => item.image_url === target) ?? null;
}

/**
 * 汇总图片卡片顶部状态标签。
 * 把当前封面、当前主视觉和主图标记前置到看图层，减少运营来回对照表单。
 */
function buildMediaHighlights(
  media: ProductMedia,
  options: {
    isCurrentCover?: boolean;
    isCurrentHero?: boolean;
  },
): string[] {
  const labels: string[] = [];

  if (options.isCurrentCover) {
    labels.push('正用作·商品列表封面');
  }
  if (options.isCurrentHero) {
    labels.push('正用作·详情页顶部大图');
  }
  if (media.is_primary) {
    labels.push('已标记主图');
  }

  labels.push(resolveMediaUsageLabel(media.usage_type));
  return labels;
}

/**
 * 为当前没有挂接商品版本的商品组构造空态详情。
 * 这样二级页仍可继续编辑商品组信息与公共图片，不会因为缺少子商品而整页报错。
 */
function buildEmptyGroupDetail(group: ProductGroup): ProductDetailResponse {
  return {
    product: {
      id: 0,
      name: group.name,
      description: '',
      price: 0,
      category_id: group.category_id,
      image_url: '',
      status: group.status,
      stock_quantity: 0,
      stock_version: 0,
      group_id: group.id,
      spec_label: '',
      spec_values_json: '{}',
      sort_order: group.sort_order,
      created_at: 0,
      updated_at: 0,
    },
    group,
    variants: [],
    default_product_id: 0,
    group_medias: [],
    product_medias: [],
    resolved_medias: [],
  };
}

/**
 * 后台商品组二级页。
 * 当前页面只维护商品组展示信息、商品组图片与版本入口，子商品详细编辑全部下沉到三级页。
 */
export function AdminProductDetailPage() {
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<ProductDetailResponse | null>(null);
  const [cardForm, setCardForm] = useState<ProductCardEditorFormState>(DEFAULT_PRODUCT_CARD_FORM);
  const [detailForm, setDetailForm] = useState<ProductDetailEditorFormState>(DEFAULT_DETAIL_EDITOR_FORM);
  const [specKeys, setSpecKeys] = useState<string[]>([]);
  const [savingPage, setSavingPage] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(DEFAULT_UPLOAD_FORM);
  const [submittingMedia, setSubmittingMedia] = useState(false);
  const [removingBindingKey, setRemovingBindingKey] = useState('');
  const [assigningBindingKey, setAssigningBindingKey] = useState('');
  const [savingBindingKey, setSavingBindingKey] = useState('');
  const [toast, setToast] = useState<AdminToastState | null>(null);
  const parsedGroupId = Number.parseInt(groupId ?? '', 10);

  /**
   * 在不重新请求整页数据的前提下局部覆盖当前详情快照。
   * 图片用途切换、调序和删除后只更新受影响字段，避免编辑器整页闪动。
   */
  function patchSelectedDetail(
    updater: (detail: ProductDetailResponse) => ProductDetailResponse,
  ) {
    setSelectedDetail((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
  }

  /**
   * 通过商品组列表先定位目标组，再反查同组商品入口恢复详情真值。
   * 当前网关没有独立商品组详情接口，且商品组列表也不返回默认商品 ID，因此二级页需要自己按 group_id 反查一个代表商品。
   */
  async function loadGroupDetail(preferredGroupId?: number | null) {
    const targetGroupId = preferredGroupId ?? parsedGroupId;
    if (Number.isNaN(targetGroupId) || targetGroupId <= 0) {
      setError('商品组编号无效，无法进入编辑页');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [categoryRes, groupRes, productRes] = await Promise.all([
        fetchCategories(),
        fetchProductGroups({ page: 1, pageSize: 200 }),
        fetchProducts({ page: 1, pageSize: 200 }),
      ]);
      const targetGroup = groupRes.items.find((item) => item.id === targetGroupId) ?? null;
      if (!targetGroup) {
        throw new Error('当前商品组不存在，暂时无法加载商品组详情');
      }

      const entryProduct =
        productRes.items.find((item) => (item.group_id && item.group_id > 0 ? item.group_id : item.id) === targetGroupId) ?? null;
      const detail = entryProduct ? await fetchProduct(entryProduct.id) : buildEmptyGroupDetail(targetGroup);
      setCategories(categoryRes.items);
      setSelectedDetail(detail);
      setCardForm(buildProductCardEditorForm(detail));
      setDetailForm(buildProductDetailEditorForm(detail.group));
      setSpecKeys((detail.group.spec_keys?.length ?? 0) > 0 ? detail.group.spec_keys : deriveSpecKeysFromVariants(detail.variants));
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '商品组详情加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGroupDetail();
  }, [parsedGroupId]);

  const variantRows = useMemo(() => {
    if (!selectedDetail) {
      return [] as GroupVariantRow[];
    }

    return selectedDetail.variants.map((variant) => ({
      ...variant,
      category_name: resolveCategoryName(categories, variant.category_id || selectedDetail.product.category_id),
      status_label: resolveStatusLabel(variant.status),
    }));
  }, [categories, selectedDetail]);
  const productCardPreview = useMemo<ProductCardPreviewState>(() => {
    const fallbackCategoryId = selectedDetail?.group.category_id ?? selectedDetail?.product.category_id ?? 0;
    // 一个商品组在前台只展示一张卡片，因此这里只取默认版本构造单张代表预览。
    const defaultVariant = resolveDefaultVariant(
      selectedDetail?.variants ?? [],
      selectedDetail?.default_product_id ?? 0,
    );
    return buildProductCardPreview({
      title: cardForm.title,
      coverImageUrl: cardForm.cover_image_url,
      fallbackCategoryId,
      defaultVariant,
      categories,
    });
  }, [cardForm, categories, selectedDetail]);

  const selectedGroupMedias = useMemo(() => {
    return selectedDetail?.group_medias ?? [];
  }, [selectedDetail]);
  const selectedHeroMedia = useMemo(
    () => findGroupMediaByURL(selectedGroupMedias, detailForm.hero_image_url),
    [detailForm.hero_image_url, selectedGroupMedias],
  );
  const selectedCoverMedia = useMemo(
    () => findGroupMediaByURL(selectedGroupMedias, cardForm.cover_image_url),
    [cardForm.cover_image_url, selectedGroupMedias],
  );

  const overview = useMemo(() => {
    return {
      variantCount: variantRows.length,
      onSaleCount: variantRows.filter((item) => item.status === 1).length,
      totalMedia: selectedDetail?.group_medias.length ?? 0,
      lowStockCount: variantRows.filter((item) => item.stock_quantity > 0 && item.stock_quantity <= 10).length,
    };
  }, [selectedDetail, variantRows]);

  /**
   * 只要当前表单与后端快照不一致，就视为仍有未保存改动。
   * 右下角固定提示只服务于当前商品组页自己的草稿状态。
   */
  const hasUnsavedChanges = useMemo(() => {
    if (!selectedDetail) {
      return false;
    }

    const sourceCardForm = buildProductCardEditorForm(selectedDetail);
    const sourceDetailForm = buildProductDetailEditorForm(selectedDetail.group);
    const sourceSpecKeys = selectedDetail.group.spec_keys ?? [];
    const sourceMediaOrder = selectedDetail.group_medias.map((item) => item.binding_id || item.id);
    const currentMediaOrder = selectedGroupMedias.map((item) => item.binding_id || item.id);

    return (
      cardForm.title !== sourceCardForm.title ||
      cardForm.cover_image_url !== sourceCardForm.cover_image_url ||
      detailForm.slug !== sourceDetailForm.slug ||
      detailForm.hero_title !== sourceDetailForm.hero_title ||
      detailForm.hero_subtitle !== sourceDetailForm.hero_subtitle ||
      detailForm.hero_image_url !== sourceDetailForm.hero_image_url ||
      detailForm.category_id !== sourceDetailForm.category_id ||
      detailForm.status !== sourceDetailForm.status ||
      detailForm.sort_order !== sourceDetailForm.sort_order ||
      specKeys.join('|') !== sourceSpecKeys.join('|') ||
      currentMediaOrder.join('|') !== sourceMediaOrder.join('|')
    );
  }, [cardForm, detailForm, selectedDetail, selectedGroupMedias, specKeys]);

  /**
   * 切换到新建商品组模式。
   * 若需要新开一个系列，可直接在商品组二级页先创建新组，再回到列表挂接入口。
   */
  function handleCardChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setCardForm((current) => ({ ...current, [name]: value }));
  }

  /**
   * 详情页表单统一按字段名更新。
   * 详情头图、标题、副标题和状态都通过这一层提交到商品组主数据。
   */
  function handleDetailChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setDetailForm((current) => ({ ...current, [name]: value }));
  }

  /**
   * 重命名某个规格维度名称。
   * 维度由商品组定义，子商品只能在这些维度上填值，因此维度名在组页统一维护。
   */
  function handleSpecKeyChange(index: number, value: string) {
    setSpecKeys((current) => current.map((key, position) => (position === index ? value : key)));
  }

  /**
   * 追加一个空白规格维度。
   */
  function handleAddSpecKey() {
    setSpecKeys((current) => [...current, '']);
  }

  /**
   * 删除指定规格维度。
   */
  function handleRemoveSpecKey(index: number) {
    setSpecKeys((current) => current.filter((_, position) => position !== index));
  }

  /**
   * 处理商品组图片文件选择。
   * 选择文件仅同步本地状态，避免误触发上传写操作。
   */
  function handleMediaFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setUploadForm((current) => ({ ...current, file }));
  }

  /**
   * 一次性保存当前二级页的全部改动。
   * 本页只负责商品组主数据与公共图片顺序；版本的价格、规格、库存属于交易真值，
   * 一律交给三级版本页维护，这里不再用卡片数据回写已有版本，避免覆盖版本售价。
   */
  async function handleSubmitPage() {
    if (!selectedDetail?.group.id) {
      setError('当前商品组信息不完整，暂时无法保存当前页面');
      setSuccess('');
      setToast(buildAdminToast('error', '当前商品组信息不完整，暂时无法保存当前页面'));
      return;
    }

    const hasVariant = selectedDetail.variants.length > 0;
    setSavingPage(true);
    setError('');
    setSuccess('');

    try {
      await updateAdminProductGroup(selectedDetail.group.id, buildGroupUpdatePayload(cardForm, detailForm, specKeys));

      await Promise.all(
        selectedDetail.group_medias.map((item, index) =>
          updateGroupMediaBinding(selectedDetail.group.id, item.binding_id || item.id, {
            usage_type: 'gallery',
            sort_order: index + 1,
            is_primary: item.is_primary,
          }),
        ),
      );

      // 仅当商品组下还没有任何版本时，补建一个最小草稿版本作为占位，
      // 价格、规格等交易字段留空给后续在三级版本页填写。
      if (!hasVariant) {
        const fallbackCategoryId =
          parseInteger(detailForm.category_id) ||
          selectedDetail.group.category_id ||
          selectedDetail.product.category_id ||
          categories[0]?.id ||
          1;
        await createAdminProduct({
          name: cardForm.title.trim() || selectedDetail.group.name || '未命名商品组',
          description: '',
          price: 0,
          category_id: fallbackCategoryId,
          image_url: cardForm.cover_image_url.trim() || '',
          group_id: selectedDetail.group.id,
          spec_label: '默认版本',
          spec_values_json: '{}',
          sort_order: 1,
          status: 2,
          initial_stock: 0,
        });
      }

      setToast(buildAdminToast('success', hasVariant ? '当前商品组页面改动已保存' : '当前商品组页面改动已保存，并已补齐默认子商品草稿'));
      await loadGroupDetail(selectedDetail.group.id);
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '保存当前商品组页面失败')));
      setError(resolveApiErrorMessage(cause, '保存当前商品组页面失败'));
    } finally {
      setSavingPage(false);
    }
  }

  /**
   * 删除当前商品组。
   * 删除成功后返回商品列表，若组下仍有关联商品，后端会继续阻止该操作。
   */
  async function handleDeleteSelectedGroup() {
    if (!selectedDetail?.group.id) {
      return;
    }

    const confirmed = window.confirm('确认删除当前商品组吗？若组下仍有关联商品，后端会阻止删除。');
    if (!confirmed) {
      return;
    }

    setDeletingGroup(true);
    setError('');
    setSuccess('');

    try {
      await deleteAdminProductGroup(selectedDetail.group.id);
      navigate('/products', { replace: true });
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '删除商品组失败')));
      setError(resolveApiErrorMessage(cause, '删除商品组失败'));
    } finally {
      setDeletingGroup(false);
    }
  }

  /**
   * 上传并绑定商品组图片。
   * 当前二级页只处理商品组公共图片，版本专属图片移交到三级子商品页维护。
   */
  async function handleSubmitMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDetail?.group.id) {
      setError('请先加载商品组后再上传图片');
      setSuccess('');
      setToast(buildAdminToast('error', '请先加载商品组后再上传图片'));
      return;
    }
    if (!uploadForm.file) {
      setError('请选择需要上传的图片文件');
      setSuccess('');
      setToast(buildAdminToast('error', '请选择需要上传的图片文件'));
      return;
    }

    setSubmittingMedia(true);
    setError('');
    setSuccess('');

    try {
      const contentBase64 = await readFileAsBase64(uploadForm.file);
      const uploadRes = await uploadAdminMedia({
        folder: buildGroupFolder(selectedDetail.group.id),
        file_name: uploadForm.file.name,
        alt_text: uploadForm.alt_text.trim(),
        mime_type: uploadForm.file.type || 'application/octet-stream',
        content_base64: contentBase64,
      });
      const sortOrder = normalizeSortOrder(uploadForm.sort_order);

      await bindGroupMedia(selectedDetail.group.id, {
        media_id: uploadRes.media.id,
        usage_type: 'gallery',
        sort_order: sortOrder,
        is_primary: false,
      });

      setUploadForm(DEFAULT_UPLOAD_FORM);
      setToast(buildAdminToast('success', '商品组图片已上传到当前图片库'));
      await loadGroupDetail(selectedDetail.group.id);
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '商品组图片上传或绑定失败')));
      setError(resolveApiErrorMessage(cause, '商品组图片上传或绑定失败'));
    } finally {
      setSubmittingMedia(false);
    }
  }

  /**
   * 将某张商品组图片设为封面图或主视觉图。
   * 二级页负责商品组页面展示元信息，因此在这里同步维护组主数据最清晰。
   */
  async function handleAssignGroupMedia(media: ProductMedia, target: 'cover' | 'hero') {
    if (!selectedDetail?.group.id) {
      setError('当前商品组信息不完整，暂时无法指定图片显示位置');
      setSuccess('');
      setToast(buildAdminToast('error', '当前商品组信息不完整，暂时无法指定图片显示位置'));
      return;
    }

    const bindingKey = `${target}-${selectedDetail.group.id}-${media.binding_id || media.id}`;
    setAssigningBindingKey(bindingKey);
    setError('');
    setSuccess('');

    try {
      await updateAdminProductGroup(
        selectedDetail.group.id,
        buildGroupUpdatePayload(
          target === 'cover'
            ? { ...cardForm, cover_image_url: media.image_url }
            : cardForm,
          target === 'hero'
            ? { ...detailForm, hero_image_url: media.image_url }
            : detailForm,
          specKeys,
        ),
      );
      if (target === 'cover') {
        setCardForm((current) => ({ ...current, cover_image_url: media.image_url }));
        patchSelectedDetail((detail) => ({
          ...detail,
          group: {
            ...detail.group,
            cover_image_url: media.image_url,
          },
        }));
      } else {
        setDetailForm((current) => ({ ...current, hero_image_url: media.image_url }));
        patchSelectedDetail((detail) => ({
          ...detail,
          group: {
            ...detail.group,
            hero_image_url: media.image_url,
          },
        }));
      }
      setToast(buildAdminToast('success', target === 'cover' ? '商品列表封面已更新' : '详情页顶部大图已更新'));
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, target === 'cover' ? '更新商品列表封面失败' : '更新详情页顶部大图失败')));
      setError(resolveApiErrorMessage(cause, target === 'cover' ? '更新商品列表封面失败' : '更新详情页顶部大图失败'));
    } finally {
      setAssigningBindingKey('');
    }
  }

  /**
   * 将图片在当前顺序中左右移动一位。
   * 这里只更新本地编辑态，真正写回后端统一交给页面底部总保存按钮。
   */
  function handleMoveMedia(mediaID: number, direction: 'left' | 'right') {
    if (!selectedDetail?.group.id) {
      return;
    }

    const currentItems = [...selectedDetail.group_medias];
    const currentIndex = currentItems.findIndex((item) => (item.binding_id || item.id) === mediaID);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentItems.length) {
      return;
    }

    const [currentMedia] = currentItems.splice(currentIndex, 1);
    currentItems.splice(targetIndex, 0, currentMedia);
    patchSelectedDetail((detail) => ({
      ...detail,
      group_medias: currentItems.map((item, index) => ({
        ...item,
        sort_order: index + 1,
      })),
    }));
    setToast(buildAdminToast('warning', '图片顺序已调整，等待保存当前页面后生效'));
    setSuccess('图片顺序已调整，等待保存当前页面后生效');
  }

  /**
   * 删除一条商品组图片绑定。
   * 删除后重新读取商品组详情，确保二级页与前台最终可见图片保持一致。
   */
  async function handleDeleteBinding(bindingId: number) {
    if (!selectedDetail?.group.id) {
      return;
    }

    const bindingKey = `group-${selectedDetail.group.id}-${bindingId}`;
    setRemovingBindingKey(bindingKey);
    setError('');
    setSuccess('');

    try {
      const media = selectedDetail.group_medias.find((item) => item.binding_id === bindingId) ?? null;
      await deleteGroupMediaBinding(selectedDetail.group.id, bindingId);
      if (media) {
        const groupFieldOverrides = resolveGroupMediaFieldOverrides(selectedDetail, media);
        if (groupFieldOverrides) {
          await updateAdminProductGroup(
            selectedDetail.group.id,
            buildGroupUpdatePayload(
              groupFieldOverrides.cover_image_url !== undefined
                ? { ...cardForm, cover_image_url: groupFieldOverrides.cover_image_url }
                : cardForm,
              groupFieldOverrides.hero_image_url !== undefined
                ? { ...detailForm, hero_image_url: groupFieldOverrides.hero_image_url }
                : detailForm,
              specKeys,
            ),
          );
          if (groupFieldOverrides.cover_image_url !== undefined) {
            setCardForm((current) => ({ ...current, cover_image_url: groupFieldOverrides.cover_image_url || '' }));
          }
          if (groupFieldOverrides.hero_image_url !== undefined) {
            setDetailForm((current) => ({ ...current, hero_image_url: groupFieldOverrides.hero_image_url || '' }));
          }
        }
      }
      patchSelectedDetail((detail) => ({
        ...detail,
        group: {
          ...detail.group,
          cover_image_url: media && detail.group.cover_image_url === media.image_url ? '' : detail.group.cover_image_url,
          hero_image_url: media && detail.group.hero_image_url === media.image_url ? '' : detail.group.hero_image_url,
        },
        group_medias: detail.group_medias.filter((item) => item.binding_id !== bindingId),
      }));
      setToast(buildAdminToast('success', '图片绑定已删除'));
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '删除图片绑定失败')));
      setError(resolveApiErrorMessage(cause, '删除图片绑定失败'));
    } finally {
      setRemovingBindingKey('');
    }
  }

  return (
    <>
      <AdminToast toast={toast} onClose={() => setToast(null)} />
      <AdminUnsavedNotice visible={hasUnsavedChanges} />

      <section className="admin-hero admin-hero--compact">
        <div className="admin-hero__copy">
          <p className="admin-hero__eyebrow">商品组编辑</p>
          <h1>维护本系列的展示信息与图片。</h1>
          <p>这里维护商品组标题、商品列表封面、详情页顶部大图、详情页图集与子商品入口。具体子商品的价格、库存、规格和子商品专属图片，请进入对应子商品维护。</p>
        </div>
        <div className="admin-hero__actions">
          <Link className="admin-button admin-button--ghost" to={productsPath()}>返回列表</Link>
          <button className="admin-button admin-button--secondary" type="button" onClick={() => void loadGroupDetail(selectedDetail?.group.id ?? parsedGroupId)}>刷新详情</button>
        </div>
      </section>

      {loading ? <div className="status status--info">正在加载商品组详情...</div> : null}
      {!loading && error ? <div className="status status--error">{error}</div> : null}
      {!loading && !error && selectedDetail ? (
        <>
          <section className="admin-product-command-bar">
            <div className="admin-product-command-bar__main">
              <strong>{selectedDetail.group.name || cardForm.title || '未命名商品组'}</strong>
              <span>{resolveCategoryName(categories, parseInteger(detailForm.category_id))} / {resolveStatusLabel(parseInteger(detailForm.status))}</span>
            </div>
            <div className="admin-product-command-bar__metrics">
              <span>子商品 {overview.variantCount}</span>
              <span>启用 {overview.onSaleCount}</span>
              <span>图片 {overview.totalMedia}</span>
              <span>低库存 {overview.lowStockCount}</span>
            </div>
          </section>

          <section className="admin-product-workbench">
            <div className="admin-product-workbench__main">
            <section className="admin-panel admin-panel--wide admin-product-editor-panel">
              <div className="admin-panel__header">
                <div>
                  <p className="admin-panel__eyebrow">列表卡片编辑</p>
                  <h2>{selectedDetail.group.name || '编辑商品卡片'}</h2>
                </div>
              </div>

              <div className="admin-form-grid">
                <label className="admin-field admin-field--full">
                  <span>卡片标题</span>
                  <input name="title" value={cardForm.title} onChange={handleCardChange} placeholder="例如 MacBook Air" />
                </label>
                <p className="admin-field-hint admin-field--full">
                  卡片价格与描述取自默认版本的后端真值，请在子商品的三级版本页维护，此处仅维护商品组标题与封面。
                </p>
              </div>

              <div className="admin-divider" />

              <div className="admin-panel__header">
                <div>
                  <p className="admin-panel__eyebrow">详情页编辑</p>
                  <h2>维护详情页标题与展示信息</h2>
                </div>
              </div>

              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>排序</span>
                  <input name="sort_order" value={detailForm.sort_order} onChange={handleDetailChange} placeholder="越小越靠前" />
                </label>
                <label className="admin-field">
                  <span>类目</span>
                  <select name="category_id" value={detailForm.category_id} onChange={handleDetailChange}>
                    <option value="">暂无类目</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>状态</span>
                  <select name="status" value={detailForm.status} onChange={handleDetailChange}>
                    <option value="1">启用</option>
                    <option value="2">停用</option>
                  </select>
                </label>
                <label className="admin-field admin-field--full">
                  <span>详情页主标题</span>
                  <input name="hero_title" value={detailForm.hero_title} onChange={handleDetailChange} placeholder="例如 轻薄，迅捷" />
                </label>
                <label className="admin-field admin-field--full">
                  <span>详情页副标题</span>
                  <input name="hero_subtitle" value={detailForm.hero_subtitle} onChange={handleDetailChange} placeholder="例如 M4 芯片" />
                </label>
                <div className="admin-group-media-picker admin-form-actions--full">
                  <div className="admin-group-media-picker__hint">
                    {selectedGroupMedias.length > 0
                      ? `当前商品组已拥有 ${selectedGroupMedias.length} 张图片。在下方图片库点按即可指定每张图显示在哪里。`
                      : '当前商品组还没有图片，请先在下方图片库上传。'}
                  </div>
                  <div className="admin-group-media-picker__grid">
                    <article className="admin-group-media-picker__card">
                      <div className="admin-group-media-picker__header">
                        <strong>商品列表封面</strong>
                        <span>显示在商品列表卡片</span>
                      </div>
                      <div className={`admin-group-media-picker__preview${selectedCoverMedia?.image_url ? ' admin-group-media-picker__preview--photo' : ''}`} style={selectedCoverMedia?.image_url ? { backgroundImage: `url(${selectedCoverMedia.image_url})` } : undefined} />
                      <p>{selectedCoverMedia?.alt_text?.trim() || '尚未指定，请在下方图片库点按设置'}</p>
                    </article>
                    <article className="admin-group-media-picker__card">
                      <div className="admin-group-media-picker__header">
                        <strong>详情页顶部大图</strong>
                        <span>显示在商品详情页顶部</span>
                      </div>
                      <div className={`admin-group-media-picker__preview${selectedHeroMedia?.image_url ? ' admin-group-media-picker__preview--photo' : ''}`} style={selectedHeroMedia?.image_url ? { backgroundImage: `url(${selectedHeroMedia.image_url})` } : undefined} />
                      <p>{selectedHeroMedia?.alt_text?.trim() || '尚未指定，请在下方图片库点按设置'}</p>
                    </article>
                  </div>
                </div>
              </div>

              <div className="admin-divider" />

              <div className="admin-panel__header">
                <div>
                  <p className="admin-panel__eyebrow">规格维度定义</p>
                  <h2>定义本系列的规格维度</h2>
                </div>
              </div>
              <div className="admin-form-grid">
                <div className="admin-field admin-field--full">
                  <span>规格维度</span>
                  <div className="admin-spec-editor">
                    {(selectedDetail.group.spec_keys?.length ?? 0) === 0 && specKeys.length > 0 ? (
                      <p className="admin-field-hint admin-field-hint--warning">
                        当前商品组未保存规格维度，以下维度从已有子商品规格中自动恢复。保存当前页面后，这些维度会写回商品组。
                      </p>
                    ) : null}
                    {specKeys.length > 0 ? (
                      specKeys.map((key, index) => (
                        <div className="admin-spec-editor__row" key={`spec-key-${index}`}>
                          <input
                            className="admin-spec-editor__key"
                            value={key}
                            onChange={(event) => handleSpecKeyChange(index, event.target.value)}
                            placeholder="维度名，例如 内存"
                          />
                          <button
                            className="admin-button admin-button--ghost admin-button--small"
                            type="button"
                            onClick={() => handleRemoveSpecKey(index)}
                          >
                            删除
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="admin-field-hint">还没有定义规格维度。例如「芯片 / 内存 / 存储」，定义后子商品只能在这些维度上填值。</p>
                    )}
                    <button className="admin-button admin-button--secondary admin-button--small" type="button" onClick={handleAddSpecKey}>
                      添加规格维度
                    </button>
                  </div>
                </div>
              </div>
            </section>
            </div>

            <aside className="admin-product-inspector">
              <section className="admin-panel admin-panel--compact">
                <div className="admin-panel__header">
                  <div>
                    <p className="admin-panel__eyebrow">商品列表封面卡片预览</p>
                  </div>
                  <div className="admin-panel__meta">
                    <span>前台一个商品组只展示一张卡片</span>
                  </div>
                </div>
                <div className="admin-product-card-preview-grid">
                  <article className="card product-card admin-product-card-preview">
                    <div
                      className={`product-card__image${productCardPreview.image_url ? ' product-card__image--photo' : ''}`}
                      style={productCardPreview.image_url ? { backgroundImage: `url(${productCardPreview.image_url})` } : undefined}
                      aria-hidden="true"
                    >
                      {!productCardPreview.image_url ? <span>宝</span> : null}
                    </div>

                    <div className="stack">
                      <div className="badge-row">
                        <span className="badge">{productCardPreview.category_name}</span>
                        {!productCardPreview.on_sale ? <span className="chip chip--placeholder">{productCardPreview.availability_message}</span> : null}
                      </div>

                      <div>
                        <h3>{productCardPreview.name}</h3>
                        <p className="muted">{productCardPreview.description}</p>
                      </div>

                      <div className="price">
                        {formatPrice(productCardPreview.price)}
                      </div>
                    </div>

                    <div className="inline-actions">
                      <button className="button button--primary admin-product-card-preview__action" type="button">查看详情</button>
                    </div>
                  </article>
                </div>
              </section>

              <section className="admin-panel admin-panel--compact">
                <div className="admin-panel__header">
                  <div>
                    <p className="admin-panel__eyebrow">子商品列表</p>
                    <h2>进入子商品编辑</h2>
                  </div>
                </div>
                <div className="admin-variant-strip admin-variant-strip--column">
                  {variantRows.map((variant) => (
                    <Link
                      key={variant.id}
                      to={productVariantPath(selectedDetail.group.id, variant.id)}
                      className="admin-variant-strip__item admin-variant-strip__item--link"
                    >
                      <div className={`admin-variant-strip__thumb${variant.image_url ? ' admin-variant-strip__thumb--photo' : ''}`} style={variant.image_url ? { backgroundImage: `url(${variant.image_url})` } : undefined} />
                      <div className="admin-variant-strip__copy">
                        <strong>{variant.spec_label || selectedDetail.group.name || selectedDetail.product.name}</strong>
                        <span>{formatPrice(variant.price)} / 库存 {variant.stock_quantity}</span>
                        <span>{resolveCategoryName(categories, variant.category_id || selectedDetail.product.category_id)} / {variant.status_label}</span>
                      </div>
                    </Link>
                  ))}
                  {variantRows.length === 0 ? <div className="notice notice--placeholder">当前商品组下还没有可编辑子商品。</div> : null}
                </div>
              </section>
            </aside>
          </section>

          <section className="admin-panel admin-panel--media">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">图片库管理</p>
                <h2>本商品组图片库</h2>
              </div>
              <div className="admin-panel__meta">
                <span>{selectedDetail.group_medias.length} 张组内图片</span>
                <span>商品列表封面、详情页顶部大图与详情页图集都从这里指定</span>
              </div>
            </div>

            <div className="admin-media-section">
              <form className="admin-media-toolbar" onSubmit={(event) => void handleSubmitMedia(event)}>
                <div className="admin-media-toolbar__main">
                  <div className="admin-media-toolbar__field">
                    <span>图片文件</span>
                    <input type="file" accept="image/*" onChange={handleMediaFileChange} />
                  </div>
                  <div className="admin-media-toolbar__field">
                    <span>替代文本</span>
                    <input type="text" value={uploadForm.alt_text} onChange={(event) => setUploadForm((current) => ({ ...current, alt_text: event.target.value }))} placeholder="例如：MacBook Air 银色正面图" />
                  </div>
                  <div className="admin-media-toolbar__grid">
                    <label className="admin-field">
                      <span>排序</span>
                      <input type="number" min="1" value={uploadForm.sort_order} onChange={(event) => setUploadForm((current) => ({ ...current, sort_order: event.target.value }))} />
                    </label>
                    <label className="admin-field">
                      <span>归属</span>
                      <input value="本系列公共图片库" disabled />
                    </label>
                  </div>
                  <div className="admin-media-toolbar__footer">
                    <div className="admin-media-toolbar__actions">
                      <button className="admin-button admin-button--primary" type="submit" disabled={submittingMedia}>{submittingMedia ? '上传处理中...' : '上传到图片库'}</button>
                    </div>
                  </div>
                </div>

                <div className="admin-media-toolbar__aside">
                  <div className="admin-media-uploader-preview">
                    <div className={`admin-media-uploader-preview__image${uploadForm.file ? ' admin-media-uploader-preview__image--ready' : ''}`}>
                      <span>{uploadForm.file ? uploadForm.file.name : '等待选择图片'}</span>
                    </div>
                    <div className="admin-media-uploader-preview__copy">
                      <strong>将写入当前商品组图片库</strong>
                      <span>上传后可指定为：商品列表封面 / 详情页顶部大图 / 详情页图集</span>
                      <span>排序值：{normalizeSortOrder(uploadForm.sort_order)}</span>
                    </div>
                  </div>
                </div>
              </form>

              <section className="admin-media-cluster">
                <div className="admin-media-cluster__header">
                  <div>
                    <strong>商品组图片库</strong>
                    <span>点按每张图下方按钮指定显示位置，并可调整详情页图集顺序</span>
                  </div>
                  <span className="admin-badge">{selectedDetail.group_medias.length} 张</span>
                </div>
                {selectedDetail.group_medias.length > 0 ? (
                  <div className="admin-media-card-strip">
                    {selectedDetail.group_medias.map((media, index) => (
                      <article key={`group-${selectedDetail.group.id}-${media.binding_id || media.id}`} className="admin-media-editor-card">
                        <div className={`admin-media-editor-card__preview${media.image_url ? ' admin-media-editor-card__preview--photo' : ''}`} style={media.image_url ? { backgroundImage: `url(${media.image_url})` } : undefined} />
                        <div className="admin-media-editor-card__body">
                          <div className="admin-media-editor-card__header">
                            <strong>{media.alt_text || selectedDetail.group.name}</strong>
                            <div className="admin-media-editor-card__badges">
                              {buildMediaHighlights(media, {
                                isCurrentCover: cardForm.cover_image_url === media.image_url,
                                isCurrentHero: detailForm.hero_image_url === media.image_url,
                              }).map((label) => (
                                <span key={`${media.binding_id || media.id}-${label}`} className="admin-badge">{label}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="admin-media-editor-card__controls">
                          <div className="admin-media-editor-card__row admin-media-editor-card__row--icon">
                            <button
                              className="admin-icon-button"
                              type="button"
                              aria-label="向左移动"
                              title="向左移动"
                              disabled={index === 0}
                              onClick={() => void handleMoveMedia(media.binding_id || media.id, 'left')}
                            >
                              ‹
                            </button>
                            <button
                              className="admin-icon-button"
                              type="button"
                              aria-label="向右移动"
                              title="向右移动"
                              disabled={index === selectedDetail.group_medias.length - 1}
                              onClick={() => void handleMoveMedia(media.binding_id || media.id, 'right')}
                            >
                              ›
                            </button>
                          </div>
                          <div className="admin-media-editor-card__row">
                            <button className="admin-button admin-button--secondary admin-button--small" type="button" disabled={assigningBindingKey === `cover-${selectedDetail.group.id}-${media.binding_id || media.id}` || cardForm.cover_image_url === media.image_url} onClick={() => void handleAssignGroupMedia(media, 'cover')}>用作商品列表封面</button>
                            <button className="admin-button admin-button--secondary admin-button--small" type="button" disabled={assigningBindingKey === `hero-${selectedDetail.group.id}-${media.binding_id || media.id}` || detailForm.hero_image_url === media.image_url} onClick={() => void handleAssignGroupMedia(media, 'hero')}>用作详情页顶部大图</button>
                            <button className="admin-button admin-button--ghost admin-button--small" type="button" disabled={!media.binding_id || removingBindingKey === `group-${selectedDetail.group.id}-${media.binding_id}`} onClick={() => void handleDeleteBinding(media.binding_id)}>从图片库移除</button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="notice notice--placeholder">当前商品组还没有已绑定图片，可直接使用上方工具上传。</div>
                )}
              </section>
            </div>
          </section>

          <section className="admin-panel admin-panel--dense">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">页面操作</p>
                <h2>保存当前商品组页面</h2>
              </div>
            </div>
            <div className="admin-form-actions">
              <button className="admin-button admin-button--primary" type="button" disabled={savingPage} onClick={() => void handleSubmitPage()}>
                {savingPage ? '正在保存当前页面...' : '保存当前页面全部改动'}
              </button>
              <button className="admin-button admin-button--secondary" type="button" onClick={() => void handleDeleteSelectedGroup()} disabled={deletingGroup || !selectedDetail.group.id}>
                {deletingGroup ? '正在删除商品组...' : '删除商品组'}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
