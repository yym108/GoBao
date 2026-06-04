export interface AuthUser {
  user_id: number;
  email: string;
  nickname: string;
  avatar_url: string;
}

export interface LoginResponse {
  access_token: string;
  expires_at: number;
  user_id: number;
}

export interface AdminProfile {
  admin_id: number;
  email: string;
  nickname: string;
  avatar_url: string;
  is_super_admin: boolean;
}

export interface AdminSessionResponse {
  access_token: string;
  expires_at: number;
  admin_id: number;
}

export interface AdminAccountSummary {
  admin_id: number;
  email: string;
  nickname: string;
  avatar_url: string;
  is_super_admin: boolean;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface ProductListItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category_id: number;
  image_url: string;
  cover_image_url?: string;
  status: number;
  group_id?: number;
  spec_label?: string;
  spec_values_json?: string;
  sort_order?: number;
  created_at: number;
  updated_at: number;
}

export interface ProductDetail extends ProductListItem {
  stock_quantity: number;
  stock_version?: number;
  group_id: number;
  spec_label: string;
  spec_values_json: string;
  sort_order: number;
}

export interface ProductGroup {
  id: number;
  name: string;
  slug: string;
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string;
  cover_image_url: string;
  default_product_id?: number;
  category_id: number;
  status: number;
  sort_order: number;
  spec_keys: string[];
  created_at?: number;
  updated_at?: number;
}

export interface ProductMedia {
  id: number;
  image_url: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
  binding_id: number;
  usage_type: string;
}

export interface MediaAssetInfo {
  id: number;
  storage_key: string;
  public_url: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  alt_text: string;
  created_at: number;
  updated_at: number;
}

export interface ProductGroupMediaBinding {
  id: number;
  group_id: number;
  media_id: number;
  usage_type: string;
  sort_order: number;
  is_primary: boolean;
  media: MediaAssetInfo;
}

export interface ProductMediaBinding {
  id: number;
  product_id: number;
  media_id: number;
  usage_type: string;
  sort_order: number;
  is_primary: boolean;
  media: MediaAssetInfo;
}

export interface ProductVariant {
  id: number;
  group_id: number;
  name?: string;
  description?: string;
  price: number;
  category_id?: number;
  image_url: string;
  stock_quantity: number;
  stock_version?: number;
  status: number;
  spec_label: string;
  spec_values_json: string;
  sort_order?: number;
  created_at?: number;
  updated_at?: number;
}

export interface ProductDetailResponse {
  product: ProductDetail;
  group: ProductGroup;
  variants: ProductVariant[];
  default_product_id: number;
  group_medias: ProductMedia[];
  product_medias: ProductMedia[];
  resolved_medias: ProductMedia[];
}

export interface SeckillActivity {
  id: number;
  product_id: number;
  title: string;
  seckill_price: number;
  seckill_stock: number;
  status: number;
  start_at: number;
  end_at: number;
  created_at: number;
  updated_at: number;
}

export interface SeckillPurchaseResult {
  queued: boolean;
  request_id: string;
  activity_id: number;
  product_id: number;
  subject: string;
  queued_at: number;
  quantity: number;
  remaining: number;
}

export interface CartItem {
  cart_item_id: string;
  product_id: number;
  name: string;
  price: number;
  quantity: number;
  image_url: string;
  option_summary: string;
}

export interface Cart {
  items: CartItem[];
  total_quantity: number;
  total_amount: number;
}

export interface UserAddress {
  id: number;
  user_id: number;
  receiver_name: string;
  receiver_phone: string;
  province: string;
  city: string;
  district: string;
  address_line: string;
  postal_code: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AddressListResponse {
  addresses: UserAddress[];
}

export interface AddressUpsertPayload {
  receiver_name: string;
  receiver_phone: string;
  province: string;
  city: string;
  district: string;
  address_line: string;
  postal_code: string;
  is_default: boolean;
}

export interface AddressFormErrors {
  receiver_name: string;
  receiver_phone: string;
  province: string;
  city: string;
  district: string;
  address_line: string;
  postal_code: string;
}

export interface CartBatchCheckoutResult {
  successCount: number;
  failedCartItemId: string;
  remainingCartItemIds: string[];
}

export interface CreateOrderPayload {
  request_id: string;
  product_id: number;
  quantity: number;
  address_id: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  name: string;
  image_url: string;
  option_summary: string;
  price: number;
  quantity: number;
  amount: number;
}

export interface Order {
  id: number;
  order_no: string;
  user_id: number;
  request_id: string;
  status: string;
  total_amount: number;
  total_quantity: number;
  receiver_name: string;
  receiver_phone: string;
  province: string;
  city: string;
  district: string;
  address_line: string;
  postal_code: string;
  created_at: number;
  updated_at: number;
  items: OrderItem[];
}

export interface OrderListResponse {
  items: Order[];
  total: number;
}

export interface Payment {
  id: number;
  payment_no: string;
  order_id: number;
  order_no: string;
  user_id: number;
  amount: number;
  status: string;
  channel: string;
  created_at: number;
  updated_at: number;
  paid_at: number;
}

export interface FavoriteItem {
  product_id: number;
  name: string;
  description: string;
  price: number;
  category_id: number;
  image_url: string;
  status: number;
  favorited_at: number;
  available: boolean;
  unavailable_reason: string;
}

export interface FavoriteListResponse {
  items: FavoriteItem[];
  total: number;
}
