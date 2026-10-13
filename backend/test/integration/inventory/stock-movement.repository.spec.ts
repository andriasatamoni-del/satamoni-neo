import type { Database } from "../../../src/shared/database/database.token";
import { StockMovementRepository } from "../../../src/contexts/inventory/infrastructure/persistence/stock-movement.repository";
import { InventoryItemRepository } from "../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository";
import { BranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/branch.repository";
import { StockMovement } from "../../../src/contexts/inventory/domain/stock-movement.aggregate";
import { InventoryItem } from "../../../src/contexts/inventory/domain/inventory-item.aggregate";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { InsufficientStockError } from "../../../src/contexts/inventory/domain/errors";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { eq } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";

describe("StockMovementRepository", () => {
  let db: Database;
  let repo: StockMovementRepository;
  let itemRepo: InventoryItemRepository;
  let branchRepo: BranchRepository;
  let branchId: string;
  let itemId: string;

  beforeAll(async () => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    repo = new StockMovementRepository(db);
    itemRepo = new InventoryItemRepository(db);
    branchRepo = new BranchRepository(db);

    const branch = Branch.register({ name: "فرع حركات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const item = InventoryItem.register({ name: "دقيق-حركات-جست", unit: "كيلو" });
    await itemRepo.save(item);
    itemId = item.id;
  });

  afterAll(async () => {
    await db.delete(branchStockBalances);
    await db.delete(stockMovements);
    await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await closeScriptDb(db);
  });

  afterEach(async () => {
    await db.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
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
