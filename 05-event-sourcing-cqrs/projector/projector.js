/**
 * BỘ CHIẾU (PROJECTOR WORKER)
 * Lắng nghe các sự kiện bất biến từ Event Store và đồng bộ sang Read Database đã làm phẳng.
 */
class WalletProjector {
  constructor(readDb) {
    this.readDb = readDb;
  }

  projectOne(event) {
    const { eventId, streamId, version, eventType, payload, timestamp } = event;

    switch (eventType) {
      case 'WalletCreated': {
        const balance = payload.initialBalance;
        this.readDb.upsertWallet(
          streamId,
          payload.owner,
          balance,
          balance > 0 ? balance : 0,
          0,
          1,
          version,
          timestamp
        );
        this.readDb.insertAuditLog(eventId, streamId, 'CREATED', balance, balance, timestamp);
        break;
      }

      case 'MoneyDeposited': {
        const current = this.readDb.getWallet(streamId);
        if (!current) break;

        const newBalance = current.current_balance + payload.amount;
        const newDeposits = current.total_deposits + payload.amount;
        const newCount = current.transaction_count + 1;

        this.readDb.upsertWallet(
          streamId,
          current.owner,
          newBalance,
          newDeposits,
          current.total_withdrawals,
          newCount,
          version,
          timestamp
        );
        this.readDb.insertAuditLog(eventId, streamId, 'DEPOSIT', payload.amount, newBalance, timestamp);
        break;
      }

      case 'MoneyWithdrawn': {
        const current = this.readDb.getWallet(streamId);
        if (!current) break;

        const newBalance = current.current_balance - payload.amount;
        const newWithdrawals = current.total_withdrawals + payload.amount;
        const newCount = current.transaction_count + 1;

        this.readDb.upsertWallet(
          streamId,
          current.owner,
          newBalance,
          current.total_deposits,
          newWithdrawals,
          newCount,
          version,
          timestamp
        );
        this.readDb.insertAuditLog(eventId, streamId, 'WITHDRAW', payload.amount, newBalance, timestamp);
        break;
      }

      default:
        // Bỏ qua các sự kiện không xác định
        break;
    }
  }

  // TÁI TẠO TOÀN BỘ CƠ SỞ DỮ LIỆU ĐỌC TỪ CON SỐ 0 (EVENT REPLAY)
  replayAll(eventStore) {
    this.readDb.reset();
    const allEvents = eventStore.getAllEvents();
    for (const evt of allEvents) {
      this.projectOne(evt);
    }
    return allEvents.length;
  }
}

module.exports = { WalletProjector };
