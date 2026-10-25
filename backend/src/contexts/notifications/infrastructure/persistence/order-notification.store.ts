import { Inject, Injectable } from "@nestjs/common";
import { count, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import type {
  NotifiableOrder,
  OrderNotificationKind,
  OrderNotificationRecord,
  OrderNotificationStorePort,
} from "../../domain/ports/order-notification-store.port";
import { orderNotifications } from "./notifications.tables";

@Injectable()
export class OrderNotificationStore implements OrderNotificationStorePort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findOrder(orderId: string): Promise<NotifiableOrder | null> {
    const [row] = await this.db
      .select({
        id: orders.id,
        order_type: orders.order_type,
        customer_phone: orders.customer_phone,
        total: orders.total,
        rating_token: orders.rating_token,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!row) return null;
    return { id: row.id, orderType: row.order_type, customerPhone: row.customer_phone, total: Number(row.total), ratingToken: row.rating_token };
  }

  // الحالة المبدئية failed لحد ما الإرسال يخلص - لو السيرفر وقع في النص يفضل الصف واضح إنه ماوصلش
  async reserve(input: { orderId: string; kind: OrderNotificationKind; recipient: string; message: string }): Promise<string | null> {
    const [row] = await this.db
      .insert(orderNotifications)
      .values({
        order_id: input.orderId,
        kind: input.kind,
        channel: "sms",
        recipient: input.recipient,
        message: input.message,
        status: "failed",
        error: "لسه بيتبعت",
      })
      .onConflictDoNothing({ target: [orderNotifications.order_id, orderNotifications.kind] })
      .returning({ id: orderNotifications.id });
    return row?.id ?? null;
  }

  async complete(id: string, result: { status: OrderNotificationRecord["status"]; error?: string | null }): Promise<void> {
    await this.db
      .update(orderNotifications)
      .set({ status: result.status, error: result.error ?? null })
      .where(eq(orderNotifications.id, id));
  }

  async listRecent(page: PageRequest): Promise<{ rows: OrderNotificationRecord[]; total: number }> {
    const query = this.db.select().from(orderNotifications).orderBy(desc(orderNotifications.created_at), desc(orderNotifications.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(orderNotifications)));
    return { total, rows: rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      kind: r.kind as OrderNotificationKind,
      channel: "sms",
      recipient: r.recipient,
      message: r.message,
      status: r.status as OrderNotificationRecord["status"],
      error: r.error,
      createdAt: r.created_at,
    })) };
  }
}
