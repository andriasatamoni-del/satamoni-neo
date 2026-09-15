import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { EventBusService } from "../../../src/shared/events/event-bus.service";
import { DomainEvent } from "../../../src/shared/events/domain-event";

class TestEvent extends DomainEvent {
  readonly eventName = "TestEvent";
  constructor(public readonly value: number) {
    super();
  }
}

describe("EventBusService", () => {
  let db: Kysely<Database>;
  let bus: EventBusService;

  beforeAll(() => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    bus = new EventBusService(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM event_outbox`.execute(db);
  });

  test("بينشر الحدث ويسجّله في event_outbox، وبينادي كل الـsubscribers", async () => {
    const received: number[] = [];
    bus.subscribe<TestEvent>("TestEvent", (e) => {
      received.push(e.value);
    });

    await bus.publish(new TestEvent(42));
    expect(received).toEqual([42]);

    const row = await db.selectFrom("event_outbox").selectAll().where("event_name", "=", "TestEvent").executeTakeFirst();
    expect(row).toBeDefined();
  });

  // مهم: فشل subscriber واحد مايفشلش publish() نفسها - الناشر يكون خلّص شغله الأساسي بالفعل قبل النشر
  test("فشل subscriber واحد مايوقفش تنفيذ باقي الـsubscribers، ومايرميش الخطأ لفوق", async () => {
    const received: number[] = [];
    bus.subscribe<TestEvent>("TestEventWithFailure", () => {
      throw new Error("subscriber متعطّل عمدًا للاختبار");
    });
    bus.subscribe<TestEvent>("TestEventWithFailure", (e) => {
      received.push(e.value);
    });

    class FailureEvent extends DomainEvent {
      readonly eventName = "TestEventWithFailure";
      constructor(public readonly value: number) {
        super();
      }
    }

    await expect(bus.publish(new FailureEvent(7))).resolves.toBeUndefined();
    expect(received).toEqual([7]); // الـsubscriber التاني اشتغل عادي رغم فشل الأول
  });
});
