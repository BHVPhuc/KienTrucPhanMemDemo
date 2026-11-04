const http = require('http');

const PORT = process.env.PORT || 3000;
const users = [
  { id: 'u1', username: 'alice', email: 'alice@example.com' },
  { id: 'u2', username: 'bob', email: 'bob@example.com' }
];

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/health' && req.method === 'GET') {
    return res.end(JSON.stringify({ status: 'UP', service: 'auth-service' }));
  }

  if (req.url === '/auth/login' && req.method === 'POST') {
    return res.end(JSON.stringify({
      token: 'jwt-mock-token-abcxyz',
      user: users[0]
    }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Route not found in Auth Service' }));
});

server.listen(PORT, () => {
  console.log(`[Auth Service] Running on port ${PORT}`);
});
