import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAddresses } from '../api/addresses';
import { fetchFavorites } from '../api/favorites';
import { fetchOrders } from '../api/orders';
import { useAuth } from '../auth/useAuth';
import { PageTitle } from '../components/PageTitle';
import { resolveEntryCountLabel, resolveProfileSummary, type ProfileEntryMetric } from '../lib/profileSummary.ts';

/**
 * 个人中心首页入口定义。
 * metric 指明该入口在卡片右下角展示哪一项计数，null 表示无计数、回退为进入提示。
 */
const profileEntries: { title: string; desc: string; to: string; metric: ProfileEntryMetric }[] = [
  {
    title: '账户中心',
    desc: '管理头像、昵称与密码等个人账户信息。',
    to: '/profile/account',
    metric: null,
  },
  {
    title: '我的订单',
    desc: '查看下单记录、订单状态与后续售后入口。',
    to: '/profile/orders',
    metric: 'orders',
  },
  {
    title: '我的收藏',
    desc: '保留你感兴趣的设备与配件，便于后续继续比较。',
    to: '/profile/favorites',
    metric: 'favorites',
  },
  {
    title: '地址管理',
    desc: '统一维护收货地址，为后续下单与履约流程预留入口。',
    to: '/profile/addresses',
    metric: 'addresses',
  },
];

/**
 * 个人页只展示当前用户真正需要看到的信息与常用入口，
 * 避免把会话字段、内部编号或联调说明直接暴露给终端用户。
 */
export function ProfilePage() {
  const { user, session } = useAuth();
  const [summary, setSummary] = useState({
    orderCount: 0,
    favoriteCount: 0,
    addressCount: 0,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchOrders(), fetchFavorites(), fetchAddresses()])
      .then(([orders, favorites, addresses]) => {
        if (cancelled) {
          return;
        }
        setSummary({
          orderCount: orders.total ?? 0,
          favoriteCount: favorites.total ?? 0,
          addressCount: addresses.addresses.length,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setSummary({
          orderCount: 0,
          favoriteCount: 0,
          addressCount: 0,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!user || !session) {
    return (
      <div className="status status--error">
        当前没有可展示的登录用户信息，请先 <Link to="/login">登录</Link>。
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageTitle
        title="个人页"
        desc="查看你的账户入口、常用操作与当前购物链路数据概览。"
      />

      <section className="hero">
        <article className="card card--strong hero__panel">
          <div className="hero__eyebrow">账户中心</div>
          <div className="profile-hero__identity">
            <div
              aria-hidden="true"
              className="profile-hero__avatar"
              style={user.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
            />
            <div className="profile-hero__copy">
              <h1>{user.nickname}</h1>
              <div className="muted">{resolveProfileSummary(summary)}</div>
            </div>
          </div>
        </article>

        <div className="grid">
          {profileEntries.map((entry) => (
            <Link key={entry.title} to={entry.to} className="card">
              <div className="stack">
                <strong>{entry.title}</strong>
                <div className="muted">{entry.desc}</div>
                <div className="muted">{resolveEntryCountLabel(summary, entry.metric)} →</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
