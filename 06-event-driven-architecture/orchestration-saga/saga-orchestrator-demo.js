/**
 * DEMO SO SÁNH: SAGA ORCHESTRATOR & GIAO DỊCH BỒI HOÀN (COMPENSATING TRANSACTIONS)
 * Minh họa cách Nhạc trưởng (Saga Coordinator) rollback khi 1 bước ở giữa thất bại.
 */

class SagaOrchestrator {
  constructor() {
    this.steps = [];
  }

  addStep(name, executeAction, compensateAction) {
    this.steps.push({ name, execute: executeAction, compensate: compensateAction });
  }

  async executeSaga(context) {
    console.log(`\n🎼 [Saga Orchestrator] Khởi chạy chuỗi giao dịch phân tán cho Đơn hàng: ${context.orderId}`);
    const executedSteps = [];

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      console.log(`  -> [Bước ${i + 1}] Thực thi: ${step.name}...`);

      try {
        await step.execute(context);
        executedSteps.push(step);
        console.log(`     ✅ Thành công: ${step.name}`);
      } catch (err) {
        console.log(`     ❌ THẤT BẠI TẠI BƯỚC: ${step.name}! Nguyên nhân: "${err.message}"`);
        console.log(`\n🚨 KÍCH HOẠT GIAO DỊCH BỒI HOÀN (COMPENSATION ROLLBACK) THEO THỨ TỰ NGƯỢC LẠI:`);

        // Rollback các bước trước đó theo thứ tự đảo ngược
        for (let j = executedSteps.length - 1; j >= 0; j--) {
          const compStep = executedSteps[j];
          console.log(`  <- [Rollback] Hoàn tác bước: ${compStep.name}...`);
          await compStep.compensate(context);
          console.log(`     🔄 Đã hoàn tác: ${compStep.name}`);
        }

        console.log(`\n❌ Saga kết thúc thất bại: Trạng thái hệ thống đã được phục hồi toàn vẹn.`);
        return { success: false, failedAt: step.name, reason: err.message };
      }
    }

    console.log(`\n🎉 [Saga Orchestrator] Mọi bước hoàn tất thành công 100%!`);
    return { success: true };
  }
}

// ==========================================
// THỰC NGHIỆM: ĐẶT HÀNG BỊ TỪ CHỐI THANH TOÁN
// ==========================================
async function runSagaDemo() {
  console.log('='.repeat(75));
  console.log('🏛️ DEMO KIẾN TRÚC ORCHESTRATION SAGA (NHẠC TRƯỞNG & BỒI HOÀN)');
  console.log('='.repeat(75));

  const saga = new SagaOrchestrator();

  // Bước 1: Khóa tồn kho (Reserve Inventory)
  saga.addStep(
    '1. Khóa hàng trong Kho (Reserve Stock)',
    async (ctx) => {
      console.log(`        [Inventory Service] Đã giữ tạm 1 laptop cho ${ctx.orderId}`);
    },
    async (ctx) => {
      console.log(`        [Inventory Service] HOÀN TỒN KHO: Mở khóa 1 laptop trở lại kho!`);
    }
  );

  // Bước 2: Trừ tiền thẻ tín dụng (Charge Payment) -> Giả lập lỗi thẻ hết tiền
  saga.addStep(
    '2. Trừ tiền tài khoản (Charge Card)',
    async (ctx) => {
      if (ctx.paymentStatus === 'INSUFFICIENT_FUNDS') {
        throw new Error('Số dư thẻ tín dụng không đủ thanh toán $1500');
      }
      console.log(`        [Payment Service] Đã trừ $1500 thành công.`);
    },
    async (ctx) => {
      console.log(`        [Payment Service] HOÀN TIỀN: Hủy authorization tiền thẻ.`);
    }
  );

  // Bước 3: Tạo hóa đơn (Create Invoice)
  saga.addStep(
    '3. Xuất hóa đơn VAT',
    async (ctx) => {
      console.log(`        [Billing Service] Đã xuất hóa đơn điện tử.`);
    },
    async (ctx) => {
      console.log(`        [Billing Service] HỦY HÓA ĐƠN đã xuất.`);
    }
  );

  // Chạy Saga với thẻ bị từ chối
  await saga.executeSaga({
    orderId: 'ORD-SAGA-999',
    paymentStatus: 'INSUFFICIENT_FUNDS'
  });

  console.log('='.repeat(75));
}

runSagaDemo();
