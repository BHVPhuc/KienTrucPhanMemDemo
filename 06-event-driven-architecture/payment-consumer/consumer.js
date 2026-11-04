/**
 * EVENT CONSUMER 2: PAYMENT SERVICE (Lắng nghe sự kiện OrderPlaced để thanh toán lũy đẳng)
 */

class PaymentConsumer {
  constructor() {
    this.processedEvents = new Set();
  }

  onOrderPlaced(event) {
    if (this.processedEvents.has(event.eventId)) {
      console.log(`[PaymentConsumer 🛡️ Idempotent] Bỏ qua sự kiện trùng lặp: ${event.eventId}`);
      return;
    }
    console.log(`[PaymentConsumer 💳] Đã thanh toán $${event.payload.amount} cho ${event.payload.customer}`);
    this.processedEvents.add(event.eventId);
  }
}

module.exports = { PaymentConsumer };
