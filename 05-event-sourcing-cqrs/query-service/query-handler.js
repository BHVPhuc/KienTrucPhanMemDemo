/**
 * NHÁNH ĐỌC (QUERY SIDE): TRUY VẤN TỨC THÌ TRÊN BẢNG DỮ LIỆU ĐÃ LÀM PHẲNG (O(1) NO JOINS)
 */

class OrderQueryHandler {
  constructor(readDb) {
    this.readDb = readDb;
  }

  getOrderSummaryById(orderId) {
    return this.readDb.get(orderId) || null;
  }

  listAllPaidOrders() {
    return Array.from(this.readDb.values()).filter(o => o.status === 'PAID');
  }
}

module.exports = { OrderQueryHandler };
