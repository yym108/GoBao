// GoBao 公开只读接口压测脚本（k6）。
// 仅打无需鉴权、无副作用的读接口，安全不污染数据；用于观察网关 RED 指标与瓶颈。
// 运行：k6 run scripts/loadtest.js   （可用 BASE 覆盖网关地址）
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:18000';
const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    read_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 30 }, // 预热加压
        { duration: '30s', target: 80 }, // 持续高并发
        { duration: '10s', target: 0 },  // 收尾降压
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],      // 错误率 < 1%
    http_req_duration: ['p(95)<500'],    // P95 < 500ms
  },
};

// 公开只读接口集合，随机命中以模拟真实浏览流量。
const endpoints = [
  '/api/v1/products?page=1&page_size=10',
  '/api/v1/products?page=1&page_size=10&category_id=2',
  '/api/v1/product-groups?page=1&page_size=20',
  '/api/v1/categories',
];

export default function () {
  const url = BASE + endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(url);
  const ok = check(res, { 'status is 200': (r) => r.status === 200 });
  errorRate.add(!ok);
}