/**
 * NHÁNH GHI (COMMAND SIDE): TIẾP NHẬN COMMAND, KIỂM TRA QUY TẮC NGHIỆP VỤ & PHÁT SINH SỰ KIỆN BẤT BIẾN
 */

class OrderCommandHandler {
  constructor(eventStore) {
    this.eventStore = eventStore;
  }

  handleCreateOrder({ orderId, customerId, items }) {
    if (!items || items.length === 0) {
      throw new Error('Không thể tạo đơn hàng rỗng (Business Invariant Violation)');
    }
    const totalAmount = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    return this.eventStore.append({
      type: 'OrderCreated',
      aggregateId: orderId,
      version: 1,
      payload: { orderId, customerId, items, totalAmount, status: 'CREATED' }
    });
  }

  handleConfirmPayment({ orderId, transactionId, amountPaid }) {
    if (amountPaid <= 0) {
      throw new Error('Số tiền thanh toán phải lớn hơn 0');
    }
    return this.eventStore.append({
      type: 'OrderPaymentConfirmed',
      aggregateId: orderId,
      version: 2,
      payload: { orderId, transactionId, amountPaid, status: 'PAID' }
    });
  }
}

module.exports = { OrderCommandHandler };
