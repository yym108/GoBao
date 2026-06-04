import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import type { Category } from '../lib/types';

type StoreMenu = {
  label: string;
  categoryId?: number;
  columns: Array<{
    title: string;
    emphasis?: boolean;
    items: string[];
  }>;
};

const leadingStoreMenus: StoreMenu[] = [
  {
    label: '商店',
    columns: [
      {
        title: '选购商店',
        emphasis: true,
        items: ['选购最新产品', '按系列浏览', '本周推荐', '教育优惠'],
      },
      {
        title: '快速入口',
        items: ['节日送礼', '官方翻新', '企业采购', '门店体验'],
      },
      {
        title: '服务支持',
        items: ['帮助选购', '配送方式', '分期付款', 'Trade In'],
      },
    ],
  },
];

const trailingStoreMenus: StoreMenu[] = [
  {
    label: '家居',
    columns: [
      {
        title: '探索家居',
        emphasis: true,
        items: ['家庭娱乐', '智能控制', '空间音频', '家庭中枢'],
      },
      {
        title: '空间场景',
        items: ['客厅影院', '卧室音响', '全屋控制', '儿童房陪伴'],
      },
      {
        title: '更多选择',
        items: ['搭配建议', '服务方案', '官方内容', '家庭共享'],
      },
    ],
  },
  {
    label: '配件',
    columns: [
      {
        title: '精选配件',
        emphasis: true,
        items: ['MagSafe', '电源与线缆', '键盘鼠标', '收纳保护'],
      },
      {
        title: '搭配购买',
        items: ['桌面套装', '出差随行', '创作桌面', '礼赠推荐'],
      },
      {
        title: '官方服务',
        items: ['兼容性说明', '新品上架', '库存提醒', '购买帮助'],
      },
    ],
  },
  {
    label: '支持',
    columns: [
      {
        title: '获取支持',
        emphasis: true,
        items: ['订单帮助', '配送追踪', '保修与维修', '账户问题'],
      },
      {
        title: '常见主题',
        items: ['登录与账户', '付款与发票', '设备设置', '售后政策'],
      },
      {
        title: '联系渠道',
        items: ['在线客服', '电话支持', '到店咨询', '反馈建议'],
      },
    ],
  },
];

/**
 * 将类目信息转换为带下拉子菜单的顶部导航项。
 * 顶部导航的类目入口已写死，不再与后端类目动态同步；这里只需类目的 id 与 name。
 */
function buildCategoryMenu(category: Pick<Category, 'id' | 'name'>): StoreMenu {
  return {
    label: category.name,
    categoryId: category.id,
    columns: [
      {
        title: `探索${category.name}`,
        emphasis: true,
        items: [`选购${category.name}`, `${category.name} 新品`, `${category.name} 热门款`, `${category.name} 精选推荐`],
      },
      {
        title: '推荐方向',
        items: ['按系列浏览', '对比选择', '使用场景', '搭配购买'],
      },
      {
        title: '服务支持',
        items: ['选购帮助', '配送方式', '分期付款', '售后支持'],
      },
    ],
  };
}

/**
 * 顶部导航的类目入口写死为四个固定产品线，不随后端类目增减而变化。
 * id 对应后端固定种子类目（Mac=1 / iPhone=2 / iPad=3 / 穿戴=4），用于跳转时的类目筛选；
 * 下拉子菜单仍由 buildCategoryMenu 统一生成，内容保持不变。
 */
const categoryStoreMenus: StoreMenu[] = [
  buildCategoryMenu({ id: 1, name: 'Mac' }),
  buildCategoryMenu({ id: 2, name: 'iPhone' }),
  buildCategoryMenu({ id: 3, name: 'iPad' }),
  buildCategoryMenu({ id: 4, name: '穿戴' }),
];

// 完整导航：商店在前，四个固定类目居中，家居 / 配件 / 支持在后；全部为静态结构。
const storeMenus: StoreMenu[] = [...leadingStoreMenus, ...categoryStoreMenus, ...trailingStoreMenus];

