import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../database/database.types";
import { KYSELY } from "../database/database.module";
import type { DomainEvent } from "./domain-event";

type Handler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void> | void;

// Bus داخل نفس الـprocess (مونوليث واحد لسه، مش خدمات موزّعة - راجع خطة إعادة البناء قسم 1).
// كل context بينشر حدث، والـcontexts التانية بتشترك فيه من غير ما الناشر يعرف بيها - ده اللي بيدّي
// فايدة الفصل الحقيقية بتاعة DDD من غير تكلفة تشغيل خدمات موزّعة.
//
// outbox: جدول event_outbox بيتكتب فيه الحدث كسجل دائم (مفيد للأحداث اللي لازم توصّل حتى لو الـprocess
// وقع بينهم). دلوقتي بس بيكتب الصف - مفيش relay/dispatcher دوري لسه لأنه مفيش context لسه محتاج
// ضمانة "توصيل حتى بعد إعادة تشغيل" فعليًا (Identity & Access مفيهاش subscriber خارجي دلوقتي).
// الـdispatcher هيتضاف أول ما نبني أول context محتاج الضمانة دي فعليًا (زي Orders -> Accounting في
// المرحلة 3 من الخطة) - بدل ما نبني آلية كاملة مالهاش أي مستهلك حقيقي دلوقتي.
@Injectable()
export class EventBusService {
  private readonly handlers = new Map<string, Handler[]>();

  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  subscribe<E extends DomainEvent>(eventName: string, handler: Handler<E>): void {
    const existing = this.handlers.get(eventName) || [];
    existing.push(handler as Handler);
    this.handlers.set(eventName, existing);
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.db
      .insertInto("event_outbox")
      .values({
        event_name: event.eventName,
        payload: JSON.stringify(event),
        occurred_at: event.occurredAt,
      })
      .execute();

    // فشل subscriber واحد مايفشلش الناشر نفسه - الناشر (زي RegisterOrderHandler) بيكون خلّص عمله
    // الأساسي ونجح بالفعل (الطلب اتسجّل، المخزون اتحدّث) قبل ما ينشر الحدث ده، فمفيش سبب منطقي إن فشل
    // مستهلك تاني (زي ترحيل قيد محاسبي) يرجّع الطلب نفسه فشل. بيتسجل الخطأ بس، مش بيتعدّي لفوق.
    const subscribers = this.handlers.get(event.eventName) || [];
    for (const handler of subscribers) {
      try {
        await handler(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`⚠ فشل subscriber لحدث ${event.eventName}:`, err);
      }
    }
  }
}
