const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

function request(url, method = 'GET', bodyObj = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      } : {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runClusterDemo() {
  console.log('='.repeat(78));
  console.log('☸️  KHỞI CHẠY CỤM 4 MICROSERVICES (AUTH, CATALOG, ORDER, PAYMENT) & RED METRICS');
  console.log('='.repeat(78));

  const servicesConfig = [
    { name: 'auth-service', port: 4001, dir: 'auth-service' },
    { name: 'catalog-service', port: 4002, dir: 'catalog-service' },
    { name: 'payment-service', port: 4004, dir: 'payment-service' },
    {
      name: 'order-service',
      port: 4003,
      dir: 'order-service',
      extraEnv: {
        CATALOG_SERVICE_URL: 'http://localhost:4002',
        PAYMENT_SERVICE_URL: 'http://localhost:4004'
      }
    }
  ];

  const procs = [];

  try {
    // 1. Khởi động đồng thời 4 Microservices độc lập
    for (const svc of servicesConfig) {
      const scriptPath = path.join(__dirname, 'services', svc.dir, 'index.js');
      const child = spawn(process.execPath, [scriptPath], {
        env: { ...process.env, PORT: String(svc.port), ...(svc.extraEnv || {}) },
        stdio: 'pipe'
      });
      child.stdout.on('data', d => console.log(`  ${d.toString().trim()}`));
      procs.push(child);
    }

    await new Promise(r => setTimeout(r, 800));

    // 2. Bước 1: Xác thực tại Auth Service (Bounded Context 1)
    console.log('\n--- BƯỚC 1: ĐĂNG NHẬP QUA AUTH SERVICE (Port 4001) ---');
    const loginRes = await request('http://localhost:4001/auth/login', 'POST');
    console.log(`  Status: ${loginRes.status} | Body: ${loginRes.text}`);

    // 3. Bước 2: Xem danh mục tại Catalog Service (Bounded Context 2)
    console.log('\n--- BƯỚC 2: TRUY VẤN SẢN PHẨM TẠI CATALOG SERVICE (Port 4002) ---');
    const catRes = await request('http://localhost:4002/catalog/products', 'GET');
    console.log(`  Status: ${catRes.status} | Body: ${catRes.text}`);

    // 4. Bước 3: Đặt hàng tại Order Service (Bounded Context 3 -> Gọi sang Catalog & Payment)
    console.log('\n--- BƯỚC 3: ĐẶT HÀNG TẠI ORDER SERVICE (Port 4003 -> Giao tiếp Catalog & Payment) ---');
    const ordRes = await request('http://localhost:4003/orders', 'POST', { productId: 'p1', quantity: 2 });
    console.log(`  Status: ${ordRes.status} | Body: ${ordRes.text}`);

    // 5. Bước 4: Thu thập chỉ số RED Metrics chuẩn Prometheus từ Order Service
    console.log('\n--- BƯỚC 4: PROMETHEUS SCRAPE CHỈ SỐ RED METRICS TỪ ORDER SERVICE (/metrics) ---');
    const metricsRes = await request('http://localhost:4003/metrics', 'GET');
    console.log(metricsRes.text.trim());

    console.log('\n' + '='.repeat(78));
    console.log('📊 DASHBOARD GRAFANA & PROMETHEUS RED METRICS ĐÃ SẴN SÀNG TRỰC QUAN!');
    console.log('='.repeat(78));
    console.log('👉 Mở Dashboard Grafana (Web UI):  http://localhost:4003/dashboard');
    console.log('👉 Xem dữ liệu thô Prometheus:     http://localhost:4003/metrics');
    console.log('👉 Kiểm tra danh mục Đơn hàng:     http://localhost:4003/orders');
    console.log('\n⚡ Đang tự động giả lập request mua hàng mỗi 2.5s để vẽ đồ thị thời gian thực...');
    console.log('💡 Bạn có thể mở ngay trình duyệt tại http://localhost:4003/dashboard để xem!');
    console.log('🛑 Nhấn Ctrl+C để dừng cụm Microservices khi xem xong.');
    console.log('='.repeat(78));

    // Vòng lặp gửi traffic liên tục để dashboard có dữ liệu động
    const trafficTimer = setInterval(async () => {
      try {
        await request('http://localhost:4003/orders', 'POST', { productId: 'p1', quantity: 1 });
      } catch (e) {}
    }, 2500);

    const cleanup = () => {
      clearInterval(trafficTimer);
      procs.forEach(p => p.kill());
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Giữ tiến trình sống để phục vụ Dashboard
    await new Promise(() => {});

  } catch (err) {
    console.error('Lỗi cụm microservices:', err);
    procs.forEach(p => p.kill());
  }
}

runClusterDemo();
