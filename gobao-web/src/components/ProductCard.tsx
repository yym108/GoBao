import { Link } from 'react-router-dom';
import { formatPrice } from '../lib/format';
import { isProductOnSale, resolveProductAvailabilityMessage } from '../lib/productAvailability.ts';
import type { Category, ProductListItem } from '../lib/types';

function resolveCategoryName(categories: Category[], categoryId: number): string {
  return categories.find((item) => item.id === categoryId)?.name ?? `类目 ${categoryId}`;
}

export function ProductCard({
  product,
  categories,
}: {
  product: ProductListItem;
  categories: Category[];
}) {
  const onSale = isProductOnSale(product);
  const availabilityMessage = resolveProductAvailabilityMessage(product);
  const displayImageURL = product.cover_image_url || product.image_url;

  return (
    <article className="card product-card">
      <div
        className={`product-card__image${displayImageURL ? ' product-card__image--photo' : ''}`}
        style={displayImageURL ? { backgroundImage: `url(${displayImageURL})` } : undefined}
      >
        {!displayImageURL ? <span>宝</span> : null}
      </div>

      <div className="stack">
        <div className="badge-row">
          <span className="badge">{resolveCategoryName(categories, product.category_id)}</span>
          {!onSale ? <span className="chip chip--placeholder">{availabilityMessage}</span> : null}
        </div>
        <div>
          <h3>{product.name}</h3>
          <p className="muted">{product.description || '当前商品暂无补充描述。'}</p>
        </div>
        <div className="price">{formatPrice(product.price)}</div>
      </div>

      <div className="inline-actions">
        <Link className="button button--primary" to={`/products/${product.id}`}>
          查看详情
        </Link>
      </div>
    </article>
  );
}
