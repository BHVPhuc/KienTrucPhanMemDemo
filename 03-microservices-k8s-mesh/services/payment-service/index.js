const http = require('http');

const PORT = process.env.PORT || 3000;
const payments = [];

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/health' && req.method === 'GET') {
    return res.end(JSON.stringify({ status: 'UP', service: 'payment-service' }));
  }

  if (req.url === '/payments/charge' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const paymentRecord = {
          transactionId: `TX-${Date.now()}`,
          orderId: payload.orderId || 'ORD-DEFAULT',
          amount: payload.amount || 199,
          status: 'SETTLED',
          timestamp: new Date().toISOString()
        };
        payments.push(paymentRecord);

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, payment: paymentRecord }));
      } catch (err) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Route not found in Payment Service' }));
});

server.listen(PORT, () => {
  console.log(`[Payment Service] Running on port ${PORT}`);
});
