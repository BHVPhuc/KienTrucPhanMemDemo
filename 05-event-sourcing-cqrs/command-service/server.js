const http = require('http');
const { EventStore } = require('../shared/event-store');
const { WalletAggregate } = require('../shared/wallet-aggregate');

const PORT = process.env.PORT || 5001;
const eventStore = new EventStore();

// Callback to projector if running in shared process, or standalone
let externalProjector = null;
function setProjector(p) {
  externalProjector = p;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function loadAggregate(walletId) {
  const aggregate = new WalletAggregate(walletId);
  
  // 1. Kiểm tra Snapshot trước để tối ưu hóa I/O
  const snapshot = eventStore.getSnapshot(walletId);
  let fromVersion = 0;
  if (snapshot) {
    aggregate.loadFromSnapshot(snapshot);
    fromVersion = snapshot.version;
  }

  // 2. Chỉ đọc các sự kiện phát sinh sau Snapshot
  const events = eventStore.getEvents(walletId, fromVersion);
  for (const e of events) {
    aggregate.apply(e);
  }

  return aggregate;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  res.setHeader('Content-Type', 'application/json');

  try {
    // 1. COMMAND: TẠO VÍ MỚI (POST /api/wallets)
    if (pathname === '/api/wallets' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { walletId, owner, initialBalance } = body;

      if (!walletId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'walletId là bắt buộc' }));
      }

      const aggregate = loadAggregate(walletId);
      const eventToEmit = aggregate.create(owner, initialBalance || 0);

      const savedEvent = eventStore.append(
        walletId,
        'Wallet',
        aggregate.version,
        eventToEmit.eventType,
        eventToEmit.payload,
        { ip: req.socket.remoteAddress, userAgent: req.headers['user-agent'] }
      );

      if (externalProjector) externalProjector.projectOne(savedEvent);

      res.statusCode = 201;
      return res.end(JSON.stringify({
        success: true,
        message: 'Ví đã được tạo thành công vào Event Store',
        event: savedEvent,
        currentVersion: savedEvent.version
      }));
    }

    // 2. COMMAND: NẠP TIỀN (POST /api/wallets/:id/deposit)
    const depositMatch = pathname.match(/^\/api\/wallets\/([^/]+)\/deposit$/);
    if (depositMatch && req.method === 'POST') {
      const walletId = depositMatch[1];
      const body = await parseJsonBody(req);
      const { amount, reason } = body;

      const aggregate = loadAggregate(walletId);
      const eventToEmit = aggregate.deposit(Number(amount), reason);

      const savedEvent = eventStore.append(
        walletId,
        'Wallet',
        aggregate.version,
        eventToEmit.eventType,
        eventToEmit.payload,
        { ip: req.socket.remoteAddress }
      );

      if (externalProjector) externalProjector.projectOne(savedEvent);

      res.statusCode = 201;
      return res.end(JSON.stringify({
        success: true,
        message: `Đã nạp ${amount}đ vào ví`,
        event: savedEvent,
        newBalance: aggregate.balance + Number(amount),
        currentVersion: savedEvent.version
      }));
    }

    // 3. COMMAND: RÚT TIỀN (POST /api/wallets/:id/withdraw)
    const withdrawMatch = pathname.match(/^\/api\/wallets\/([^/]+)\/withdraw$/);
    if (withdrawMatch && req.method === 'POST') {
      const walletId = withdrawMatch[1];
      const body = await parseJsonBody(req);
      const { amount, reason } = body;

      const aggregate = loadAggregate(walletId);
      // Kiểm tra quy tắc bất biến (Không thấu chi)
      const eventToEmit = aggregate.withdraw(Number(amount), reason);

      const savedEvent = eventStore.append(
        walletId,
        'Wallet',
        aggregate.version,
        eventToEmit.eventType,
        eventToEmit.payload,
        { ip: req.socket.remoteAddress }
      );

      if (externalProjector) externalProjector.projectOne(savedEvent);

      res.statusCode = 201;
      return res.end(JSON.stringify({
        success: true,
        message: `Đã rút ${amount}đ khỏi ví`,
        event: savedEvent,
        newBalance: aggregate.balance - Number(amount),
        currentVersion: savedEvent.version
      }));
    }

    // 4. COMMAND: TẠO SNAPSHOT THỦ CÔNG HOẶC ĐỊNH KỲ (POST /api/wallets/:id/snapshot)
    const snapshotMatch = pathname.match(/^\/api\/wallets\/([^/]+)\/snapshot$/);
    if (snapshotMatch && req.method === 'POST') {
      const walletId = snapshotMatch[1];
      const aggregate = loadAggregate(walletId);

      eventStore.saveSnapshot(walletId, aggregate.version, aggregate.toSnapshotState());

      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        message: `Đã lưu Snapshot cho ví ${walletId} tại version ${aggregate.version}`,
        snapshot: {
          walletId,
          version: aggregate.version,
          state: aggregate.toSnapshotState()
        }
      }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Route not found on Command Service: ${req.method} ${pathname}` }));

  } catch (err) {
    if (err.code === 'CONCURRENCY_CONFLICT') {
      res.statusCode = 409; // HTTP 409 Conflict
      return res.end(JSON.stringify({
        error: 'Concurrency Conflict (OCC)',
        details: err.message
      }));
    }

    res.statusCode = 400; // HTTP 400 Bad Request cho vi phạm nghiệp vụ
    return res.end(JSON.stringify({
      error: 'Business Rule Violation',
      details: err.message
    }));
  }
});

function startServer(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[Command Service (Write Side)] Running on http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, server, eventStore, setProjector };
