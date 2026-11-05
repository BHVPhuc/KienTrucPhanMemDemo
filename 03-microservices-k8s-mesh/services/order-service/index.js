const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:4002';
const PAYMENT_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:4004';
const DASHBOARD_HTML_PATH = path.join(__dirname, 'dashboard.html');

const orders = [];

// Bộ đếm chỉ số RED Metrics (Rate, Errors, Duration) cho Prometheus
const redMetrics = {
  requestsTotal: 0,
  errorsTotal: 0,
  durationMsSum: 0
};

function httpRequestJson(url, method = 'GET', bodyObj = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const payload = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      } : {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const server = http.createServer((req, res) => {
  const startTime = Date.now();
  redMetrics.requestsTotal++;

  // Phục vụ giao diện Grafana RED Metrics Dashboard trực quan
  if ((req.url === '/' || req.url === '/dashboard') && req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (fs.existsSync(DASHBOARD_HTML_PATH)) {
      return res.end(fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8'));
    }
  }

  // Endpoint xuất dữ liệu JSON cho Dashboard polling
  if (req.url === '/metrics/json' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(redMetrics));
  }

  // Giả lập lỗi 500 để kiểm thử biểu đồ Error Rate trên Grafana
  if (req.url === '/simulate-error' && req.method === 'POST') {
    redMetrics.errorsTotal++;
    redMetrics.durationMsSum += (Date.now() - startTime);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Internal Server Error (Simulated 500 for RED metrics demo)' }));
  }

  // Endpoint xuất Prometheus RED Metrics
  if (req.url === '/metrics' && req.method === 'GET') {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    return res.end([
      '# HELP http_requests_total Total number of HTTP requests (Rate)',
      '# TYPE http_requests_total counter',
      `http_requests_total{service="order-service"} ${redMetrics.requestsTotal}`,
      '# HELP http_request_errors_total Total number of HTTP 5xx errors (Errors)',
      '# TYPE http_request_errors_total counter',
      `http_request_errors_total{service="order-service"} ${redMetrics.errorsTotal}`,
      '# HELP http_request_duration_ms_sum Total duration of HTTP requests in ms (Duration)',
      '# TYPE http_request_duration_ms_sum counter',
      `http_request_duration_ms_sum{service="order-service"} ${redMetrics.durationMsSum}`
    ].join('\n') + '\n');
  }

  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/health' && req.method === 'GET') {
    redMetrics.durationMsSum += (Date.now() - startTime);
    return res.end(JSON.stringify({ status: 'UP', service: 'order-service', totalOrders: orders.length }));
  }

  if (req.url === '/orders' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const productId = payload.productId || 'p1';
        const quantity = payload.quantity || 1;

        // 1. Gọi Catalog Service kiểm tra sản phẩm và giá
        const catalogRes = await httpRequestJson(`${CATALOG_URL}/catalog/products`, 'GET');
        const product = (catalogRes.data.data || []).find(p => p.id === productId) || { id: productId, name: 'Default Item', price: 199 };
        const totalAmount = product.price * quantity;

        // 2. Gọi Payment Service thực hiện thanh toán
        const orderId = `ORD-${Date.now()}`;
        const paymentRes = await httpRequestJson(`${PAYMENT_URL}/payments/charge`, 'POST', {
          orderId,
          amount: totalAmount
        });

        const newOrder = {
          orderId,
          productId: product.id,
          productName: product.name,
          quantity,
          totalAmount,
          paymentTransactionId: paymentRes.data.payment?.transactionId,
          status: 'PAID_AND_CONFIRMED',
          createdAt: new Date().toISOString()
        };
        orders.push(newOrder);

        redMetrics.durationMsSum += (Date.now() - startTime);
        res.statusCode = 201;
        res.end(JSON.stringify({ success: true, order: newOrder }));
      } catch (err) {
        redMetrics.errorsTotal++;
        redMetrics.durationMsSum += (Date.now() - startTime);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Inter-service communication failed', details: err.message }));
      }
    });
    return;
  }

  if (req.url === '/orders' && req.method === 'GET') {
    redMetrics.durationMsSum += (Date.now() - startTime);
    return res.end(JSON.stringify({ success: true, count: orders.length, orders }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Route not found in Order Service' }));
});

server.listen(PORT, () => {
  console.log(`[Order Service] Running on port ${PORT}`);
});
