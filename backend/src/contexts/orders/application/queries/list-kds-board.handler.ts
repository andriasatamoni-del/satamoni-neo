import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";

const READY_VISIBILITY_WINDOW_MS = 30 * 60 * 1000;

// نفس فلتر شاشة المطبخ في الريبو القديم بالظبط: الطلبات الملغية مالهاش لازمة تتعرض، وطلب بقى READY
// بيفضل ظاهر لمدة 30 دقيقة بس بعدها يختفي من اللوحة (مجرد فلتر قراءة، مفيش أرشفة أو تغيير حالة فعلي) -
// أي حالة قبل كده (NEW/ACCEPTED/PREPARING) بتفضل ظاهرة للأبد لحد ما حد يتعامل معاها، حتى لو اتأخرت.
@Injectable()
export class ListKdsBoardHandler {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}

  async execute(branchId: string): Promise<Order[]> {
    const orders = await this.orders.list({ branchId });
    const cutoff = Date.now() - READY_VISIBILITY_WINDOW_MS;
    return orders.filter((o) => {
      if (o.status === "cancelled") return false;
      if (o.kitchenStatus !== "READY") return true;
      return (o.kitchenReadyAt?.getTime() ?? 0) >= cutoff;
    });
  }
}
