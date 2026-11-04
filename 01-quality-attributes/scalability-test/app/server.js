const http = require('http');

const PORT = process.env.PORT || 3000;

// Giả lập Cơ sở dữ liệu và Connection Pool
const DB_POOL = {
  maxConnections: 20,
  activeConnections: 0,
};

// Giả lập dữ liệu sản phẩm trong DB (Read side)
const products = Array.from({ length: 50 }, (_, i) => ({
  id: `PROD-${i + 1}`,
  name: `Laptop High-Performance Model #${i + 1}`,
  price: 999 + i * 20,
  stock: 100
}));

// Giả lập bảng lưu đơn hàng (Write side)
const orders = [];

// Helper giả lập độ trễ truy vấn Database có tính giới hạn Connection Pool
async function simulateDbQuery(queryType, workDelayMs = 20) {
  if (DB_POOL.activeConnections >= DB_POOL.maxConnections) {
    // Khi vượt quá giới hạn connection pool, truy vấn bị nghẽn (Queued)
    const queueDelay = Math.floor(Math.random() * 80) + 100;
    await new Promise((resolve) => setTimeout(resolve, queueDelay));
  }

  DB_POOL.activeConnections++;
  try {
    await new Promise((resolve) => setTimeout(resolve, workDelayMs));
  } finally {
    DB_POOL.activeConnections = Math.max(0, DB_POOL.activeConnections - 1);
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // 1. Endpoint ĐỌC (Read-intensive): GET /api/products
  if (req.url === '/api/products' && req.method === 'GET') {
    try {
      await simulateDbQuery('SELECT', 15);
      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        count: products.length,
        data: products
      }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: 'DB Connection Timeout' }));
    }
  }

  // 2. Endpoint GHI (Write-intensive): POST /api/orders
  if (req.url === '/api/orders' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const { productId, quantity, customerEmail } = parsed;

        if (!productId || !quantity) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Missing required order fields' }));
        }

        // Ghi dữ liệu đòi hỏi Transaction lock và I/O lâu hơn
        await simulateDbQuery('INSERT', 45);

        const newOrder = {
          orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          productId,
          quantity,
          customerEmail: customerEmail || 'guest@example.com',
          createdAt: new Date().toISOString()
        };
        orders.push(newOrder);

        res.statusCode = 201;
        res.end(JSON.stringify({
          success: true,
          message: 'Order created successfully',
          data: newOrder
        }));
      } catch (err) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Database Pool Exhausted or Invalid Payload' }));
      }
    });
    return;
  }

  // 3. Health Check
  if (req.url === '/health' && req.method === 'GET') {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      status: 'UP',
      activeDbConnections: DB_POOL.activeConnections,
      totalOrders: orders.length
    }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`[Scalability Benchmark Server] Running on http://localhost:${PORT}`);
});
