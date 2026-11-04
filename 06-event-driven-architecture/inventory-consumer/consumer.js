/**
 * EVENT CONSUMER 1: INVENTORY SERVICE (Lắng nghe sự kiện OrderPlaced để trừ tồn kho)
 */

class InventoryConsumer {
  constructor() {
    this.processedEvents = new Set();
  }

  onOrderPlaced(event) {
    if (this.processedEvents.has(event.eventId)) return;
    console.log(`[InventoryConsumer 📦] Đã trừ kho sản phẩm: ${event.payload.item}`);
    this.processedEvents.add(event.eventId);
  }
}

module.exports = { InventoryConsumer };
