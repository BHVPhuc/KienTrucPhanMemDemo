/**
 * BỘ CHIẾU (PROJECTOR): LẮNG NGHE SỰ KIỆN TỪ EVENT STORE & CẬP NHẬT READ DATABASE ĐÃ LÀM PHẲNG
 */

class OrderProjectorWorker {
  constructor(readDb) {
    this.readDb = readDb;
  }

  project(event) {
    switch (event.type) {
      case 'OrderCreated':
        this.readDb.set(event.aggregateId, {
          orderId: event.aggregateId,
          customerId: event.payload.customerId,
          itemCount: event.payload.items.reduce((s, i) => s + i.qty, 0),
          totalAmount: event.payload.totalAmount,
          status: 'CREATED',
          lastUpdated: event.timestamp
        });
        break;
      case 'OrderPaymentConfirmed': {
        const existing = this.readDb.get(event.aggregateId);
        if (existing) {
          existing.status = 'PAID';
          existing.transactionId = event.payload.transactionId;
          existing.lastUpdated = event.timestamp;
        }
        break;
      }
    }
  }
}

module.exports = { OrderProjectorWorker };
