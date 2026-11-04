const http = require('http');

const PORT = process.env.PORT || 3000;
const products = [
  { id: 'p1', name: 'MacBook Pro M3', price: 2199, stock: 15 },
  { id: 'p2', name: 'Dell XPS 15', price: 1799, stock: 8 },
  { id: 'p3', name: 'ThinkPad X1 Carbon', price: 1599, stock: 22 }
];

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/health' && req.method === 'GET') {
    return res.end(JSON.stringify({ status: 'UP', service: 'catalog-service' }));
  }

  if (req.url === '/catalog/products' && req.method === 'GET') {
    return res.end(JSON.stringify({ success: true, count: products.length, data: products }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Route not found in Catalog Service' }));
});

server.listen(PORT, () => {
  console.log(`[Catalog Service] Running on port ${PORT}`);
});
