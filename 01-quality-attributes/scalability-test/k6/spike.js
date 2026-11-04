import http from 'k6/http';
import { check, sleep } from 'k6';

// Kịch bản 3: Spike Test
// Mục tiêu: Mô phỏng lưu lượng tăng vọt đột ngột trong thời gian cực ngắn (như mở bán vé concert / Flash Sale 0h)
// để kiểm tra xem hệ thống có bị treo hoàn toàn (crash) hay tự phục hồi được sau đỉnh xung.
export const options = {
  stages: [
    { duration: '10s', target: 5 },   // Bình thường: 5 VUs
    { duration: '10s', target: 250 }, // Đỉnh xung: Nhảy vọt lên 250 VUs trong 10s
    { duration: '15s', target: 250 }, // Duy trì đỉnh xung trong 15s
    { duration: '10s', target: 5 },   // Rớt tải đột ngột về 5 VUs
    { duration: '10s', target: 0 },   // Kết thúc
  ],
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/api/products`);
  check(res, {
    'Spike GET 200': (r) => r.status === 200,
  });
  sleep(0.1);
}
