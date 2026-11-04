/**
 * DEMO TOÀN DIỆN KIẾN TRÚC HƯỚNG SỰ KIỆN (EVENT-DRIVEN ARCHITECTURE - EDA)
 * Minh họa: Loose Coupling, Khả năng chịu lỗi khi sập dịch vụ, Dead Letter Queue (DLQ), và Idempotency
 */

// 1. GIẢ LẬP MESSAGE BROKER (Hỗ trợ Queues, DLQ và Retry Policy)
class InMemoryMessageBroker {
  constructor() {
    this.queues = new Map(); // queueName -> array of messages
    this.subscribers = new Map(); // queueName -> handler function
    this.deadLetterQueue = [];
  }

  registerQueue(queueName) {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
      this.subscribers.set(queueName, null);
    }
  }

  subscribe(queueName, handler) {
    this.subscribers.set(queueName, handler);
    console.log(`  [Broker 📡] Consumer đăng ký lắng nghe Queue: "${queueName}"`);
    // Nếu có tin nhắn đang tồn đọng trong queue, lập tức phát cho consumer vừa sống dậy
    this.flushQueue(queueName);
  }

  unsubscribe(queueName) {
    this.subscribers.set(queueName, null);
    console.log(`  [Broker 🔌] Consumer ngắt kết nối khỏi Queue: "${queueName}" (Giả lập sập dịch vụ)`);
  }

  publish(queueName, message) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} chưa được đăng ký!`);

    const enrichedMsg = {
      ...message,
      retryCount: message.retryCount || 0,
      timestamp: new Date().toISOString()
    };

    console.log(`  [Broker 📥 Nhận tin] Tới Queue: "${queueName}", EventId=${enrichedMsg.eventId}`);

    const handler = this.subscribers.get(queueName);
    if (handler) {
      // Có consumer đang online -> xử lý ngay
      this.dispatch(queueName, enrichedMsg, handler);
    } else {
      // Không có consumer (dịch vụ sập) -> Lưu trữ an toàn trong Queue chờ sống lại
      queue.push(enrichedMsg);
      console.log(`  [Broker 💾 Tồn đọng] Queue "${queueName}" hiện lưu đệm ${queue.length} tin chưa được đọc.`);
    }
  }

  async dispatch(queueName, message, handler) {
    try {
      await handler(message);
    } catch (err) {
      console.log(`    ⚠️ [Lỗi xử lý] Consumer báo lỗi: "${err.message}" (Lần thử: ${message.retryCount + 1})`);
      if (message.retryCount < 2) {
        // Retry policy: Thử lại tối đa 2 lần
        message.retryCount += 1;
        console.log(`    🔁 [Broker Retry] Đẩy lại tin ${message.eventId} vào queue để thử lại...`);
        setTimeout(() => this.publish(queueName, message), 200);
      } else {
        // Vượt quá số lần thử -> Đẩy vào Dead Letter Queue (DLQ)
        console.log(`    ☠️ [Broker DLQ] Chuyển tin hỏng ${message.eventId} sang DEAD LETTER QUEUE!`);
        this.deadLetterQueue.push({ message, failureReason: err.message });
      }
    }
  }

  flushQueue(queueName) {
    const queue = this.queues.get(queueName);
    const handler = this.subscribers.get(queueName);
    if (queue && handler && queue.length > 0) {
      console.log(`  [Broker 🚀 Gửi bù] Consumer đã online! Đang gửi bù ${queue.length} tin tồn đọng...`);
      const pendingMessages = [...queue];
      this.queues.set(queueName, []);
      pendingMessages.forEach(msg => this.dispatch(queueName, msg, handler));
    }
  }
}

// 2. IDEMPOTENT CONSUMER (Đảm bảo tính lũy đẳng: chỉ xử lý mỗi eventId đúng 1 lần)
class IdempotentConsumer {
  constructor(name) {
    this.name = name;
    this.processedEventIds = new Set();
  }

  handle(event, workFn) {
    if (this.processedEventIds.has(event.eventId)) {
      console.log(`    [${this.name} 🛡️ Idempotency] Bỏ qua EventId=${event.eventId} vì đã xử lý trước đó (Tránh trùng tiền/trùng mail)!`);
      return;
    }
    workFn(event);
    this.processedEventIds.add(event.eventId);
  }
}

// ==========================================
// CHƯƠNG TRÌNH DEMO TOÀN DIỆN
// ==========================================
async function runEdaDemo() {
  console.log('='.repeat(75));
  console.log('⚡ DEMO KIẾN TRÚC HƯỚNG SỰ KIỆN (EVENT-DRIVEN ARCHITECTURE)');
  console.log('='.repeat(75));

  const broker = new InMemoryMessageBroker();
  broker.registerQueue('inventory-queue');
  broker.registerQueue('payment-queue');
  broker.registerQueue('notification-queue');

  const inventoryConsumer = new IdempotentConsumer('InventoryService');
  const paymentConsumer = new IdempotentConsumer('PaymentService');
  const notificationConsumer = new IdempotentConsumer('NotificationService');

  // Đăng ký các Consumer lắng nghe
  broker.subscribe('inventory-queue', (evt) => {
    inventoryConsumer.handle(evt, (e) => console.log(`    [InventoryService 📦] Đã trừ 1 sản phẩm "${e.payload.item}" trong kho!`));
  });

  broker.subscribe('payment-queue', (evt) => {
    paymentConsumer.handle(evt, (e) => console.log(`    [PaymentService 💳] Đã trừ tiền $${e.payload.amount} cho khách hàng ${e.payload.customer}!`));
  });

  // Notification Consumer
  const notificationHandler = (evt) => {
    if (evt.payload.customer === 'bad-email-user') {
      throw new Error('Địa chỉ email không tồn tại hoặc bị khóa (Invalid Mailbox)');
    }
    notificationConsumer.handle(evt, (e) => console.log(`    [NotificationService ✉️] Đã gửi email xác nhận cho: ${e.payload.customer}`));
  };

  broker.subscribe('notification-queue', notificationHandler);

  // KỊCH BẢN 1: ĐẶT HÀNG THÀNH CÔNG BÌNH THƯỜNG
  console.log('\n--- KỊCH BẢN 1: ĐẶT HÀNG BÌNH THƯỜNG (BẤT ĐỒNG BỘ) ---');
  const order1 = {
    eventId: 'EVT-ORD-101',
    type: 'OrderPlaced',
    payload: { item: 'Laptop Dell XPS', amount: 1500, customer: 'alice@gmail.com' }
  };
  // Order Producer phát sự kiện
  broker.publish('inventory-queue', order1);
  broker.publish('payment-queue', order1);
  broker.publish('notification-queue', order1);

  // KỊCH BẢN 2: CHỨNG MINH LOOSE COUPLING & FAULT ISOLATION (ĐÁNH SẬP DỊCH VỤ EMAIL)
  console.log('\n--- KỊCH BẢN 2: CHỨNG MINH LOOSE COUPLING (TẮT DỊCH VỤ NOTIFICATION) ---');
  broker.unsubscribe('notification-queue'); // Giả lập Notification Service bị crash / bảo trì

  console.log('  Khách hàng Bob đặt hàng mới trong lúc hệ thống Email đang chết hoàn toàn:');
  const order2 = {
    eventId: 'EVT-ORD-102',
    type: 'OrderPlaced',
    payload: { item: 'Bàn phím cơ', amount: 120, customer: 'bob@gmail.com' }
  };
  // Khách hàng vẫn đặt hàng thành công mà không nhận bất kỳ lỗi nào!
  broker.publish('inventory-queue', order2);
  broker.publish('payment-queue', order2);
  broker.publish('notification-queue', order2); // Tin nhắn được lưu an toàn trong Broker

  console.log('\n  Khởi động lại Notification Service sau khi khắc phục sự cố:');
  broker.subscribe('notification-queue', notificationHandler); // Service sống dậy, Broker gửi bù ngay!

  // KỊCH BẢN 3: TÍNH LŨY ĐẲNG (IDEMPOTENCY - GỬI LẶP TIN NHẮN TRÊN MẠNG)
  console.log('\n--- KỊCH BẢN 3: XỬ LÝ TRÙNG LẶP TIN NHẮN (IDEMPOTENCY CHECK) ---');
  console.log('  Mạng bị lag khiến broker gửi lại tin nhắn EVT-ORD-101 lần thứ hai:');
  broker.publish('payment-queue', order1);

  // KỊCH BẢN 4: RETRY POLICY & DEAD LETTER QUEUE (DLQ)
  console.log('\n--- KỊCH BẢN 4: DEAD LETTER QUEUE (DLQ KHI XỬ LÝ LỖI LIÊN TIẾP) ---');
  const faultyOrder = {
    eventId: 'EVT-ORD-103-FAULT',
    type: 'OrderPlaced',
    payload: { item: 'Tai nghe Bluetooth', amount: 50, customer: 'bad-email-user' }
  };
  broker.publish('notification-queue', faultyOrder);

  // Chờ đợi quá trình retry bất đồng bộ hoàn tất
  await new Promise(resolve => setTimeout(resolve, 800));

  console.log('\n📋 KIỂM TRA TRẠNG THÁI DEAD LETTER QUEUE (DLQ):');
  console.log('  Tổng số tin nhắn hỏng trong DLQ:', broker.deadLetterQueue.length);
  broker.deadLetterQueue.forEach((entry, idx) => {
    console.log(`  [DLQ #${idx + 1}] EventId: ${entry.message.eventId}, Lý do: "${entry.failureReason}"`);
  });

  console.log('\n' + '='.repeat(75));
  console.log('✅ DEMO KIẾN TRÚC EVENT-DRIVEN HOÀN TẤT XUẤT SẮC.');
  console.log('='.repeat(75));
}

runEdaDemo();
