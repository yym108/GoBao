import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createAddress, deleteAddress, fetchAddresses, setDefaultAddress, updateAddress } from '../api/addresses';
import { PageTitle } from '../components/PageTitle';
import { resolveApiErrorMessage } from '../lib/errors';
import { createAddressDraft, validateAddressDraft } from '../lib/cartCheckout.ts';
import type { AddressFormErrors, AddressUpsertPayload, UserAddress } from '../lib/types';

/**
 * 地址管理页已接入真实地址簿接口，
 * 支持新增、编辑、删除与设置默认地址，供购物车和后续下单流程直接复用。
 */
export function AddressPage() {
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeVariant, setNoticeVariant] = useState<'success' | 'error'>('success');
  const [noticeClosing, setNoticeClosing] = useState(false);
  const [draft, setDraft] = useState<AddressUpsertPayload>(createAddressDraft);
  const [draftErrors, setDraftErrors] = useState<AddressFormErrors>(createAddressDraft);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const defaultAddress = useMemo(() => addresses.find((item) => item.is_default) ?? null, [addresses]);

  async function loadAddresses() {
    const data = await fetchAddresses();
    setAddresses(data.addresses);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchAddresses()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setAddresses(data.addresses);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }
        setError(resolveApiErrorMessage(cause, '地址列表加载失败'));
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
   * 地址操作统一走顶部轻提示，避免在列表区插入多段成功消息打断管理流程。
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
   * 更新地址表单字段，并在用户继续输入时清空对应的本地校验提示。
   */
  function handleChangeDraftField(field: keyof AddressUpsertPayload, value: string | boolean) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (typeof value === 'string') {
      setDraftErrors((current) => ({ ...current, [field]: '' }));
    }
  }

  /**
   * 将列表中的一条地址带入表单，复用同一个编辑卡片完成更新。
   */
  function handleEditAddress(address: UserAddress) {
    setEditingAddressId(address.id);
    setDraft({
      receiver_name: address.receiver_name,
      receiver_phone: address.receiver_phone,
      province: address.province,
      city: address.city,
      district: address.district,
      address_line: address.address_line,
      postal_code: address.postal_code,
      is_default: address.is_default,
    });
    setDraftErrors(createAddressDraft());
    setError('');
    setShowEditor(true);
  }

  /**
   * 清空表单，回到新增地址状态。
   */
  function resetDraft() {
    setEditingAddressId(null);
    setDraft(createAddressDraft());
    setDraftErrors(createAddressDraft());
  }

  /**
   * 打开新增地址编辑卡片，并清空上一条编辑上下文。
   */
  function handleStartCreate() {
    resetDraft();
    setError('');
    setShowEditor(true);
  }

  /**
   * 提交新增或编辑地址请求，并在成功后刷新地址快照。
   */
  async function handleSubmitAddress() {
    const nextErrors = validateAddressDraft(draft);
    setDraftErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setNoticeVariant('error');
      setNotice('请先完善地址信息后再保存。');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      if (editingAddressId) {
        await updateAddress(editingAddressId, draft);
        setNoticeVariant('success');
        setNotice('地址已更新。');
      } else {
        await createAddress(draft);
        setNoticeVariant('success');
        setNotice('地址已添加。');
      }
      resetDraft();
      await loadAddresses();
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, editingAddressId ? '地址更新失败' : '地址创建失败'));
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * 删除地址后刷新列表快照，保持默认地址与顺序完全以后端返回为准。
   */
  async function handleDeleteAddress(address: UserAddress) {
    try {
      await deleteAddress(address.id);
      await loadAddresses();
      if (editingAddressId === address.id) {
        resetDraft();
      }
      setNoticeVariant('success');
      setNotice(`已删除地址：${address.receiver_name}。`);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '删除地址失败'));
    }
  }

  /**
   * 切换默认地址后重新读取列表，确保默认态展示与结算页保持一致。
   */
  async function handleSetDefaultAddress(address: UserAddress) {
    try {
      await setDefaultAddress(address.id);
      await loadAddresses();
      setNoticeVariant('success');
      setNotice(`已将 ${address.receiver_name} 设为默认地址。`);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '默认地址设置失败'));
    }
  }

  return (
    <div className="page stack">
      {notice ? <div className={`page-floating-notice${noticeVariant === 'error' ? ' page-floating-notice--error' : ''}${noticeClosing ? ' page-floating-notice--closing' : ''}`}>{notice}</div> : null}
      <PageTitle title="地址管理" desc="统一维护收货地址，购物车结算会直接复用这里的默认地址或当前选中地址。" />

      <section className="session-grid address-overview-grid">
        <article className="card card--strong stack">
          <div className="hero__eyebrow">默认地址</div>
          {defaultAddress ? (
            <div className="stack">
              <strong>
                {defaultAddress.receiver_name} · {defaultAddress.receiver_phone}
              </strong>
              <div className="muted">
                {defaultAddress.province}
                {defaultAddress.city}
                {defaultAddress.district}
                {defaultAddress.address_line}
              </div>
              {defaultAddress.postal_code ? <div className="muted">邮编 {defaultAddress.postal_code}</div> : null}
            </div>
          ) : (
            <div className="stack">
              <strong>暂未设置默认地址</strong>
              <div className="muted">添加第一条地址后，系统会自动将其设为默认地址，并在结算时优先带出。</div>
            </div>
          )}
          <div className="inline-actions">
            <button type="button" className="button button--primary" onClick={handleStartCreate}>
              新增地址
            </button>
            <Link to="/cart" className="button button--ghost">
              前往结算
            </Link>
          </div>
        </article>

        <article className="card stack">
          <div className="hero__eyebrow">{editingAddressId ? '编辑地址' : '新增地址'}</div>
          {showEditor ? (
            <div className="address-form">
              <div className="field">
                <label htmlFor="address_receiver_name">收货人</label>
                <input
                  id="address_receiver_name"
                  value={draft.receiver_name}
                  onChange={(event) => handleChangeDraftField('receiver_name', event.target.value)}
                  disabled={submitting}
                  aria-invalid={draftErrors.receiver_name ? 'true' : 'false'}
                  placeholder="填写收货人姓名"
                />
                {draftErrors.receiver_name ? <div className="field__hint field__hint--error">{draftErrors.receiver_name}</div> : null}
              </div>

              <div className="field">
                <label htmlFor="address_receiver_phone">联系电话</label>
                <input
                  id="address_receiver_phone"
                  value={draft.receiver_phone}
                  onChange={(event) => handleChangeDraftField('receiver_phone', event.target.value)}
                  disabled={submitting}
                  aria-invalid={draftErrors.receiver_phone ? 'true' : 'false'}
                  placeholder="填写收货手机号"
                />
                {draftErrors.receiver_phone ? <div className="field__hint field__hint--error">{draftErrors.receiver_phone}</div> : null}
              </div>

              <div className="cart-summary-card__grid">
                <div className="field">
                  <label htmlFor="address_province">省份</label>
                  <input
                    id="address_province"
                    value={draft.province}
                    onChange={(event) => handleChangeDraftField('province', event.target.value)}
                    disabled={submitting}
                    aria-invalid={draftErrors.province ? 'true' : 'false'}
                    placeholder="省"
                  />
                  {draftErrors.province ? <div className="field__hint field__hint--error">{draftErrors.province}</div> : null}
                </div>

                <div className="field">
                  <label htmlFor="address_city">城市</label>
                  <input
                    id="address_city"
                    value={draft.city}
                    onChange={(event) => handleChangeDraftField('city', event.target.value)}
                    disabled={submitting}
                    aria-invalid={draftErrors.city ? 'true' : 'false'}
                    placeholder="市"
                  />
                  {draftErrors.city ? <div className="field__hint field__hint--error">{draftErrors.city}</div> : null}
                </div>
              </div>

              <div className="cart-summary-card__grid">
                <div className="field">
                  <label htmlFor="address_district">区县</label>
                  <input
                    id="address_district"
                    value={draft.district}
                    onChange={(event) => handleChangeDraftField('district', event.target.value)}
                    disabled={submitting}
                    aria-invalid={draftErrors.district ? 'true' : 'false'}
                    placeholder="区 / 县"
                  />
                  {draftErrors.district ? <div className="field__hint field__hint--error">{draftErrors.district}</div> : null}
                </div>

                <div className="field">
                  <label htmlFor="address_postal_code">邮编</label>
                  <input
                    id="address_postal_code"
                    value={draft.postal_code}
                    onChange={(event) => handleChangeDraftField('postal_code', event.target.value)}
                    disabled={submitting}
                    placeholder="可选"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="address_line">详细地址</label>
                <textarea
                  id="address_line"
                  value={draft.address_line}
                  onChange={(event) => handleChangeDraftField('address_line', event.target.value)}
                  disabled={submitting}
                  aria-invalid={draftErrors.address_line ? 'true' : 'false'}
                  placeholder="填写街道、楼栋和门牌等详细信息"
                />
                {draftErrors.address_line ? <div className="field__hint field__hint--error">{draftErrors.address_line}</div> : null}
              </div>

              <label className="address-form__checkbox">
                <input type="checkbox" checked={draft.is_default} onChange={(event) => handleChangeDraftField('is_default', event.target.checked)} disabled={submitting} />
                <span>保存后设为默认地址</span>
              </label>

              <div className="inline-actions">
                <button type="button" className="button button--primary" disabled={submitting} onClick={() => void handleSubmitAddress()}>
                  {submitting ? '保存中...' : editingAddressId ? '更新地址' : '保存地址'}
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={submitting}
                  onClick={() => {
                    resetDraft();
                    setShowEditor(false);
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="address-editor-placeholder">
              <strong>从左侧地址簿选择一条地址进行编辑，或新增一条新地址。</strong>
              <div className="muted">保存后，结算时会自动带出你的默认地址或选中的地址。</div>
              <button type="button" className="button button--primary" onClick={handleStartCreate}>
                新增地址
              </button>
            </div>
          )}
        </article>
      </section>

      {error ? <div className="status status--error">{error}</div> : null}
      {loading ? <div className="loading">正在加载地址列表...</div> : null}

      {!loading ? (
        <section className="card stack">
          <div className="hero__eyebrow">地址清单</div>
          {addresses.length ? (
            <div className="surface-list">
              {addresses.map((address) => (
                <article key={address.id} className="surface-item address-item">
                  <div className="address-item__copy">
                    <div className="address-item__title-row">
                      <strong>
                        {address.receiver_name} · {address.receiver_phone}
                      </strong>
                      {address.is_default ? <span className="address-item__badge">默认地址</span> : null}
                    </div>
                    <div className="muted">
                      {address.province}
                      {address.city}
                      {address.district}
                      {address.address_line}
                    </div>
                    {address.postal_code ? <div className="muted">邮编 {address.postal_code}</div> : null}
                  </div>

                  <div className="address-item__actions">
                    {!address.is_default ? (
                      <button type="button" className="button button--ghost" onClick={() => void handleSetDefaultAddress(address)}>
                        设为默认
                      </button>
                    ) : null}
                    <button type="button" className="button button--ghost" onClick={() => handleEditAddress(address)}>
                      编辑
                    </button>
                    <button type="button" className="button button--secondary" onClick={() => void handleDeleteAddress(address)}>
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="stack">
              <strong>你还没有保存收货地址</strong>
              <div className="muted">新增地址后，这里会展示全部可选地址，并支持默认地址切换。</div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
