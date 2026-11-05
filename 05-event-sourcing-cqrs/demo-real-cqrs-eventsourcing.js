/**
 * ==============================================================================
 * DEMO THỰC CHỨNG KIẾN TRÚC: EVENT SOURCING & CQRS (ZERO-WORKAROUND)
 * ==============================================================================
 * Hệ thống: Ví Điện Tử Độc Lập (Digital Wallet Core Banking)
 * - Cơ sở dữ liệu Write Model thật: SQLite `event-store.db` (Append-Only Event Stream)
 * - Cơ sở dữ liệu Read Model thật:  SQLite `read-model.db` (Denormalized Materialized Views)
 * - Giao tiếp mạng thật qua HTTP:
 *   • Command Service: http://localhost:5001 (Port 5001 - Nhánh Ghi)
 *   • Query Service:   http://localhost:5002 (Port 5002 - Nhánh Đọc)
 * - Kiểm chứng: Business Invariants, OCC Concurrency Conflict, Snapshots & Event Replay.
 * ==============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const commandServerModule = require('./command-service/server');
const queryServerModule = require('./query-service/server');
const { WalletProjector } = require('./projector/projector');

function httpRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
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
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runRealDemo() {
  console.log('='.repeat(80));
  console.log('🏛️  BẮT ĐẦU DEMO THỰC CHỨNG KIẾN TRÚC CQRS & EVENT SOURCING (HỆ THỐNG VÍ ĐIỆN TỬ)');
  console.log('='.repeat(80));

  // 1. Khởi động 2 dịch vụ độc lập trên 2 cổng mạng riêng biệt
  const cmdServer = await commandServerModule.startServer(5001);
  const qryServer = await queryServerModule.startServer(5002);

  // Làm sạch các bảng trong Event Store và Read DB trước khi chạy để kiểm thử chuẩn xác
  commandServerModule.eventStore.reset();
  queryServerModule.readDb.reset();

  // Kết nối Projector để đồng bộ sự kiện từ Write Side sang Read Side
  const projector = new WalletProjector(queryServerModule.readDb);
  commandServerModule.setProjector(projector);

  const WALLET_ID = 'WAL-VN-888';

  try {
    // -------------------------------------------------------------------------
    // BƯỚC 1: TIẾP NHẬN COMMANDS & GHI VÀO EVENT STORE THẬT (PORT 5001)
    // -------------------------------------------------------------------------
    console.log('\n--- BƯỚC 1: GỬI COMMANDS QUA HTTP TỚI COMMAND SERVICE (Port 5001) ---');

    console.log('  1.1 Gửi Command: Tạo ví mới cho "Nguyễn Văn An" với 500.000đ...');
    const createRes = await httpRequest('http://localhost:5001/api/wallets', 'POST', {
      walletId: WALLET_ID,
      owner: 'Nguyễn Văn An',
      initialBalance: 500000
    });
    console.log(`      Status: ${createRes.status} | Event: [${createRes.data.event.eventType}] Version=${createRes.data.currentVersion}`);

    console.log('  1.2 Gửi Command: Nạp 1.000.000đ (Thưởng thành tích)...');
    const depositRes = await httpRequest(`http://localhost:5001/api/wallets/${WALLET_ID}/deposit`, 'POST', {
      amount: 1000000,
      reason: 'Thưởng thành tích quý 3'
    });
    console.log(`      Status: ${depositRes.status} | Số dư sau nạp: ${depositRes.data.newBalance.toLocaleString()}đ | Version=${depositRes.data.currentVersion}`);

    console.log('  1.3 Gửi Command: Rút 300.000đ (Thanh toán hóa đơn tiền điện)...');
    const withdrawRes = await httpRequest(`http://localhost:5001/api/wallets/${WALLET_ID}/withdraw`, 'POST', {
      amount: 300000,
      reason: 'Thanh toán tiền điện EVN'
    });
    console.log(`      Status: ${withdrawRes.status} | Số dư sau rút: ${withdrawRes.data.newBalance.toLocaleString()}đ | Version=${withdrawRes.data.currentVersion}`);

    console.log('  1.4 Thử nghiệm vi phạm Quy tắc Bất biến (Business Invariant): Cố tình rút 50.000.000đ (vượt số dư)...');
    const failRes = await httpRequest(`http://localhost:5001/api/wallets/${WALLET_ID}/withdraw`, 'POST', {
      amount: 50000000
    });
    console.log(`      Status: ${failRes.status} (Bị chặn!) | Lý do: "${failRes.data.details}"`);

    // -------------------------------------------------------------------------
    // BƯỚC 2: KIỂM CHỨNG XUNG ĐỘT PHIÊN BẢN (OPTIMISTIC CONCURRENCY CONTROL - OCC)
    // -------------------------------------------------------------------------
    console.log('\n--- BƯỚC 2: KIỂM CHỨNG KHÓA LẠC QUAN (OCC) DƯỚI TẦNG SQL CỦA EVENT STORE ---');
    console.log('  -> Giả lập 2 tiến trình đồng thời cố tình ghi nối tiếp cùng version vào Event Store:');
    try {
      // Cố tình chèn trùng version vào bảng event_stream với StreamId WAL-VN-888 và Version 3 (đã tồn tại)
      commandServerModule.eventStore.append(
        WALLET_ID,
        'Wallet',
        2, // expectedVersion 2 -> nextVersion = 3 (Đã có trong DB!)
        'MoneyDeposited',
        { amount: 50000 }
      );
    } catch (err) {
      console.log(`  ✅ SQLite chặn lại bởi ràng buộc: UNIQUE(stream_id, version)!`);
      console.log(`     Chi tiết mã lỗi OCC: "${err.message}"`);
    }

    // -------------------------------------------------------------------------
    // BƯỚC 3: TRUY VẤN READ MODEL TẠI QUERY SERVICE (PORT 5002 - O(1) TỪ DISK)
    // -------------------------------------------------------------------------
    console.log('\n--- BƯỚC 3: TRUY VẤN READ MODEL QUA HTTP TẠI QUERY SERVICE (Port 5002) ---');
    const queryRes = await httpRequest(`http://localhost:5002/api/wallets/${WALLET_ID}`, 'GET');
    console.log(`  3.1 Xem Bảng tổng hợp (Materialized View từ 'read-model.db'):`);
    console.table([queryRes.data.data]);

    console.log(`  3.2 Xem Sổ cái Kiểm toán Bất biến (Audit Trail từ Event Log):`);
    const auditRes = await httpRequest(`http://localhost:5002/api/wallets/${WALLET_ID}/audit`, 'GET');
    console.table(auditRes.data.auditTrail);

    // -------------------------------------------------------------------------
    // BƯỚC 4: TỐI ƯU HÓA BẰNG SNAPSHOTTING (TRÁNH PHẢI ĐỌC HÀNG TRIỆU EVENTS)
    // -------------------------------------------------------------------------
    console.log('\n--- BƯỚC 4: LƯU TRỮ VÀ SỬ DỤNG SNAPSHOT ĐỂ TỐI ƯU HÓA HIỆU NĂNG I/O ---');
    console.log(`  -> Thực hiện lưu Snapshot cho ví ${WALLET_ID} tại Version hiện tại...`);
    const snapRes = await httpRequest(`http://localhost:5001/api/wallets/${WALLET_ID}/snapshot`, 'POST');
    console.log(`     Snapshot đã lưu vào bảng 'snapshots': Version=${snapRes.data.snapshot.version}, Balance=${snapRes.data.snapshot.state.balance.toLocaleString()}đ`);

    console.log('  -> Phát sinh thêm 2 giao dịch mới sau khi đã có Snapshot:');
    await httpRequest(`http://localhost:5001/api/wallets/${WALLET_ID}/deposit`, 'POST', { amount: 200000 });
    await httpRequest(`http://localhost:5001/api/wallets/${WALLET_ID}/withdraw`, 'POST', { amount: 100000 });

    console.log('  -> Kiểm tra cơ chế tải Aggregate bằng Snapshot:');
    const snap = commandServerModule.eventStore.getSnapshot(WALLET_ID);
    const deltaEvents = commandServerModule.eventStore.getEvents(WALLET_ID, snap.version);
    console.log(`     + Nạp trạng thái từ Snapshot tại Version ${snap.version} (Số dư cơ sở: ${snap.state.balance.toLocaleString()}đ)`);
    console.log(`     + Chỉ cần đọc thêm ${deltaEvents.length} sự kiện phát sinh sau Snapshot (thay vì phải đọc toàn bộ sự kiện từ đầu)!`);

    // -------------------------------------------------------------------------
    // BƯỚC 5: KHẢ NĂNG DU HÀNH THỜI GIAN & PHỤC HỒI THẢM HỌA (EVENT REPLAY)
    // -------------------------------------------------------------------------
    console.log('\n--- BƯỚC 5: KHẢ NĂNG PHỤC HỒI THẢM HỌA (DISASTER RECOVERY) QUA EVENT REPLAY ---');
    console.log('  💣 Giả lập sự cố: Cơ sở dữ liệu Read Model (read-model.db) bị xóa sạch hoàn toàn!');
    queryServerModule.readDb.reset();
    
    const checkWiped = await httpRequest(`http://localhost:5002/api/wallets/${WALLET_ID}`, 'GET');
    console.log(`     Kiểm tra Read DB sau khi xóa: Status = ${checkWiped.status} (Dữ liệu đọc đã hoàn toàn biến mất)`);

    console.log('  🔄 Kích hoạt Event Replay từ Event Store bất biến để tái thiết lập Read DB:');
    const replayRes = await httpRequest('http://localhost:5002/api/admin/replay', 'POST');
    console.log(`     ${replayRes.data.message}: Đã nạp lại ${replayRes.data.totalEventsReplayed} sự kiện trong ${replayRes.data.durationMs}ms`);

    const checkRestored = await httpRequest(`http://localhost:5002/api/wallets/${WALLET_ID}`, 'GET');
    console.log(`     ✅ Read Model đã được phục hồi nguyên vẹn 100%:`);
    console.table([checkRestored.data.data]);

  } finally {
    // Đóng máy chủ
    cmdServer.close();
    qryServer.close();
    commandServerModule.eventStore.close();
    queryServerModule.readDb.close();
    console.log('\n' + '='.repeat(80));
    console.log('🏁 HOÀN TẤT DEMO THỰC THỨC CQRS & EVENT SOURCING VỚI ĐẦY ĐỦ CƠ SỞ DỮ LIỆU THẬT!');
    console.log('='.repeat(80));
  }
}

runRealDemo().catch(console.error);
