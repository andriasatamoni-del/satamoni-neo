import type { Database } from "../../../src/shared/database/database.token";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { afterCommit, createTransactionalDb, TransactionService } from "../../../src/shared/database/transaction-context";

describe("TransactionService.isolated", () => {
  let base: Database;
  let tx: TransactionService;

  beforeAll(() => {
    base = createScriptDb(process.env.DATABASE_URL as string);
    tx = new TransactionService(createTransactionalDb(base));
  });

  afterAll(async () => {
    await closeScriptDb(base);
  });

  it("drops the after-commit hooks of a savepoint that rolled back and keeps the others", async () => {
    const ran: string[] = [];
    await tx.run(async () => {
      await tx.isolated(async () => afterCommit(() => void ran.push("kept")));
      await tx
        .isolated(async () => {
          await afterCommit(() => void ran.push("discarded"));
          throw new Error("row failed");
        })
        .catch(() => undefined);
      expect(ran).toEqual([]);
    });
    expect(ran).toEqual(["kept"]);
  });
});
