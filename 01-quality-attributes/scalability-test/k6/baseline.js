import http from 'k6/http';
import { check, sleep } from 'k6';

// Kịch bản 1: Baseline Test
// Mục tiêu: Chạy với lượng tải ổn định thông thường để đo chỉ số chuẩn của hệ thống (Baseline Throughput & Latency)
export const options = {
  vus: 10, // 10 người dùng ảo đồng thời
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // Tỷ lệ lỗi < 1%
    http_req_duration: ['p(95)<300'], // 95% số request hoàn tất dưới 300ms
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export default function () {
  // 1. Thao tác Đọc: Lấy danh sách sản phẩm
  const resProducts = http.get(`${BASE_URL}/api/products`);
  check(resProducts, {
    'GET /products status is 200': (r) => r.status === 200,
    'GET /products latency < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(0.5);

  // 2. Thao tác Ghi: Tạo đơn hàng
  const payload = JSON.stringify({
    productId: 'PROD-1',
    quantity: 1,
    customerEmail: 'k6-user@perf.test',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const resOrder = http.post(`${BASE_URL}/api/orders`, payload, params);
  check(resOrder, {
    'POST /orders status is 201': (r) => r.status === 201,
  });

  sleep(1);
}
