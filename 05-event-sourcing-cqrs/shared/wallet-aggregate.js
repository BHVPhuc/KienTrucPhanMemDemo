/**
 * DOMAIN AGGREGATE (WRITE SIDE / COMMAND MODEL)
 * Thực thi các quy tắc nghiệp vụ (Business Invariants) và tính toán trạng thái
 * bằng cách áp dụng chuỗi sự kiện (Event Stream).
 */
class WalletAggregate {
  constructor(walletId) {
    this.walletId = walletId;
    this.owner = '';
    this.balance = 0;
    this.totalDeposits = 0;
    this.totalWithdrawals = 0;
    this.version = 0;
  }

  // 1. TÁI TẠO TRẠNG THÁI (HYDRATION VIA FOLD / REDUCE)
  apply(event) {
    switch (event.eventType) {
      case 'WalletCreated':
        this.owner = event.payload.owner;
        this.balance = event.payload.initialBalance;
        this.totalDeposits = event.payload.initialBalance > 0 ? event.payload.initialBalance : 0;
        break;
      case 'MoneyDeposited':
        this.balance += event.payload.amount;
        this.totalDeposits += event.payload.amount;
        break;
      case 'MoneyWithdrawn':
        this.balance -= event.payload.amount;
        this.totalWithdrawals += event.payload.amount;
        break;
      default:
        // Bỏ qua các sự kiện không xác định để tương thích ngược
        break;
    }
    this.version = event.version;
  }

  // Khởi tạo nhanh từ Snapshot (Tối ưu I/O)
  loadFromSnapshot(snapshot) {
    this.owner = snapshot.state.owner;
    this.balance = snapshot.state.balance;
    this.totalDeposits = snapshot.state.totalDeposits || 0;
    this.totalWithdrawals = snapshot.state.totalWithdrawals || 0;
    this.version = snapshot.version;
  }

  toSnapshotState() {
    return {
      walletId: this.walletId,
      owner: this.owner,
      balance: this.balance,
      totalDeposits: this.totalDeposits,
      totalWithdrawals: this.totalWithdrawals
    };
  }

  // 2. CÁC COMMAND HANDLER KIỂM TRA QUY TẮC BẤT BIẾN (BUSINESS INVARIANTS)
  create(owner, initialBalance = 0) {
    if (this.version > 0) {
      throw new Error(`Ví ${this.walletId} đã tồn tại (Version hiện tại: ${this.version})`);
    }
    if (!owner || owner.trim() === '') {
      throw new Error('Tên chủ tài khoản không được để trống');
    }
    if (initialBalance < 0) {
      throw new Error('Số dư ban đầu không được là số âm');
    }

    return {
      eventType: 'WalletCreated',
      payload: { owner, initialBalance }
    };
  }

  deposit(amount, reason = 'Nạp tiền vào ví') {
    if (this.version === 0) {
      throw new Error(`Ví ${this.walletId} chưa được tạo`);
    }
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error(`Số tiền nạp phải là số dương (> 0). Nhận: ${amount}`);
    }

    return {
      eventType: 'MoneyDeposited',
      payload: { amount, reason }
    };
  }

  withdraw(amount, reason = 'Rút tiền / Thanh toán') {
    if (this.version === 0) {
      throw new Error(`Ví ${this.walletId} chưa được tạo`);
    }
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error(`Số tiền rút phải là số dương (> 0). Nhận: ${amount}`);
    }
    // RÀNG BUỘC SỐ DƯ (INVARIANT: Không cho phép thấu chi)
    if (this.balance < amount) {
      throw new Error(`Giao dịch bị từ chối: Số dư khả dụng (${this.balance}đ) không đủ để rút ${amount}đ!`);
    }

    return {
      eventType: 'MoneyWithdrawn',
      payload: { amount, reason }
    };
  }
}

module.exports = { WalletAggregate };
