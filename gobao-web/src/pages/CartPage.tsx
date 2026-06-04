import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAddresses } from '../api/addresses';
import { deleteCartItem, fetchCart, updateCartItem } from '../api/cart';
import { createOrder } from '../api/orders';
import { executeCartBatchCheckout, resolveCheckoutSummaryNotice } from '../lib/cartCheckout.ts';
import { resolveApiErrorMessage } from '../lib/errors';
import { formatPrice } from '../lib/format';
import type { Cart, UserAddress } from '../lib/types';

/**
 * 购物车页当前已接入真实购物车读取、删除和数量更新接口，并展示后端返回的商品版本摘要。
 */
export function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState<Cart>({ items: [], total_quantity: 0, total_amount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [actionNoticeClosing, setActionNoticeClosing] = useState(false);
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState(0);
  const [addressLoading, setAddressLoading] = useState(true);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [addressPanelOpen, setAddressPanelOpen] = useState(false);

  const unavailableItems = useMemo(() => cart.items.filter((item) => !item.available), [cart.items]);
  const availableItems = useMemo(() => cart.items.filter((item) => item.available), [cart.items]);
  const availableTotalAmount = useMemo(
    () => availableItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [availableItems],
  );
  const availableTotalQuantity = useMemo(
    () => availableItems.reduce((sum, item) => sum + item.quantity, 0),
    [availableItems],
  );

  const selectedAddress = useMemo(
    () => addresses.find((item) => item.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  );

  async function loadCartSnapshot() {
    const data = await fetchCart();
    setCart(data);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchCart()
      .then((data) => {
        if (!cancelled) {
          setCart(data);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(resolveApiErrorMessage(cause, '购物车加载失败'));
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
  }, []);

  /**
   * 购物车结算只读取后端地址簿，不再允许页面单独维护一份收货信息真值。
   */
  useEffect(() => {
    let cancelled = false;
    setAddressLoading(true);

    fetchAddresses()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setAddresses(data.addresses);
        const defaultAddress = data.addresses.find((item) => item.is_default) ?? data.addresses[0] ?? null;
        setSelectedAddressId(defaultAddress?.id ?? 0);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }
        setError(resolveApiErrorMessage(cause, '地址列表加载失败'));
      })
      .finally(() => {
        if (!cancelled) {
          setAddressLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 购物车内条目操作失败时，统一用顶部轻提示反馈，避免错误块打断列表浏览。
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
   * 删除单个购物车条目后重新获取最新购物车快照，保持当前页面逻辑简单稳定。
   */
  async function handleDeleteItem(cartItemId: string) {
    try {
      await deleteCartItem(cartItemId);
      await loadCartSnapshot();
    } catch (cause) {
      setActionNotice(resolveApiErrorMessage(cause, '操作失败'));
    }
  }

  /**
   * 调整单个购物车条目的数量，更新后重新同步整车快照。
   */
  async function handleUpdateQuantity(cartItemId: string, nextQuantity: number) {
    if (nextQuantity <= 0) {
      await handleDeleteItem(cartItemId);
      return;
    }

    const currentItem = cart.items.find((item) => item.cart_item_id === cartItemId) ?? null;
    if (currentItem && !currentItem.available) {
      setActionNotice(currentItem.unavailable_reason || '当前商品暂不可调整，请先移出购物车。');
      return;
    }

    try {
      const nextCart = await updateCartItem(cartItemId, nextQuantity);
      setCart(nextCart);
    } catch (cause) {
      setActionNotice(resolveApiErrorMessage(cause, '操作失败'));
    }
  }

  /**
   * 提交整车结算：前端顺序遍历购物车条目，逐条创建订单并删除成功条目。
   */
  async function handleSubmitCheckout() {
    if (!cart.items.length) {
      setActionNotice('当前购物车为空，请先添加商品。');
      return;
    }
    if (unavailableItems.length > 0) {
      setActionNotice('购物车中含有当前不可购买的商品，请先移除后再提交订单。');
      return;
    }

    if (!selectedAddress) {
      setActionNotice('请先选择收货地址后再提交订单。');
      return;
    }

    setSubmittingCheckout(true);
    setError('');

    try {
      const result = await executeCartBatchCheckout({
        address: selectedAddress,
        items: availableItems,
        createOrder: async (payload) => {
          await createOrder(payload);
        },
        deleteCartItem: async (cartItemId) => {
          await deleteCartItem(cartItemId);
        },
      });

      await loadCartSnapshot();
      const notice = resolveCheckoutSummaryNotice(result.successCount, availableItems.length);

      if (result.successCount === availableItems.length) {
        navigate('/profile/orders', {
          state: {
            checkoutNotice: notice,
          },
        });
        return;
      }

      setActionNotice(notice);
    } catch (cause) {
      setActionNotice(resolveApiErrorMessage(cause, '订单提交失败，请稍后重试'));
    } finally {
      setSubmittingCheckout(false);
    }
  }

  /**
   * 在结算页切换地址时，始终以后端地址簿为真值，仅更新当前选中地址 ID。
   */
  function handleSelectAddress(addressId: number) {
    setSelectedAddressId(addressId);
    setAddressPanelOpen(false);
  }

  return (
    <section className="boutique-page">
      {actionNotice ? <div className={`page-floating-notice${actionNoticeClosing ? ' page-floating-notice--closing' : ''}`}>{actionNotice}</div> : null}
      <header className="boutique-hero boutique-hero--cart">
        <div className="boutique-hero__copy">
          <p className="boutique-hero__eyebrow">购物车</p>
          <h1>{cart.items.length ? <span className="nowrap-text">已选好的产品，已在这里汇合。</span> : '你的购物车，等待下一件精选好物。'}</h1>
          <p>当前页面会展示后端返回的真实商品与金额信息；具体版本配置只作为次级信息辅助确认，数量调整和删除会立即同步到后端购物车。</p>
        </div>
        <div className="boutique-hero__meta">
          <span>共 {cart.total_quantity} 件商品</span>
          <span>合计 {formatPrice(cart.total_amount)}</span>
          <Link to="/products">继续选购</Link>
        </div>
      </header>

      {error ? <div className="status status--error">{error}</div> : null}
      {loading ? <div className="loading">正在载入购物车...</div> : null}

      {!loading && cart.items.length > 0 ? (
        <section className="cart-layout">
          <div className="cart-list-card">
            <div className="cart-list-card__header">
              <span>商品</span>
              <span>小计</span>
            </div>

            <div className="cart-list">
              {cart.items.map((item) => (
                <article key={item.cart_item_id} className={`cart-list__item${!item.available ? ' cart-list__item--disabled' : ''}`}>
                  <div className="cart-list__product">
                    <div
                      className={`cart-list__thumb${item.image_url ? ' cart-list__thumb--photo' : ''}`}
                      style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined}
                    >
                      {!item.image_url ? '◔' : null}
                    </div>
                    <div className="cart-list__copy">
                      <strong>{item.name}</strong>
                      {item.option_summary ? <span className="cart-list__option">{item.option_summary}</span> : null}
                      {!item.available ? <div className="status status--error cart-list__status">{item.unavailable_reason || '当前商品暂不可购买'}</div> : null}
                      <span className="muted">
                        {formatPrice(item.price)} × {item.quantity}
                      </span>
                    </div>
                  </div>

                  <div className="cart-list__meta">
                    <strong>{formatPrice(item.price * item.quantity)}</strong>
                    <div className="cart-list__controls">
                      <div className="cart-quantity">
                        <button className="cart-quantity__button" type="button" disabled={submittingCheckout || !item.available} onClick={() => handleUpdateQuantity(item.cart_item_id, item.quantity - 1)}>
                          -
                        </button>
                        <span className="cart-quantity__value">{item.quantity}</span>
                        <button className="cart-quantity__button" type="button" disabled={submittingCheckout || !item.available} onClick={() => handleUpdateQuantity(item.cart_item_id, item.quantity + 1)}>
                          +
                        </button>
                      </div>

                      <button className="button button--ghost" type="button" disabled={submittingCheckout} onClick={() => handleDeleteItem(item.cart_item_id)}>
                        移除
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="cart-summary-card">
            <p className="cart-summary-card__eyebrow">结算摘要</p>
            <h2>结算摘要</h2>
            <div className="cart-summary-card__rows">
              <div className="cart-summary-card__row">
                <span>可结算件数</span>
                <strong>{availableTotalQuantity}</strong>
              </div>
              <div className="cart-summary-card__row">
                <span>可结算金额</span>
                <strong>{formatPrice(availableTotalAmount)}</strong>
              </div>
              <div className="cart-summary-card__row">
                <span>配送与支付</span>
                <strong>按订单分别处理</strong>
              </div>
              {unavailableItems.length ? (
                <div className="cart-summary-card__row cart-summary-card__row--danger">
                  <span>不可结算商品</span>
                  <strong>{unavailableItems.length} 件</strong>
                </div>
              ) : null}
            </div>

            <div className="cart-summary-card__total">
              <span>预估合计</span>
              <strong>{formatPrice(availableTotalAmount)}</strong>
            </div>

            {unavailableItems.length ? <div className="status status--error">购物车中含有已下架或缺货商品，请先移除后再结算。</div> : null}

            <div className="cart-summary-card__form">
              <div className="field">
                <label>收货地址</label>
                {addressLoading ? (
                  <div className="loading">正在同步地址簿...</div>
                ) : addresses.length ? (
                  <div className="address-selector">
                    <button
                      type="button"
                      className={`address-selector__trigger${addressPanelOpen ? ' address-selector__trigger--open' : ''}`}
                      disabled={submittingCheckout}
                      onClick={() => setAddressPanelOpen((current) => !current)}
                    >
                      <div className="address-selector__trigger-copy">
                        <strong>{selectedAddress ? `${selectedAddress.receiver_name} · ${selectedAddress.receiver_phone}` : '请选择收货地址'}</strong>
                        <span>
                          {selectedAddress
                            ? `${selectedAddress.province}${selectedAddress.city}${selectedAddress.district}${selectedAddress.address_line}`
                            : '从已保存地址中选择一项用于本次下单'}
                        </span>
                      </div>
                      <span className="address-selector__trigger-action">{addressPanelOpen ? '收起' : '更换'}</span>
                    </button>

                    {addressPanelOpen ? (
                      <div className="address-selector__panel">
                        {addresses.map((address) => {
                          const active = address.id === selectedAddressId;
                          return (
                            <button
                              key={address.id}
                              type="button"
                              className={`address-choice-card${active ? ' address-choice-card--active' : ''}`}
                              disabled={submittingCheckout}
                              onClick={() => handleSelectAddress(address.id)}
                            >
                              <div className="address-choice-card__title-row">
                                <strong>
                                  {address.receiver_name} · {address.receiver_phone}
                                </strong>
                                <div className="address-choice-card__badges">
                                  {address.is_default ? <span className="address-item__badge">默认地址</span> : null}
                                  {active ? <span className="address-choice-card__selected">当前选择</span> : null}
                                </div>
                              </div>
                              <div className="muted">
                                {address.province}
                                {address.city}
                                {address.district}
                                {address.address_line}
                              </div>
                              {address.postal_code ? <div className="muted">邮编 {address.postal_code}</div> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="address-selector__empty">
                    <strong>当前还没有可用地址</strong>
                    <span>请先前往地址管理页新增至少一条收货地址。</span>
                  </div>
                )}
              </div>

              {selectedAddress ? (
                <article className="cart-address-preview">
                  <div className="cart-address-preview__title-row">
                    <strong>
                      {selectedAddress.receiver_name} · {selectedAddress.receiver_phone}
                    </strong>
                    {selectedAddress.is_default ? <span className="address-item__badge">默认地址</span> : null}
                  </div>
                  <div className="muted">
                    {selectedAddress.province}
                    {selectedAddress.city}
                    {selectedAddress.district}
                    {selectedAddress.address_line}
                  </div>
                  {selectedAddress.postal_code ? <div className="muted">邮编 {selectedAddress.postal_code}</div> : null}
                </article>
              ) : null}
            </div>

            <div className="cart-summary-card__actions">
              <button className="button button--primary" type="button" disabled={submittingCheckout || addressLoading || !selectedAddress || unavailableItems.length > 0 || availableItems.length === 0} onClick={() => void handleSubmitCheckout()}>
                {submittingCheckout ? '提交中...' : '提交订单'}
              </button>
              <Link className="button button--ghost" to="/profile/addresses">
                管理地址簿
              </Link>
            </div>

            <p className="cart-summary-card__hint">本次会按购物车条目逐条生成独立订单，并统一复用当前所选地址。</p>
          </aside>
        </section>
      ) : null}

      {!loading && !cart.items.length ? (
        <section className="cart-empty-card">
          <div className="cart-empty-card__copy">
            <p className="cart-empty-card__eyebrow">购物袋</p>
            <h2>购物车暂时为空。</h2>
            <p>你加入购物车的商品会在这里展示对应的版本配置摘要、数量和金额信息。</p>
            <div className="cart-empty-card__actions">
              <Link className="button button--primary" to="/products">
                浏览产品
              </Link>
              <button className="button button--ghost" type="button" disabled>
                当前无需结算
              </button>
            </div>
          </div>

          <div className="cart-empty-card__visual" aria-hidden="true">
            <div className="cart-empty-card__bag">
              <span>+</span>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
