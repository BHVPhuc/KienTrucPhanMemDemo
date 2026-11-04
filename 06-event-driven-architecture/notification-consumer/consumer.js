/**
 * EVENT CONSUMER 3: NOTIFICATION SERVICE (Lắng nghe OrderPlaced gửi Email, hỗ trợ Retry & DLQ)
 */

class NotificationConsumer {
  constructor() {
    this.processedEvents = new Set();
  }

  onOrderPlaced(event) {
    if (event.payload.customer === 'bad-email-user') {
      throw new Error('Invalid Mailbox: Không thể gửi email đến địa chỉ lỗi');
    }
    if (this.processedEvents.has(event.eventId)) return;
    console.log(`[NotificationConsumer ✉️] Đã gửi email xác nhận đơn hàng tới: ${event.payload.customer}`);
    this.processedEvents.add(event.eventId);
  }
}

module.exports = { NotificationConsumer };