export function AppShell() {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<StoreMenu | null>(null);
  const [menuMotion, setMenuMotion] = useState<'opening' | 'switching'>('opening');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  // 统一管理导航浮层的显隐状态，确保下拉面板以全局固定位置展开。
  const openMenu = (menu: StoreMenu) => {
    if (activeMenu?.label === menu.label) {
      return;
    }
    setMenuMotion(activeMenu && activeMenu.label !== menu.label ? 'switching' : 'opening');
    setActiveMenu(menu);
  };

  // 鼠标离开导航区与浮层区后再关闭，避免触发器与面板之间出现悬停断层。
  const closeMenu = () => {
    setActiveMenu(null);
    setMenuMotion('opening');
  };

  // 账号菜单改为以悬停为主，已登录态保留头像跳转个人页，未登录态保留菜单入口。
  const openAccountMenu = () => {
    setAccountMenuOpen(true);
  };

  const closeAccountMenu = () => {
    setAccountMenuOpen(false);
  };

  // 未登录时点击购物车直接转到登录页，减少“先点后报错”的落差。
  const handleCartEntry = () => {
    if (!isAuthenticated) {
      navigate('/login', {
        state: {
          from: '/cart',
          reason: '需要先登录后，才能查看你的购物车。',
        },
      });
      return;
    }
    navigate('/cart');
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <div className="topbar__right">
            <nav className="store-nav" aria-label="商店主导航" onMouseLeave={closeMenu}>
              <NavLink to="/" className="brand brand--icon-only brand--home" aria-label="返回首页">
                <div className="brand__badge brand__badge--placeholder" />
              </NavLink>

              {storeMenus.map((menu) => (
                <div key={menu.label} className="store-nav__item">
                  <button
                    className={`store-nav__trigger${activeMenu?.label === menu.label ? ' store-nav__trigger--active' : ''}`}
                    type="button"
                    aria-expanded={activeMenu?.label === menu.label}
                    onMouseEnter={() => openMenu(menu)}
                    onFocus={() => openMenu(menu)}
                    onClick={() => {
                      // 仅类目入口承担跳转：与首页类目卡、商店标签一致，按 category 进入商店并自动筛选。
                      if (menu.categoryId) {
                        closeMenu();
                        navigate(`/products?category=${menu.categoryId}`);
                      }
                    }}
                  >
                    {menu.label}
                  </button>
                </div>
              ))}

              <div
                className={`mega-menu${activeMenu ? ' mega-menu--open' : ''}${activeMenu ? ` mega-menu--${menuMotion}` : ''}`}
              >
                <div key={activeMenu?.label ?? 'closed'} className="mega-menu__inner">
                  {activeMenu?.columns.map((column, index) => (
                    <section
                      key={column.title}
                      className={column.emphasis ? 'mega-menu__column mega-menu__column--lead' : 'mega-menu__column'}
                      style={{ ['--column-order' as string]: index }}
                    >
                      <h3>{column.title}</h3>
                      <ul>
                        {column.items.map((item) => (
                          <li key={item}>
                            <button className="mega-menu__link" type="button" onClick={() => undefined}>
                              {item}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            </nav>

            <nav className="nav nav--utility">
              <NavLink to="/products" aria-label="搜索商品" className="nav-icon-button">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M10.5 4.75a5.75 5.75 0 1 0 0 11.5a5.75 5.75 0 0 0 0-11.5Zm0-1.5a7.25 7.25 0 1 1 4.58 12.87l4.2 4.2a.75.75 0 1 1-1.06 1.06l-4.2-4.2A7.25 7.25 0 0 1 10.5 3.25Z"
                    fill="currentColor"
                  />
                </svg>
              </NavLink>
              <button type="button" aria-label="购物车" className="nav-icon-button" onClick={handleCartEntry}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4.75 5.25h1.72c.45 0 .84.3.95.73l.37 1.52h10.68a.75.75 0 0 1 .73.93l-1.35 5.52a1.75 1.75 0 0 1-1.7 1.33H9.66a1.75 1.75 0 0 1-1.7-1.33L6.25 6.75H4.75a.75.75 0 0 1 0-1.5Zm4.66 8.5h6.74c.12 0 .22-.08.25-.2l1.05-4.3H8.28l1.13 4.5Zm.59 4.25a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 0 1 0-2.8Zm6.8 0a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 0 1 0-2.8Z"
                    fill="currentColor"
                  />
                </svg>
              </button>

              <div className="account-menu" onMouseEnter={openAccountMenu} onMouseLeave={closeAccountMenu}>
                {isAuthenticated ? (
                  <NavLink
                    to="/profile"
                    aria-label="个人中心"
                    className="nav-avatar-button"
                    onFocus={openAccountMenu}
                  >
                    {user?.avatar_url ? (
                      // 已设置头像时直接展示头像（圆形）
                      <span
                        className="nav-avatar-button__image"
                        style={{ backgroundImage: `url(${user.avatar_url})` }}
                        aria-hidden="true"
                      />
                    ) : (
                      // 未设置头像时回退为默认人像图标
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="8.2" r="3.3" fill="currentColor" />
                        <path
                          d="M6.9 19.25c0-2.78 2.28-5.05 5.1-5.05s5.1 2.27 5.1 5.05v.55H6.9v-.55Z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </NavLink>
                ) : (
                  <button
                    type="button"
                    aria-label="登录与注册菜单"
                    aria-expanded={accountMenuOpen}
                    className="nav-avatar-button"
                    onClick={() => setAccountMenuOpen((current) => !current)}
                    onFocus={openAccountMenu}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="8.2" r="3.3" fill="currentColor" />
                      <path
                        d="M6.9 19.25c0-2.78 2.28-5.05 5.1-5.05s5.1 2.27 5.1 5.05v.55H6.9v-.55Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                )}

                <div className={`account-menu__panel${accountMenuOpen ? ' account-menu__panel--open' : ''}`}>
                  {isAuthenticated ? (
                    <button
                      type="button"
                      className="account-menu__item"
                      onClick={() => {
                        closeAccountMenu();
                        logout();
                      }}
                    >
                      退出登录
                    </button>
                  ) : (
                    <>
                      <NavLink
                        to="/login"
                        className="account-menu__item"
                        onClick={() => {
                          closeAccountMenu();
                        }}
                      >
                        登录
                      </NavLink>
                      <NavLink
                        to="/register"
                        className="account-menu__item"
                        onClick={() => {
                          closeAccountMenu();
                        }}
                      >
                        注册
                      </NavLink>
                    </>
                  )}
                </div>
              </div>
            </nav>
          </div>
        </div>
      </header>

      <main className={isAuthPage ? 'shell shell--auth' : 'shell'}>
        <Outlet />
      </main>
    </>
  );
}
