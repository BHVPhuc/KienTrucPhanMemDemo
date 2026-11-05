const http = require('http');
const { ReadDatabase } = require('../shared/read-db');
const { EventStore } = require('../shared/event-store');
const { WalletProjector } = require('../projector/projector');

const PORT = process.env.PORT || 5002;
const readDb = new ReadDatabase();
const eventStore = new EventStore();
const projector = new WalletProjector(readDb);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  res.setHeader('Content-Type', 'application/json');

  try {
    // 1. QUERY: LẤY CHI TIẾT TỔNG HỢP VÍ (GET /api/wallets/:id) -> O(1) TỪ MATERIALIZED VIEW
    const walletMatch = pathname.match(/^\/api\/wallets\/([^/]+)$/);
    if (walletMatch && req.method === 'GET') {
      const walletId = walletMatch[1];
      const view = readDb.getWallet(walletId);

      if (!view) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: `Không tìm thấy ví ${walletId} trong Read Database` }));
      }

      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        source: 'Read Model (Materialized View in read-model.db)',
        data: view
      }));
    }

    // 2. QUERY: DANH SÁCH TẤT CẢ CÁC VÍ (GET /api/wallets)
    if (pathname === '/api/wallets' && req.method === 'GET') {
      const wallets = readDb.getAllWallets();
      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        total: wallets.length,
        data: wallets
      }));
    }

    // 3. QUERY: NHẬT KÝ KIỂM TOÁN TẤT CẢ GIAO DỊCH (GET /api/wallets/:id/audit)
    const auditMatch = pathname.match(/^\/api\/wallets\/([^/]+)\/audit$/);
    if (auditMatch && req.method === 'GET') {
      const walletId = auditMatch[1];
      const logs = readDb.getAuditLogs(walletId);

      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        walletId,
        totalEvents: logs.length,
        auditTrail: logs
      }));
    }

    // 4. ADMIN QUERY / ACTION: EVENT REPLAY TÁI TẠO READ DATABASE (POST /api/admin/replay)
    if (pathname === '/api/admin/replay' && req.method === 'POST') {
      const startTime = Date.now();
      const replayedCount = projector.replayAll(eventStore);
      const durationMs = Date.now() - startTime;

      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        message: 'Hoàn tất Replay toàn bộ sự kiện từ Event Store sang Read DB',
        totalEventsReplayed: replayedCount,
        durationMs
      }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Route not found on Query Service: ${req.method} ${pathname}` }));

  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Query Service Error', details: err.message }));
  }
});

function startServer(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[Query Service (Read Side)]   Running on http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, server, readDb, projector };
