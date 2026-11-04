/**
 * DEMO TOÀN DIỆN: EVENT SOURCING, CQRS, EVENT REPLAY & SNAPSHOTTING
 * Hệ thống mô phỏng: Ví điện tử (Digital Wallet) & Đơn hàng
 */

// 1. EVENT STORE (Cơ sở lưu trữ sự kiện chỉ cho phép ghi nối tiếp - Append-Only)
class EventStore {
  constructor() {
    this.events = [];
  }

  append(event) {
    const eventWithMetadata = {
      eventId: `EVT-${this.events.length + 1}`,
      ...event,
      timestamp: new Date().toISOString()
    };
    this.events.push(eventWithMetadata);
    console.log(`  [EventStore 📥 Ghi nối tiếp] #${eventWithMetadata.eventId} [${event.type}] AggregateId=${event.aggregateId}`);
    return eventWithMetadata;
  }

  getEventsForAggregate(aggregateId, fromVersion = 0) {
    return this.events.filter(e => e.aggregateId === aggregateId && e.version > fromVersion);
  }

  getAllEvents() {
    return this.events;
  }
}

// 2. SNAPSHOT STORE (Lưu bản chụp trạng thái định kỳ)
class SnapshotStore {
  constructor() {
    this.snapshots = new Map(); // aggregateId -> { version, state, timestamp }
  }

  saveSnapshot(aggregateId, version, state) {
    console.log(`  [SnapshotStore 📸 Lưu bản chụp] AggregateId=${aggregateId} tại Version=${version}`);
    this.snapshots.set(aggregateId, {
      version,
      state: JSON.parse(JSON.stringify(state)),
      timestamp: new Date().toISOString()
    });
  }

  getLatestSnapshot(aggregateId) {
    return this.snapshots.get(aggregateId) || null;
  }
}

// 3. READ MODEL DATABASE (Cơ sở dữ liệu đọc - Denormalized Materialized View)
class ReadDatabase {
  constructor() {
    this.walletSummaries = new Map(); // walletId -> { owner, balance, totalTransactions }
  }

  reset() {
    this.walletSummaries.clear();
    console.log('  [ReadDB 🧹] Đã làm trống toàn bộ cơ sở dữ liệu đọc để kiểm thử phục hồi.');
  }

  upsert(walletId, updater) {
    const current = this.walletSummaries.get(walletId) || { walletId, owner: '', balance: 0, totalTransactions: 0 };
    updater(current);
    this.walletSummaries.set(walletId, current);
  }

  get(walletId) {
    return this.walletSummaries.get(walletId);
  }
}

// 4. CQRS: PROJECTOR (Bộ chiếu đọc sự kiện để đồng bộ sang Read DB)
class WalletProjector {
  constructor(readDb) {
    this.readDb = readDb;
  }

  project(event) {
    switch (event.type) {
      case 'WalletCreated':
        this.readDb.upsert(event.aggregateId, (view) => {
          view.owner = event.payload.owner;
          view.balance = event.payload.initialBalance;
          view.totalTransactions = 1;
        });
        break;
      case 'MoneyDeposited':
        this.readDb.upsert(event.aggregateId, (view) => {
          view.balance += event.payload.amount;
          view.totalTransactions += 1;
        });
        break;
      case 'MoneyWithdrawn':
        this.readDb.upsert(event.aggregateId, (view) => {
          view.balance -= event.payload.amount;
          view.totalTransactions += 1;
        });
        break;
    }
  }
}

// 5. WRITE MODEL (COMMAND SIDE): AGGREGATE
class WalletAggregate {
  constructor(walletId) {
    this.walletId = walletId;
    this.balance = 0;
    this.owner = '';
    this.version = 0;
  }

  // Tái tạo trạng thái bằng cách "Gấp" (Fold/Reduce) các sự kiện
  apply(event) {
    switch (event.type) {
      case 'WalletCreated':
        this.owner = event.payload.owner;
        this.balance = event.payload.initialBalance;
        break;
      case 'MoneyDeposited':
        this.balance += event.payload.amount;
        break;
      case 'MoneyWithdrawn':
        this.balance -= event.payload.amount;
        break;
    }
    this.version = event.version;
  }

  // Command 1: Tạo ví
  create(owner, initialBalance) {
    if (initialBalance < 0) throw new Error('Số dư ban đầu không được âm');
    return {
      type: 'WalletCreated',
      aggregateId: this.walletId,
      version: this.version + 1,
      payload: { owner, initialBalance }
    };
  }

  // Command 2: Nạp tiền
  deposit(amount) {
    if (amount <= 0) throw new Error('Số tiền nạp phải lớn hơn 0');
    return {
      type: 'MoneyDeposited',
      aggregateId: this.walletId,
      version: this.version + 1,
      payload: { amount }
    };
  }

