import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../database/database.types";
import { KYSELY } from "../database/database.module";
import type { DomainEvent } from "./domain-event";
import { afterCommit, isInTransaction } from "../database/transaction-context";

type Handler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void> | void;

interface Subscription {
  handler: Handler;
  critical: boolean;
}

export interface SubscribeOptions {
  // Phase 3.1: a CRITICAL subscriber is part of the publisher's business transaction (accounting postings, payment
  // lock): it runs inline in the same DB transaction and any error propagates, rolling the whole command back -
  // no more "order saved, journal silently missing". Non-critical subscribers (printing, notifications, loyalty) run
  // after the command COMMITS and can never undo or fail it; their errors are logged.
  critical?: boolean;
}

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
  private readonly logger = new Logger(EventBusService.name);
  private readonly handlers = new Map<string, Subscription[]>();

  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  subscribe<E extends DomainEvent>(eventName: string, handler: Handler<E>, options: SubscribeOptions = {}): void {
    const existing = this.handlers.get(eventName) || [];
    existing.push({ handler: handler as Handler, critical: options.critical === true });
    this.handlers.set(eventName, existing);
  }

  // Event history is persisted in event_outbox (inside the publisher's transaction when there is one, so it is
  // atomic with the business change). Delivery is NOT outbox-driven: critical subscribers run synchronously in the same
  // transaction and non-critical ones run in-process after commit. There is deliberately no relay - nothing depends on
  // asynchronous delivery; missing financial effects are detected and repaired by the accounting reconciliation
  // (journal coverage report + repost), not by replaying events.
  async publish(event: DomainEvent): Promise<void> {
    await this.db
      .insertInto("event_outbox")
      .values({
        event_name: event.eventName,
        payload: JSON.stringify(event),
        occurred_at: event.occurredAt,
      })
      .execute();

    const subscribers = this.handlers.get(event.eventName) || [];
    for (const sub of subscribers) {
      if (sub.critical) {
        await sub.handler(event); // errors propagate: the surrounding command transaction rolls back
        continue;
      }
      const runSafely = async () => {
        try {
          await sub.handler(event);
        } catch (err) {
          this.logger.error(`non-critical subscriber failed for ${event.eventName}: ${err instanceof Error ? err.message : err}`);
        }
      };
      if (isInTransaction()) await afterCommit(runSafely);
      else await runSafely();
    }
  }
}
