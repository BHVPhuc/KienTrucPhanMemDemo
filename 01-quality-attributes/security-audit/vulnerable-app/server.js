const express = require('express');
const app = express();
app.use(express.json());

// ❌ LỖ HỔNG 1: HARDCODED SECRET (Lộ khóa bí mật ngay trong mã nguồn)
const JWT_SECRET = 'SUPER_SECRET_KEY_12345_NEVER_HARDCODE_THIS';
const STRIPE_API_KEY = 'mock_stripe_secret_key_1234567890_demo_only';

// Giả lập cơ sở dữ liệu người dùng và đơn hàng
const USERS = [
  { id: 1, username: 'alice', role: 'customer', balance: 500 },
  { id: 2, username: 'bob', role: 'customer', balance: 1200 },
  { id: 99, username: 'admin', role: 'administrator', balance: 99999 }
];

const INVOICES = [
  { invoiceId: 'INV-001', userId: 1, amount: 250, details: ' Alice Medical Treatment' },
  { invoiceId: 'INV-002', userId: 2, amount: 1200, details: ' Bob Salary Payout' }
];

// ❌ LỖ HỔNG 2: SQL INJECTION (Nối chuỗi trực tiếp không dùng Parameterized Query)
app.get('/api/users/search', (req, res) => {
  const queryName = req.query.name;
  
  // Mô phỏng câu SQL bị nối chuỗi nguy hiểm:
  // SELECT * FROM users WHERE username = 'alice' OR '1'='1'
  const rawSqlQuery = `SELECT * FROM users WHERE username = '${queryName}'`;
  console.log(`[Vulnerable DB Query Executed]: ${rawSqlQuery}`);

  // Mô phỏng kết quả injection
  if (queryName && queryName.includes("' OR '1'='1")) {
    return res.json({ success: true, count: USERS.length, data: USERS });
  }

  const user = USERS.filter(u => u.username === queryName);
  res.json({ success: true, count: user.length, data: user });
});

// ❌ LỖ HỔNG 3: BROKEN ACCESS CONTROL / IDOR (Insecure Direct Object Reference)
// Người dùng Alice (id=1) có thể truy cập hóa đơn của Bob (id=2) chỉ bằng cách đổi URL
app.get('/api/invoices/:invoiceId', (req, res) => {
  const { invoiceId } = req.params;
  // Bỏ qua kiểm tra: Người gửi request có sở hữu invoiceId này hay không!
  const invoice = INVOICES.find(inv => inv.invoiceId === invoiceId);

  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  res.json({ success: true, invoice });
});

// ❌ LỖ HỔNG 4: CROSS-SITE SCRIPTING (Reflected / Stored XSS)
// Không escape ký tự đặc biệt (<script>, onerror, javascript:) khi trả về HTML
app.get('/api/welcome', (req, res) => {
  const userName = req.query.name || 'Guest';
  // Trả về HTML thô không qua khử khuẩn (Sanitization)
  res.send(`<h1>Chào mừng ${userName} trở lại hệ thống!</h1>`);
});

// ❌ LỖ HỔNG 5: BUSINESS LOGIC FLAW (Bỏ qua kiểm tra số âm khi nạp tiền)
app.post('/api/wallet/transfer', (req, res) => {
  const { fromUserId, toUserId, amount } = req.body;
  // Không kiểm tra: if (amount <= 0) return error
  const sender = USERS.find(u => u.id === fromUserId);
  const receiver = USERS.find(u => u.id === toUserId);

  if (sender && receiver) {
    // Nếu truyền amount = -1000, tài khoản người gửi sẽ được TĂNG tiền!
    sender.balance -= amount;
    receiver.balance += amount;
    return res.json({ success: true, senderBalance: sender.balance, receiverBalance: receiver.balance });
  }
  res.status(400).json({ error: 'User not found' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Vulnerable Demo App] Chạy tại: http://localhost:${PORT}`);
});
