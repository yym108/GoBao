import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="page">
      <div className="card">
        <h2>页面不存在</h2>
        <p className="muted">请返回首页或商品页继续演示。</p>
        <div className="inline-actions">
          <Link className="button button--primary" to="/">
            返回首页
          </Link>
          <Link className="button button--secondary" to="/products">
            去商品页
          </Link>
        </div>
      </div>
    </div>
  );
}
