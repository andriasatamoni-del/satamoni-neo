import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql, type Kysely } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";
import { deleteAuditLogsForTest } from "../helpers/audit";

// Phase 3.1 regression harness: boots the REAL application against the disposable integration database (guarded by
// test/safety/assert-disposable-db.js), in STRICT accounting mode (the production default), with a small but complete world:
//   two branches (A, B) - users of every relevant role - chart of accounts - an inventory item with a known cost, stocked in both
//   branches - a menu variant (price 100) with a recipe (2 x item, item cost 5 -> COGS 10 per unit) - a cash payment method.

export interface World {
  app: INestApplication;
  db: Kysely<any>;
  http: () => ReturnType<INestApplication["getHttpServer"]>;
  tag: string;
  branchA: string;
  branchB: string;
  ingredientId: string;
  variantId: string;
  cashMethodId: string;
  visaMethodId: string;
  tokens: { admin: string; admin2: string; accountant: string; managerA: string; managerB: string; cashierA: string; cashierB: string };
  userIds: Record<string, string>;
  accountIds: Record<string, string>;
}

export const REQUIRED_ACCOUNT_DEFS: Array<[string, string, "ASSET" | "LIABILITY" | "REVENUE" | "EXPENSE" | "EQUITY"]> = [
  ["1100", "الكاش", "ASSET"],
  ["1400", "المخزون", "ASSET"],
  ["2100", "الموردين", "LIABILITY"],
  ["2400", "رواتب مستحقة", "LIABILITY"],
  ["4100", "مبيعات الطعام", "REVENUE"],
  ["5100", "تكلفة البضاعة المباعة", "EXPENSE"],
  ["6100", "مصروف الرواتب", "EXPENSE"],
  ["6950", "فروق كاش", "EXPENSE"],
];

export const INGREDIENT_UNIT_COST = 5;
export const RECIPE_QTY = 2;
export const VARIANT_PRICE = 100;
export const COGS_PER_UNIT = INGREDIENT_UNIT_COST * RECIPE_QTY; // 10

