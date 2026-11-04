import http from 'k6/http';
import { check, sleep } from 'k6';

// Kịch bản 2: Stress Test
// Mục tiêu: Tăng tải dần dần vượt quá mức thông thường để tìm Điểm gãy (Breaking Point)
// và quan sát hiện tượng cạn kiệt Connection Pool & tăng vọt độ trễ.
export const options = {
  stages: [
    { duration: '15s', target: 20 },  // Giai đoạn 1: Khởi động lên 20 VUs
    { duration: '30s', target: 80 },  // Giai đoạn 2: Tăng tải lên 80 VUs
    { duration: '30s', target: 200 }, // Giai đoạn 3: Đẩy kịch trần lên 200 VUs (Tìm điểm gãy)
    { duration: '15s', target: 0 },   // Hạ nhiệt về 0
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],    // Tỷ lệ lỗi cho phép dưới 10% khi stress
    http_req_duration: ['p(95)<1500'], // p95 dưới 1.5s
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export default function () {
  // Kết hợp cả đọc và ghi ngẫu nhiên
  const isWrite = Math.random() < 0.4; // 40% ghi, 60% đọc

  if (isWrite) {
    const payload = JSON.stringify({
      productId: `PROD-${Math.floor(Math.random() * 50) + 1}`,
      quantity: Math.floor(Math.random() * 5) + 1,
      customerEmail: `stress_${__VU}@test.vn`,
    });

    const res = http.post(`${BASE_URL}/api/orders`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    check(res, {
      'POST /orders success': (r) => r.status === 201,
    });
  } else {
    const res = http.get(`${BASE_URL}/api/products`);
    check(res, {
      'GET /products success': (r) => r.status === 200,
    });
  }

  sleep(0.2);
}
