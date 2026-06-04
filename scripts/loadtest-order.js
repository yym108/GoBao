// GoBao 正常下单流程压测脚本（k6）。
// 打 POST /api/v1/orders 写路径：网关解析地址 → 订单服务幂等+扣库存 CAS+落库+发事件。
// 需先准备好 LT_TOKEN / LT_PID / LT_ADDR（见 scripts 中的准备步骤），并把商品库存调大避免缺货。
// 运行：source /tmp/gobao_lt.env && k6 run -e TOKEN=$LT_TOKEN -e PID=$LT_PID -e ADDR=$LT_ADDR scripts/loadtest-order.js
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:18000';
const TOKEN = __ENV.TOKEN;
// 支持单商品(PID)或多商品(PIDS=逗号分隔)。多商品时每次随机命中，模拟分散到不同商品的真实流量。
const PIDS = (__ENV.PIDS ? __ENV.PIDS.split(',') : [__ENV.PID]).map(Number).filter((n) => n > 0);
const ADDR = Number(__ENV.ADDR);
const created = new Rate('order_created');

const PEAK = Number(__ENV.PEAK || 40); // 峰值并发，可用 PEAK 覆盖

export const options = {
  scenarios: {
    place_order: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: Math.round(PEAK / 2) }, // 加压
        { duration: '20s', target: PEAK },                 // 持续并发下单
        { duration: '5s', target: 0 },                     // 收尾
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function () {
  // request_id 必须每次唯一，否则会被订单幂等去重。
  const requestId = `lt-${__VU}-${__ITER}-${Date.now()}`;
  const pid = PIDS[Math.floor(Math.random() * PIDS.length)];
  const res = http.post(
    `${BASE}/api/v1/orders`,
    JSON.stringify({ request_id: requestId, product_id: pid, quantity: 1, address_id: ADDR }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` } },
  );
  const ok = check(res, { 'order created 201': (r) => r.status === 201 });
  created.add(ok);
}
