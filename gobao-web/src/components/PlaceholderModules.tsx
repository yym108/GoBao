const unsupportedModules = [
  ['购物车结算', '按购物车条目逐条生成订单，当前已可直接进入真实结算流程。'],
  ['订单', '订单列表、详情与取消入口都已接入，可直接查看真实交易状态。'],
  ['支付', '支付查询与模拟确认已可联调，当前仅缺真实收银台。'],
  ['地址管理', '地址簿已可用于结算与订单快照，支持新增、编辑、删除与默认地址。'],
  ['收藏', '收藏列表与取消收藏已接入，可直接用于继续选购。'],
  ['评价', '评价能力尚未实现，暂不向前端展示。'],
  ['后台管理', '后台仍以商品与类目写接口为主，管理面板后续继续补齐。'],
];

export function PlaceholderModules() {
  return (
    <div className="placeholder-grid">
      {unsupportedModules.map(([title, desc]) => (
        <article className="card placeholder-card notice--placeholder" key={title}>
          <h3>{title}</h3>
          <p>{desc}</p>
        </article>
      ))}
    </div>
  );
}
