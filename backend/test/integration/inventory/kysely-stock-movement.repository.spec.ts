import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyStockMovementRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-stock-movement.repository";
import { KyselyInventoryItemRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { StockMovement } from "../../../src/contexts/inventory/domain/stock-movement.aggregate";
import { InventoryItem } from "../../../src/contexts/inventory/domain/inventory-item.aggregate";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { InsufficientStockError } from "../../../src/contexts/inventory/domain/errors";

describe("KyselyStockMovementRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyStockMovementRepository;
  let itemRepo: KyselyInventoryItemRepository;
  let branchRepo: KyselyBranchRepository;
  let branchId: string;
  let itemId: string;

  beforeAll(async () => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    repo = new KyselyStockMovementRepository(db);
    itemRepo = new KyselyInventoryItemRepository(db);
    branchRepo = new KyselyBranchRepository(db);

    const branch = Branch.register({ name: "فرع حركات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const item = InventoryItem.register({ name: "دقيق-حركات-جست", unit: "كيلو" });
    await itemRepo.save(item);
    itemId = item.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM branch_stock_balances`.execute(db);
    await sql`DELETE FROM stock_movements`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${itemId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
  });

  test("أول حركة (استلام) بتنشئ رصيد جديد صح", async () => {
    const movement = StockMovement.register({
      inventoryItemId: itemId, branchId, movementType: "RECEIPT", quantityDelta: 50,
    });
    const { balanceAfter } = await repo.recordMovement(movement, { allowNegativeBalance: false });
    expect(balanceAfter).toBe(50);
    expect(await repo.getBalance(branchId, itemId)).toBe(50);
  });

  test("حركات متتالية بتتراكم على نفس الرصيد صح", async () => {
    await repo.recordMovement(
      StockMovement.register({ inventoryItemId: itemId, branchId, movementType: "RECEIPT", quantityDelta: 100 }),
      { allowNegativeBalance: false }
    );
    const { balanceAfter } = await repo.recordMovement(
      StockMovement.register({ inventoryItemId: itemId, branchId, movementType: "CONSUMPTION", quantityDelta: -30 }),
      { allowNegativeBalance: false }
    );
    expect(balanceAfter).toBe(70);
  });

  test("حركة هتخلي الرصيد سالب بترفض لو الصنف STRICT، ومفيش حاجة بتتسجل (rollback)", async () => {
    await repo.recordMovement(
      StockMovement.register({ inventoryItemId: itemId, branchId, movementType: "RECEIPT", quantityDelta: 10 }),
      { allowNegativeBalance: false }
    );

    await expect(
      repo.recordMovement(
        StockMovement.register({ inventoryItemId: itemId, branchId, movementType: "CONSUMPTION", quantityDelta: -20 }),
        { allowNegativeBalance: false }
      )
    ).rejects.toThrow(InsufficientStockError);

    expect(await repo.getBalance(branchId, itemId)).toBe(10);
    expect(await repo.listMovements({ branchId, inventoryItemId: itemId })).toHaveLength(1);
  });

  test("حركة هتخلي الرصيد سالب بتتقبل لو allowNegativeBalance=true", async () => {
    const { balanceAfter } = await repo.recordMovement(
      StockMovement.register({ inventoryItemId: itemId, branchId, movementType: "ADJUSTMENT", quantityDelta: -15 }),
      { allowNegativeBalance: true }
    );
    expect(balanceAfter).toBe(-15);
  });

  test("findByLegacyReferenceKey بيلاقي الحركة المستوردة بمفتاح idempotency بتاعها", async () => {
    const movement = StockMovement.register({
      inventoryItemId: itemId, branchId, movementType: "OPENING_BALANCE", quantityDelta: 5,
      legacyReferenceKey: "opening_balance:test-key-1",
    });
    await repo.recordMovement(movement, { allowNegativeBalance: true });

    const found = await repo.findByLegacyReferenceKey("opening_balance:test-key-1");
    expect(found?.id).toBe(movement.id);
    expect(await repo.findByLegacyReferenceKey("no-such-key")).toBeNull();
  });
});
