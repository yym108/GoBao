// 下单链路并发压测脚本（k6）。
//
// 验证目标：
//   - 一致性：高并发下「成功下单数 == 初始库存 − 最终库存」，且库存不超卖（不为负）。
//   - 吞吐/延迟：有效下单 QPS、P95/P99 延迟、错误率。
//   - 稳定性/容量：阶梯加压找拐点（配合 Prometheus 观测各服务）。
//
// 链路：POST /api/v1/orders（JWT）→ 幂等(userID:requestID) → 读商品快照前置检查
//       → 库存 CAS 乐观锁扣减（重试 3 次，库存不足判 Aborted）→ 落订单。
//   HTTP 201 成功 / 409 库存不足或 CAS 冲突或重复请求 / 412 不可售 / 400 参数错。
//
// 通过环境变量配置（见 README）：
//   SCENARIO=consistency|capacity  BASE_URL  PRODUCT_ID  USERS  VUS  ITERATIONS
//   START_RATE  MAX_VUS

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import exec from 'k6/execution';

// ── 运行参数（带默认值）──
const BASE = __ENV.BASE_URL || 'http://localhost:18000';
const PRODUCT_ID = Number(__ENV.PRODUCT_ID || 1004001); // 目标商品（默认 AirPods Pro 2）
const USERS = Number(__ENV.USERS || 50); // 预先注册的用户池规模
const SCENARIO = __ENV.SCENARIO || 'consistency';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── 自定义业务指标 ──
const ordersSuccess = new Counter('orders_success'); // 201 成功下单
const ordersConflict = new Counter('orders_conflict'); // 409 库存不足 / CAS 冲突 / 重复
const ordersFailed = new Counter('orders_failed'); // 其他非预期失败（412/400/5xx）

// 把 200/201/409/412 都视为「预期状态」，避免 k6 把正常的库存抢不到计入 http_req_failed。
// 409：CAS 冲突或重复；412：前置快照判定缺货。
http.setResponseCallback(http.expectedStatuses(200, 201, 409, 412));

// ── 场景配置 ──
// consistency：固定发起 ITERATIONS 个请求争抢有限库存，重点校验不超卖与账平。
// capacity：到达率阶梯递增，重点找吞吐/延迟拐点。
export const options =
  SCENARIO === 'capacity'
    ? {
        scenarios: {
          capacity: {
            executor: 'ramping-arrival-rate',
            startRate: Number(__ENV.START_RATE || 20),
            timeUnit: '1s',
            preAllocatedVUs: Number(__ENV.VUS || 100),
            maxVUs: Number(__ENV.MAX_VUS || 800),
            stages: [
              { target: 50, duration: '30s' },
              { target: 100, duration: '30s' },
              { target: 200, duration: '30s' },
              { target: 400, duration: '30s' },
              { target: 600, duration: '30s' },
            ],
          },
        },
        thresholds: {
          orders_failed: ['count<1'], // 不应出现 5xx/412 等非预期失败
          http_req_duration: ['p(95)<1500'],
        },
      }
    : {
        scenarios: {
          consistency: {
            executor: 'shared-iterations',
            vus: Number(__ENV.VUS || 100),
            iterations: Number(__ENV.ITERATIONS || 2000),
            maxDuration: '120s',
          },
        },
        thresholds: {
          orders_failed: ['count<1'],
        },
      };

// register 注册并登录一个用户、创建默认地址，返回下单所需的 token 与 addressId。
function register(index) {
  const email = `lt_${Date.now()}_${SCENARIO}_${index}@loadtest.local`;
  const password = 'Passw0rd!';

  http.post(`${BASE}/api/v1/auth/register`, JSON.stringify({ email, password, nickname: `lt${index}` }), {
    headers: JSON_HEADERS,
  });

  const loginRes = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email, password }), {
    headers: JSON_HEADERS,
  });
  const token = loginRes.json('access_token');
  if (!token) {
    throw new Error(`用户 ${index} 登录失败：${loginRes.status} ${loginRes.body}`);
  }

  const authHeaders = { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
  const addrRes = http.post(
    `${BASE}/api/v1/addresses`,
    JSON.stringify({
      receiver_name: `收货人${index}`,
      receiver_phone: '13800000000',
      province: '广东',
      city: '深圳',
      district: '南山',
      address_line: '压测地址 1 号',
      postal_code: '518000',
      is_default: true,
    }),
    { headers: authHeaders },
  );
  const addressId = addrRes.json('address.id');
  if (!addressId) {
    throw new Error(`用户 ${index} 建地址失败：${addrRes.status} ${addrRes.body}`);
  }

  return { token, addressId };
}

// readStock 读取目标商品当前库存（用于压测前后对账）。
function readStock() {
  const res = http.get(`${BASE}/api/v1/products/${PRODUCT_ID}`);
  return res.json('product.stock_quantity');
}

// setup 在压测开始前准备用户池并记录初始库存，返回值会传给每个 VU。
export function setup() {
  const users = [];
  for (let i = 0; i < USERS; i++) {
    users.push(register(i));
  }
  const initialStock = readStock();
  console.log(`[setup] 用户池=${users.length} 商品=${PRODUCT_ID} 初始库存=${initialStock} 场景=${SCENARIO}`);
  return { users, initialStock };
}

// default 是每次迭代执行的下单逻辑。
export default function (data) {
  // VU 轮询复用用户池；下单层无每用户限购，仅需 request_id 唯一即可不撞幂等。
  const user = data.users[(exec.vu.idInTest - 1) % data.users.length];
  const requestId = `lt-${exec.scenario.iterationInTest}-${exec.vu.idInTest}-${Date.now()}`;

  const res = http.post(
    `${BASE}/api/v1/orders`,
    JSON.stringify({ request_id: requestId, product_id: PRODUCT_ID, quantity: 1, address_id: user.addressId }),
    { headers: { ...JSON_HEADERS, Authorization: `Bearer ${user.token}` }, tags: { name: 'create_order' } },
  );

  if (res.status === 201) {
    ordersSuccess.add(1);
  } else if (res.status === 409 || res.status === 412) {
    // 409：CAS 冲突 / 重复；412：前置快照判定缺货。两者都是「库存抢不到」的预期结果。
    ordersConflict.add(1);
  } else {
    ordersFailed.add(1);
    if (__ENV.DEBUG && res.status >= 500) {
      console.log(`[5xx] status=${res.status} body=${res.body}`);
    }
  }

  // 任何 5xx 视为服务端异常，单独记入 check 以便观察。
  check(res, { '无服务端错误(<500)': (r) => r.status < 500 });
}

// teardown 在压测结束后读取最终库存，输出与初始库存的差额，便于和成功下单数对账。
export function teardown(data) {
  const finalStock = readStock();
  if (finalStock === undefined || finalStock === null) {
    console.log('[teardown] 最终库存读取失败，请以 reconcile.sh 的对账结果为准');
    return;
  }
  const deducted = data.initialStock - finalStock;
  console.log(
    `[teardown] 初始库存=${data.initialStock} 最终库存=${finalStock} 实扣=${deducted}` +
      `（应等于成功下单数 orders_success；最终库存应 >= 0 表示未超卖）`,
  );
}
