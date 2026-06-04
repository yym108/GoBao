import { useEffect, useMemo, useState } from 'react';
import { fetchCategories, fetchProducts } from '../api/catalog';
import { PageTitle } from '../components/PageTitle';
import { resolveApiErrorMessage } from '../lib/errors';
import { ProductCard } from '../components/ProductCard';
import type { Category, ProductListItem } from '../lib/types';

export function ProductsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categoryId, setCategoryId] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCategories()
      .then((data) => setCategories(data.items))
      .catch((cause) => {
        setError(resolveApiErrorMessage(cause, '类目加载失败'));
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchProducts({ categoryId, page, pageSize: 12 })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setProducts(data.items);
        setTotal(data.total);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }
        setError(resolveApiErrorMessage(cause, '商品加载失败'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 12)), [total]);

  return (
    <div className="page stack">
      <PageTitle
        title="商品列表"
        desc="按当前 Gateway 已支持的类目与分页接口展示商品。搜索、排序、销量、新品等实验要求能力仍待后端补齐。"
      />

      <section className="card stack">
        <div className="filter-bar">
          <div className="field">
            <label htmlFor="category">类目筛选</label>
            <select
              id="category"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={0}>全部类目</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="notice">
            当前列表接口仅支持类目过滤与分页，不支持前端实验书中的搜索 / 排序 / 销量筛选。
          </div>

          <button className="button button--secondary" type="button" onClick={() => window.location.reload()}>
            刷新
          </button>
        </div>

        <div className="chips">
          <span className="chip chip--active">总商品数 {total}</span>
          <span className="chip">当前页 {page}</span>
          <span className="chip">总页数 {totalPages}</span>
        </div>
      </section>

      {error ? <div className="status status--error">{error}</div> : null}
      {loading ? <div className="loading">正在加载商品列表...</div> : null}

      {!loading && !products.length ? <div className="empty">当前筛选条件下没有商品。</div> : null}

      <section className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} categories={categories} />
        ))}
      </section>

      <section className="card">
        <div className="inline-actions">
          <button className="button button--ghost" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            上一页
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  );
}