export async function bootstrap(tag: string, options: { accounts?: boolean; stock?: number } = {}): Promise<World> {
  process.env.ACCOUNTING_ENFORCEMENT = "strict";
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const db = app.get<Kysely<any>>(KYSELY);

  const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
  const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
  const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
  const { KyselyBranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository");
  const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
  const { KyselyInventoryItemRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository");
  const { KyselyStockMovementRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/kysely-stock-movement.repository");
  const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
  const { StockMovement } = await import("../../../src/contexts/inventory/domain/stock-movement.aggregate");
  const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
  const { KyselyRecipeRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-recipe.repository");
  const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
  const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");
  const { KyselyAccountRepository } = await import("../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository");
  const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

  const branchRepo = new KyselyBranchRepository(db);
  const bA = Branch.register({ name: `فرع-A-${tag}` });
  const bB = Branch.register({ name: `فرع-B-${tag}` });
  await branchRepo.save(bA);
  await branchRepo.save(bB);

  const userRepo = new KyselyUserRepository(db);
  const hasher = new BcryptPasswordHasher();
  const passwordHash = await hasher.hash("12345678");
  const defs: Array<[keyof World["tokens"], "admin" | "accountant" | "branch_manager" | "cashier", string | null]> = [
    ["admin", "admin", null],
    ["admin2", "admin", null],
    ["accountant", "accountant", null],
    ["managerA", "branch_manager", bA.id],
    ["managerB", "branch_manager", bB.id],
    ["cashierA", "cashier", bA.id],
    ["cashierB", "cashier", bB.id],
  ];
  const tokens = {} as World["tokens"];
  const userIds: Record<string, string> = {};
  for (const [key, role, branchId] of defs) {
    const email = `${tag}-${key}@p31.jest.test`.toLowerCase();
    const user = User.register({ name: `${key}-${tag}`, email, passwordHash, role, branchId });
    await userRepo.save(user);
    userIds[key] = user.id;
    const res = await request(app.getHttpServer()).post("/auth/login").send({ email, password: "12345678" });
    tokens[key] = res.body.token as string;
  }

  const accountRepo = new KyselyAccountRepository(db);
  const accountIds: Record<string, string> = {};
  if (options.accounts !== false) {
    for (const [code, name, accountType] of REQUIRED_ACCOUNT_DEFS) {
      const account = Account.register({ code, name, accountType, isSystemAccount: true });
      await accountRepo.save(account);
      accountIds[code] = account.id;
    }
  }

  const inventoryRepo = new KyselyInventoryItemRepository(db);
  const ingredient = InventoryItem.register({ name: `مكوّن-${tag}`, unit: "كيلو", unitCost: INGREDIENT_UNIT_COST, negativeStockPolicy: "STRICT" });
  await inventoryRepo.save(ingredient);
  const movementRepo = new KyselyStockMovementRepository(db);
  for (const branchId of [bA.id, bB.id]) {
    await movementRepo.recordMovement(
      StockMovement.register({ inventoryItemId: ingredient.id, branchId, movementType: "RECEIPT", quantityDelta: options.stock ?? 100 }),
      { allowNegativeBalance: true }
    );
  }

  const menuRepo = new KyselyMenuItemRepository(db);
  const item = MenuItem.register({ name: `صنف-${tag}` });
  const variant = item.addVariant({ label: "عادي", price: VARIANT_PRICE });
  await menuRepo.save(item);
  const recipeRepo = new KyselyRecipeRepository(db);
  const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: variant.id });
  const version = recipe.createDraftVersion({});
  recipe.addIngredient(version.id, { ingredientItemId: ingredient.id, quantity: RECIPE_QTY });
  recipe.activateVersion(version.id);
  await recipeRepo.save(recipe);

  const method = async (name: string, body: Record<string, unknown>) =>
    (await request(app.getHttpServer()).post("/payment-control/payment-methods").set("Authorization", `Bearer ${tokens.admin}`).send({ name: `${name}-${tag}`, ...body })).body
      .id as string;
  const cashMethodId = await method("كاش", { kind: "cash" });
  const visaMethodId = await method("فيزا", { kind: "card_or_wallet", settlementChannel: "visa_pos" });

  return {
    app,
    db,
    http: () => app.getHttpServer(),
    tag,
    branchA: bA.id,
    branchB: bB.id,
    ingredientId: ingredient.id,
    variantId: variant.id,
    cashMethodId,
    visaMethodId,
    tokens,
    userIds,
    accountIds,
  };
}

/** Removes everything a Phase 3.1 spec created (the integration DB is disposable; specs must leave it clean for the next one). */
export async function teardown(world: World): Promise<void> {
  const { db } = world;
  const userIds = Object.values(world.userIds);
  for (const table of INJECTED_TABLES) await sql.raw(`DROP TRIGGER IF EXISTS p31_fail_trigger ON ${table}`).execute(db).catch(() => undefined);
  await deleteAuditLogsForTest(db, sql`TRUE`);
  for (const stmt of [
    sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`,
    sql`DELETE FROM payment_adjustment_requests`,
    sql`DELETE FROM payment_reconciliation_records`,
    sql`DELETE FROM supplier_payments`,
    sql`DELETE FROM supplier_invoice_lines`,
    sql`DELETE FROM supplier_invoices`,
    sql`DELETE FROM payments`,
    sql`DELETE FROM print_jobs`,
    sql`DELETE FROM order_items`,
    sql`DELETE FROM delivery_assignments`,
    sql`DELETE FROM orders`,
    sql`DELETE FROM purchase_order_items`,
    sql`DELETE FROM goods_receipt_items`,
    sql`DELETE FROM goods_receipts`,
    sql`DELETE FROM purchase_orders`,
    sql`DELETE FROM suppliers`,
    sql`DELETE FROM inventory_batches`,
    sql`DELETE FROM conversion_order_input_lines`,
    sql`DELETE FROM conversion_orders`,
    sql`UPDATE payroll_adjustments SET payroll_run_id = NULL`,
    sql`DELETE FROM payroll_adjustments`,
    sql`UPDATE payroll_runs SET status = 'DRAFT'`,
    sql`DELETE FROM payroll_run_employees`,
    sql`DELETE FROM payroll_runs`,
    sql`DELETE FROM employee_history`,
    sql`DELETE FROM employees`,
    sql`DELETE FROM expenses`,
    sql`DELETE FROM purchase_lines`,
    sql`DELETE FROM purchases`,
    sql`DELETE FROM cash_drawer_entries`,
    sql`DELETE FROM cashier_shifts`,
    sql`DELETE FROM drivers`,
    sql`DELETE FROM treasuries`,
    sql`DELETE FROM stock_movements`,
    sql`DELETE FROM branch_stock_balances`,
    sql`DELETE FROM transfer_requests`,
    sql`DELETE FROM recipe_ingredients`,
    sql`DELETE FROM recipe_versions`,
    sql`DELETE FROM recipes`,
    sql`DELETE FROM menu_item_variants`,
    sql`DELETE FROM menu_items`,
    sql`DELETE FROM payment_methods`,
    sql`DELETE FROM accounts WHERE code IN ('1100','1400','2100','2400','4100','5100','6100','6950')`,
    sql`DELETE FROM inventory_items`,
  ]) {
    await stmt.execute(db).catch(() => undefined);
  }
  // whatever the individual specs created on top of the world (stocktakes, shifts, categories, transfers ...): cascade by the FK graph
  await purge(db, "branches", [world.branchA, world.branchB]);
  await purge(db, "users", userIds);
  for (const table of ["inventory_items", "menu_items", "suppliers", "payment_methods", "expense_categories"]) {
    const { rows } = await sql<{ id: string }>`SELECT id::text FROM ${sql.table(table)}`.execute(db).catch(() => ({ rows: [] as { id: string }[] }));
    await purge(db, table, rows.map((r) => r.id));
  }
  await sql`DELETE FROM accounts WHERE code IN ('1100','1400','2100','2400','4100','5100','6100','6950')`.execute(db).catch(() => undefined);
  await world.app.close();
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function createOrder(
  world: World,
  token: string,
  overrides: { branchId?: string; quantity?: number; paymentMethodId?: string; clientRequestId?: string } = {}
) {
  return request(world.http())
    .post("/orders")
    .set(auth(token))
    .send({
      branchId: overrides.branchId ?? world.branchA,
      orderType: "takeaway",
      items: [{ variantId: world.variantId, quantity: overrides.quantity ?? 1 }],
      paymentMethodId: overrides.paymentMethodId ?? world.cashMethodId,
      ...(overrides.clientRequestId ? { clientRequestId: overrides.clientRequestId } : {}),
    });
}

export async function stockOf(world: World, branchId: string, itemId = world.ingredientId): Promise<number> {
  const { rows } = await sql<{ quantity: string }>`SELECT quantity FROM branch_stock_balances WHERE branch_id = ${branchId} AND inventory_item_id = ${itemId}`.execute(world.db);
  return Number(rows[0]?.quantity ?? 0);
}

export async function count(world: World, table: string, where = sql`TRUE`): Promise<number> {
  const { rows } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${sql.table(table)} WHERE ${where}`.execute(world.db);
  return Number(rows[0].n);
}

export async function journalsFor(world: World, sourceType: string, sourceId: string) {
  const { rows } = await sql<{ id: string; status: string; reversal_of_entry_id: string | null; entry_date: Date }>`
    SELECT id, status, reversal_of_entry_id, entry_date FROM journal_entries WHERE source_type = ${sourceType} AND source_id = ${sourceId} ORDER BY created_at`.execute(world.db);
  return rows;
}

/** Net debit - credit of an account code over POSTED entries (reversals are POSTED entries of their own). */
export async function accountBalance(world: World, code: string): Promise<number> {
  const { rows } = await sql<{ bal: string | null }>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS bal
      FROM journal_entry_lines l JOIN journal_entries j ON j.id = l.journal_entry_id JOIN accounts a ON a.id = l.account_id
     WHERE a.code = ${code} AND j.status IN ('POSTED','REVERSED')`.execute(world.db);
  return Number(rows[0].bal ?? 0);
}

/** The whole ledger must always balance (debits == credits) - the accounting reconciliation invariant. */
export async function ledgerImbalance(world: World): Promise<number> {
  const { rows } = await sql<{ d: string | null }>`
    SELECT COALESCE(SUM(l.debit) - SUM(l.credit), 0)::text AS d FROM journal_entry_lines l JOIN journal_entries j ON j.id = l.journal_entry_id WHERE j.status IN ('POSTED','REVERSED')`.execute(world.db);
  return Number(rows[0].d ?? 0);
}

/** Fires `n` identical requests at the same instant and returns their status codes (the concurrency primitive). */
export async function fireConcurrently<T>(n: number, make: (i: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => make(i)));
}

/** Number of REVERSAL entries that reverse the journal(s) of a business transaction. */
export async function reversalsOf(world: World, sourceType: string, sourceId: string): Promise<number> {
  const { rows } = await sql<{ n: string }>`
    SELECT count(*)::text AS n FROM journal_entries r
     WHERE r.reversal_of_entry_id IN (SELECT id FROM journal_entries WHERE source_type = ${sourceType} AND source_id = ${sourceId})`.execute(world.db);
  return Number(rows[0].n);
}

// ---- failure injection (test database only): a trigger that makes every INSERT into `table` raise ----
const INJECTED_TABLES = ["journal_entries", "stock_movements", "payments", "audit_logs", "payroll_runs", "branch_stock_balances"];

export async function injectInsertFailure(world: World, table: (typeof INJECTED_TABLES)[number]): Promise<() => Promise<void>> {
  if (!INJECTED_TABLES.includes(table)) throw new Error("table not allowed for failure injection");
  await sql`CREATE OR REPLACE FUNCTION p31_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'p31 injected failure' USING ERRCODE = 'XX000'; END $$`.execute(world.db);
  await sql.raw(`CREATE TRIGGER p31_fail_trigger BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION p31_fail()`).execute(world.db);
  return async () => {
    await sql.raw(`DROP TRIGGER IF EXISTS p31_fail_trigger ON ${table}`).execute(world.db);
  };
}

/** Snapshot of every business table an order touches - used to prove a rejected command wrote NOTHING. */
export async function orderWriteFootprint(world: World): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ["orders", "order_items", "payments", "stock_movements", "journal_entries", "journal_entry_lines", "print_jobs"]) out[t] = await count(world, t);
  out.stockA = await stockOf(world, world.branchA);
  return out;
}

/**
 * Deletes `ids` of `table` AND, recursively, every row that references them through a foreign key (test database only; runs with
 * triggers/constraints disabled via session_replication_role so immutable ledgers can be cleaned). Used by specs to leave the shared
 * disposable database exactly as they found it.
 */
export async function purge(db: Kysely<any>, table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction().execute(async (trx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(trx);
    const seen = new Set<string>();
    const walk = async (parent: string, parentIds: string[]): Promise<void> => {
      if (parentIds.length === 0) return;
      const { rows: fks } = await sql<{ child: string; col: string; parent_col: string }>`
        SELECT c.conrelid::regclass::text AS child, a.attname AS col, pa.attname AS parent_col
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
          JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
         WHERE c.contype = 'f' AND c.confrelid = ${parent}::regclass AND array_length(c.conkey, 1) = 1`.execute(trx);
      for (const fk of fks) {
        const key = `${fk.child}.${fk.col}<-${parent}:${parentIds.join(",")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const childTable = fk.child.replace(/"/g, "");
        const hasId = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM information_schema.columns WHERE table_name = ${childTable} AND column_name = 'id'`.execute(trx)).rows[0].n !== "0";
        const parentKey = fk.parent_col;
        const inList = sql.join(parentIds.map((i) => sql`${i}::uuid`));
        if (hasId) {
          const { rows } = await sql<{ id: string }>`SELECT id::text FROM ${sql.table(childTable)} WHERE ${sql.ref(fk.col)} IN (${inList}) AND ${sql.table(childTable)}.id::text <> ALL(${parentIds}::text[])`.execute(trx).catch(() => ({ rows: [] as { id: string }[] }));
          await walk(childTable, rows.map((r) => r.id));
        }
        await sql`DELETE FROM ${sql.table(childTable)} WHERE ${sql.ref(fk.col)} IN (${inList})`.execute(trx).catch(() => undefined);
        void parentKey;
      }
    };
    await walk(table, ids);
    const inList = sql.join(ids.map((i) => sql`${i}::uuid`));
    await sql`DELETE FROM ${sql.table(table)} WHERE id IN (${inList})`.execute(trx);
  });
}
