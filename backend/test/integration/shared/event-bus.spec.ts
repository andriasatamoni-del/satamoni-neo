import { eq } from "drizzle-orm";
import { EventBusService } from "../../../src/shared/events/event-bus.service";
import { DomainEvent } from "../../../src/shared/events/domain-event";
import type { Database } from "../../../src/shared/database/database.token";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { eventOutbox } from "../../../src/shared/database/shared.tables";

class TestEvent extends DomainEvent {
  readonly eventName = "TestEvent";
  constructor(public readonly value: number) {
    super();
  }
}

describe("EventBusService", () => {
  let db: Database;
  let bus: EventBusService;

  beforeAll(() => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    bus = new EventBusService(db);
  });

  afterAll(async () => {
    await closeScriptDb(db);
  });

  afterEach(async () => {
    await db.delete(eventOutbox);
  });

  test("بينشر الحدث ويسجّله في event_outbox، وبينادي كل الـsubscribers", async () => {
    const received: number[] = [];
    bus.subscribe<TestEvent>("TestEvent", (e) => {
      received.push(e.value);
    });

    await bus.publish(new TestEvent(42));
    expect(received).toEqual([42]);

    const [row] = await db.select().from(eventOutbox).where(eq(eventOutbox.event_name, "TestEvent")).limit(1);
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