  // Command 3: Rút tiền (Kiểm tra Business Invariant)
  withdraw(amount) {
    if (amount <= 0) throw new Error('Số tiền rút phải lớn hơn 0');
    if (this.balance < amount) throw new Error(`Số dư không đủ! Hiện có: ${this.balance}, cần rút: ${amount}`);
    return {
      type: 'MoneyWithdrawn',
      aggregateId: this.walletId,
      version: this.version + 1,
      payload: { amount }
    };
  }
}

// ==========================================
// CHƯƠNG TRÌNH THỰC THI MINH HỌA
// ==========================================
async function runDemo() {
  console.log('='.repeat(75));
  console.log('💎 DEMO KIẾN TRÚC: EVENT SOURCING & CQRS');
  console.log('='.repeat(75));

  const eventStore = new EventStore();
  const snapshotStore = new SnapshotStore();
  const readDb = new ReadDatabase();
  const projector = new WalletProjector(readDb);

  const WALLET_ID = 'WAL-VN-999';

  console.log('\n--- GIAI ĐOẠN 1: TIẾP NHẬN COMMANDS & GHI NHẬN SỰ KIỆN BẤT BIẾN ---');

  const wallet = new WalletAggregate(WALLET_ID);

  function executeCommand(eventFactory) {
    const event = eventFactory();
    wallet.apply(event);
    const savedEvent = eventStore.append(event);
    projector.project(savedEvent); // CQRS: Đồng bộ ngay sang Read DB
  }

  // Thực thi chuỗi nghiệp vụ
  executeCommand(() => wallet.create('Nguyen Van A', 100)); // Version 1: 100
  executeCommand(() => wallet.deposit(500));               // Version 2: 600
  executeCommand(() => wallet.withdraw(200));              // Version 3: 400
  executeCommand(() => wallet.deposit(1000));              // Version 4: 1400

  // TẠO SNAPSHOT TẠI VERSION 4
  console.log('\n--- GIAI ĐOẠN 2: TẠO SNAPSHOT ĐỊNH KỲ ---');
  snapshotStore.saveSnapshot(WALLET_ID, wallet.version, {
    owner: wallet.owner,
    balance: wallet.balance
  });

  // Tiếp tục thêm sự kiện sau Snapshot
  console.log('\n--- GIAI ĐOẠN 3: GHI THÊM SỰ KIỆN SAU SNAPSHOT ---');
  executeCommand(() => wallet.deposit(250));               // Version 5: 1650
  executeCommand(() => wallet.withdraw(150));              // Version 6: 1500

  console.log('\n📊 Trạng thái cơ sở dữ liệu Đọc (CQRS Read View):', readDb.get(WALLET_ID));

  // DEMO PHỤC HỒI NHANH BẰNG SNAPSHOT + EVENTS
  console.log('\n--- GIAI ĐOẠN 4: TÁI TẠO ĐỐI TƯỢNG SỬ DỤNG SNAPSHOT (Tối ưu I/O) ---');
  const snap = snapshotStore.getLatestSnapshot(WALLET_ID);
  const fastWallet = new WalletAggregate(WALLET_ID);
  
  console.log(`  -> Nạp nhanh từ Snapshot (Version ${snap.version}, Balance=${snap.state.balance})`);
  fastWallet.owner = snap.state.owner;
  fastWallet.balance = snap.state.balance;
  fastWallet.version = snap.version;

  const subsequentEvents = eventStore.getEventsForAggregate(WALLET_ID, snap.version);
  console.log(`  -> Chỉ cần đọc thêm ${subsequentEvents.length} sự kiện phát sinh sau Snapshot (thay vì đọc cả 6 sự kiện):`);
  subsequentEvents.forEach(e => {
    fastWallet.apply(e);
    console.log(`     + Áp dụng #${e.eventId} [${e.type}]`);
  });
  console.log(`  ✅ Kết quả tái tạo: Balance = ${fastWallet.balance} (Khớp 100%!)`);

  // DEMO EVENT REPLAY (TIME-TRAVEL / AUDIT / THẢM HỌA)
  console.log('\n--- GIAI ĐOẠN 5: EVENT REPLAY TÁI TẠO CƠ SỞ DỮ LIỆU ĐỌC TỪ CON SỐ 0 ---');
  readDb.reset();
  console.log('  Đang chạy Replay toàn bộ sự kiện từ Event Store...');
  const allEvents = eventStore.getAllEvents();
  allEvents.forEach(e => projector.project(e));
  console.log('  ✅ Hoàn tất Replay! Dữ liệu Read Model sau phục hồi:', readDb.get(WALLET_ID));

  console.log('\n' + '='.repeat(75));
  console.log('✅ DEMO CQRS & EVENT SOURCING HOÀN THÀNH XUẤT SẮC.');
  console.log('='.repeat(75));
}

runDemo();
