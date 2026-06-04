import { createRequestId } from './format.ts';
import type { AddressFormErrors, AddressUpsertPayload, CartBatchCheckoutResult, CartItem, CreateOrderPayload, UserAddress } from './types';

/**
 * 创建地址表单的默认草稿。
 */
export function createAddressDraft(): AddressUpsertPayload {
  return {
    receiver_name: '',
    receiver_phone: '',
    province: '',
    city: '',
    district: '',
    address_line: '',
    postal_code: '',
    is_default: false,
  };
}

/**
 * 对地址表单做最小前端校验，只拦截明显缺失字段。
 */
export function validateAddressDraft(draft: AddressUpsertPayload): AddressFormErrors {
  return {
    receiver_name: draft.receiver_name.trim() ? '' : '请填写收货人',
    receiver_phone: draft.receiver_phone.trim() ? '' : '请填写联系电话',
    province: draft.province.trim() ? '' : '请填写省份',
    city: draft.city.trim() ? '' : '请填写城市',
    district: draft.district.trim() ? '' : '请填写区县',
    address_line: draft.address_line.trim() ? '' : '请填写详细地址',
    postal_code: '',
  };
}

/**
 * 把所选地址和单个购物车条目组合成一次最小下单请求。
 * 每个购物车条目都会生成独立 request_id，对应一笔独立订单。
 */
export function buildCheckoutPayload(address: UserAddress, item: CartItem): CreateOrderPayload {
  return {
    request_id: createRequestId(),
    product_id: item.product_id,
    quantity: item.quantity,
    address_id: address.id,
  };
}

/**
 * 根据本次成功订单数生成顶部提示文案。
 */
export function resolveCheckoutSummaryNotice(successCount: number, totalCount: number): string {
  if (successCount <= 0) {
    return '订单提交失败，请检查收货信息或商品状态后重试。';
  }
  if (successCount >= totalCount) {
    return `本次已生成 ${successCount} 笔订单。`;
  }
  return `已成功生成 ${successCount} 笔订单，剩余商品未提交。`;
}

/**
 * 按购物车条目顺序执行批量结算。
 * 每个条目成功后立即删除；若中途失败，则停止后续提交并返回剩余条目。
 */
export async function executeCartBatchCheckout(params: {
  address: UserAddress;
  items: CartItem[];
  createOrder: (payload: CreateOrderPayload) => Promise<void>;
  deleteCartItem: (cartItemId: string) => Promise<void>;
}): Promise<CartBatchCheckoutResult> {
  let successCount = 0;

  for (let index = 0; index < params.items.length; index += 1) {
    const item = params.items[index];

    try {
      await params.createOrder(buildCheckoutPayload(params.address, item));
      await params.deleteCartItem(item.cart_item_id);
      successCount += 1;
    } catch {
      return {
        successCount,
        failedCartItemId: item.cart_item_id,
        remainingCartItemIds: params.items.slice(index).map((current) => current.cart_item_id),
      };
    }
  }

  return {
    successCount,
    failedCartItemId: '',
    remainingCartItemIds: [],
  };
}
