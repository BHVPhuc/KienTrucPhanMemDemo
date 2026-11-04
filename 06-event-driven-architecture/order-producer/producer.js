/**
 * EVENT PRODUCER: ORDER SERVICE
 * Tiếp nhận yêu cầu đặt hàng và phát sự kiện bất đồng bộ OrderPlaced lên Message Broker.
 */

class OrderProducer {
  constructor(broker) {
    this.broker = broker;
  }

  placeOrder(orderData) {
    const event = {
      eventId: `EVT-ORD-${Date.now()}`,
      type: 'OrderPlaced',
      payload: orderData
    };
    this.broker.publish('inventory-queue', event);
    this.broker.publish('payment-queue', event);
    this.broker.publish('notification-queue', event);
    return event;
  }
}

module.exports = { OrderProducer };
