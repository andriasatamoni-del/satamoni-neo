import { Inject, Injectable, Logger } from "@nestjs/common";
import { Payment } from "../../domain/payment.aggregate";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";
import { PAYMENT_METHOD_REPOSITORY, type PaymentMethodRepositoryPort } from "../../domain/ports/payment-method-repository.port";
import type { OrderRegisteredEvent } from "../../../orders/domain/events/order-registered.event";

// المستهلك التاني لـOrderRegisteredEvent (بعد Accounting) - "قفل طريقة الدفع فور اختيار الكاشير ليها
// وقت إنشاء الطلب" بالحرف من الريبو القديم، بس هنا event-driven مش synchronous port call: تأخير قفل
// الدفعة لحظات بعد تسجيل الطلب مقبول تمامًا (نفس منطق ترحيل قيد البيع في Accounting)، عكس استهلاك
// المخزون اللي لازم يبقى فوري عشان يمنع رصيد سالب.
@Injectable()
export class LockPaymentForOrderHandler {
  private readonly logger = new Logger(LockPaymentForOrderHandler.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepositoryPort
  ) {}

  async handle(event: OrderRegisteredEvent): Promise<void> {
    // مفيش paymentMethodId متحدد وقت التسجيل -> مفيش Payment خالص (نفس قيد الريبو القديم الموروث،
    // بند 4 في docs/PAYMENT-CONTROL.md الأصلي) - مش خطأ
    if (!event.paymentMethodId) return;
    if (await this.payments.findByOrderId(event.orderId)) return; // idempotent لو الحدث اتنشر أكتر من مرة

    const method = await this.methods.findById(event.paymentMethodId);
    if (!method) {
      this.logger.warn(`تخطّي قفل دفعة للطلب ${event.orderId} - طريقة الدفع ${event.paymentMethodId} مش موجودة`);
      return;
    }

    const payment = Payment.lock({
      orderId: event.orderId,
      branchId: event.branchId,
      paymentMethodId: method.id,
      methodKind: method.kind,
      settlementChannel: method.settlementChannel,
      amount: event.total,
      lockedBy: event.createdBy,
    });
    await this.payments.save(payment);
  }
}
