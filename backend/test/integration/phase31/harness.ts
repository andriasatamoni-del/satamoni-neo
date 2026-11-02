import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { and, count as drizzleCount, eq, getTableColumns, getTableName, inArray, is, notInArray, sql, type SQL } from "drizzle-orm";
import { getTableConfig, PgTable, type PgColumn } from "drizzle-orm/pg-core";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database, DatabaseTx } from "../../../src/shared/database/database.token";
import * as schema from "../../../src/shared/database/schema";
import { tableByName } from "../../../src/shared/database/transaction-context";
import { deleteAuditLogsForTest } from "../helpers/audit";
import { accounts, journalEntries, journalEntryLines } from "../../../src/contexts/accounting/infrastructure/persistence/accounting.tables";
import { payrollAdjustments, payrollRuns } from "../../../src/contexts/hr-payroll/infrastructure/persistence/hr-payroll.tables";
import { branchStockBalances } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";


export interface World {
  app: INestApplication;
  db: Database;
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
const REQUIRED_ACCOUNT_CODES = REQUIRED_ACCOUNT_DEFS.map(([code]) => code);

export const INGREDIENT_UNIT_COST = 5;
export const RECIPE_QTY = 2;
export const VARIANT_PRICE = 100;
export const COGS_PER_UNIT = INGREDIENT_UNIT_COST * RECIPE_QTY;

export async function bootstrap(tag: string, options: { accounts?: boolean; stock?: number } = {}): Promise<World> {
  process.env.ACCOUNTING_ENFORCEMENT = "strict";
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const db = app.get<Database>(DATABASE);

  const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
  const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
  const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
  const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
  const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
  const { InventoryItemRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository");
  const { StockMovementRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/stock-movement.repository");
  const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
  const { StockMovement } = await import("../../../src/contexts/inventory/domain/stock-movement.aggregate");
  const { MenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository");
  const { RecipeRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/recipe.repository");
  const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
  const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");
  const { AccountRepository } = await import("../../../src/contexts/accounting/infrastructure/persistence/account.repository");
  const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

  const branchRepo = new BranchRepository(db);
  const bA = Branch.register({ name: `فرع-A-${tag}` });
  const bB = Branch.register({ name: `فرع-B-${tag}` });
  await branchRepo.save(bA);
  await branchRepo.save(bB);

  const userRepo = new UserRepository(db);
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
    const user = User.register({ name: `${key}-${tag}`, email, passwordHash, roles: [role], branchId });
    await userRepo.save(user);
    userIds[key] = user.id;
    const res = await request(app.getHttpServer()).post("/auth/login").send({ email, password: "12345678" });
    tokens[key] = res.body.token as string;
  }

  const accountRepo = new AccountRepository(db);
  const accountIds: Record<string, string> = {};
  if (options.accounts !== false) {
    for (const [code, name, accountType] of REQUIRED_ACCOUNT_DEFS) {
      const account = Account.register({ code, name, accountType, isSystemAccount: true });
      await accountRepo.save(account);
      accountIds[code] = account.id;
    }
  }

  const inventoryRepo = new InventoryItemRepository(db);
  const ingredient = InventoryItem.register({ name: `مكوّن-${tag}`, unit: "كيلو", unitCost: INGREDIENT_UNIT_COST, negativeStockPolicy: "STRICT" });
  await inventoryRepo.save(ingredient);
  const movementRepo = new StockMovementRepository(db);
  for (const branchId of [bA.id, bB.id]) {
    await movementRepo.recordMovement(
      StockMovement.register({ inventoryItemId: ingredient.id, branchId, movementType: "RECEIPT", quantityDelta: options.stock ?? 100 }),
      { allowNegativeBalance: true }
    );
  }

  const menuRepo = new MenuItemRepository(db);
  const item = MenuItem.register({ name: `صنف-${tag}` });
  const variant = item.addVariant({ label: "عادي", price: VARIANT_PRICE, talabatPrice: VARIANT_PRICE });
  await menuRepo.save(item);
  const recipeRepo = new RecipeRepository(db);
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

export async function teardown(world: World): Promise<void> {
  const { db } = world;
  const userIds = Object.values(world.userIds);
  for (const table of INJECTED_TABLES) await testDdl(world, sql`DROP TRIGGER IF EXISTS p31_fail_trigger ON ${sql.identifier(table)}`).catch(() => undefined);
  await deleteAuditLogsForTest(db);
  await asReplica(db, async (tx) => {
    for (const table of referencingClosure([journalEntryLines, journalEntries])) await tx.delete(table);
  }).catch(() => undefined);
  const wipe = (name: string) => () => db.delete(tableOf(name));
  for (const step of [
    wipe("payment_adjustment_requests"),
    wipe("payment_reconciliation_records"),
    wipe("supplier_payments"),
    wipe("supplier_invoice_lines"),
    wipe("supplier_invoices"),
    wipe("payments"),
    wipe("print_jobs"),
    wipe("order_items"),
    wipe("delivery_assignments"),
    wipe("orders"),
    wipe("purchase_order_items"),
    wipe("goods_receipt_items"),
    wipe("goods_receipts"),
    wipe("purchase_orders"),
    wipe("suppliers"),
    wipe("inventory_batches"),
    wipe("conversion_order_input_lines"),
    wipe("conversion_orders"),
    () => db.update(payrollAdjustments).set({ payroll_run_id: null }),
    wipe("payroll_adjustments"),
    () => db.update(payrollRuns).set({ status: "DRAFT" }),
    wipe("payroll_run_employees"),
    wipe("payroll_runs"),
    wipe("employee_history"),
    wipe("employees"),
    wipe("expenses"),
    wipe("purchase_lines"),
    wipe("purchases"),
    wipe("cash_drawer_entries"),
    wipe("cashier_shifts"),
    wipe("drivers"),
    wipe("treasuries"),
    wipe("stock_movements"),
    wipe("branch_stock_balances"),
    wipe("transfer_requests"),
    wipe("recipe_ingredients"),
    wipe("recipe_versions"),
    wipe("recipes"),
    wipe("menu_item_variants"),
    wipe("menu_items"),
    wipe("payment_methods"),
    () => db.delete(accounts).where(inArray(accounts.code, REQUIRED_ACCOUNT_CODES)),
    wipe("inventory_items"),
  ]) {
    await step().catch(() => undefined);
  }
  await purge(db, "branches", [world.branchA, world.branchB]);
  await purge(db, "users", userIds);
  for (const name of ["inventory_items", "menu_items", "suppliers", "payment_methods", "expense_categories"]) {
    const table = tableOf(name);
    const rows = await db
      .select({ id: columnOf(table, "id") })
      .from(table)
      .catch(() => [] as Array<{ id: unknown }>);
    await purge(db, name, rows.map((r) => String(r.id)));
  }
  await db.delete(accounts).where(inArray(accounts.code, REQUIRED_ACCOUNT_CODES)).catch(() => undefined);
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
  const rows = await world.db
    .select({ quantity: branchStockBalances.quantity })
    .from(branchStockBalances)
    .where(and(eq(branchStockBalances.branch_id, branchId), eq(branchStockBalances.inventory_item_id, itemId)));
  return Number(rows[0]?.quantity ?? 0);
}

export async function count(world: World, table: PgTable, where?: SQL): Promise<number> {
  const [row] = await world.db.select({ n: drizzleCount() }).from(table).where(where);
  return Number(row.n);
}

export async function journalsFor(world: World, sourceType: string, sourceId: string) {
  return world.db
    .select({
      id: journalEntries.id,
      status: journalEntries.status,
      reversal_of_entry_id: journalEntries.reversal_of_entry_id,
      entry_date: journalEntries.entry_date,
    })
    .from(journalEntries)
    .where(and(eq(journalEntries.source_type, sourceType), eq(journalEntries.source_id, sourceId)))
    .orderBy(journalEntries.created_at);
}

export async function accountBalance(world: World, code: string): Promise<number> {
  const [row] = await world.db
    .select({ bal: sql<string | null>`COALESCE(SUM(${journalEntryLines.debit} - ${journalEntryLines.credit}), 0)::text` })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journal_entry_id))
    .innerJoin(accounts, eq(accounts.id, journalEntryLines.account_id))
    .where(and(eq(accounts.code, code), inArray(journalEntries.status, ["POSTED", "REVERSED"])));
  return Number(row.bal ?? 0);
}

export async function ledgerImbalance(world: World): Promise<number> {
  const [row] = await world.db
    .select({ d: sql<string | null>`COALESCE(SUM(${journalEntryLines.debit}) - SUM(${journalEntryLines.credit}), 0)::text` })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journal_entry_id))
    .where(inArray(journalEntries.status, ["POSTED", "REVERSED"]));
  return Number(row.d ?? 0);
}

export async function fireConcurrently<T>(n: number, make: (i: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => make(i)));
}

export async function reversalsOf(world: World, sourceType: string, sourceId: string): Promise<number> {
  const originals = world.db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.source_type, sourceType), eq(journalEntries.source_id, sourceId)));
  return count(world, journalEntries, inArray(journalEntries.reversal_of_entry_id, originals));
}

export async function testDdl(world: World, statement: SQL): Promise<void> {
  await world.db.execute(statement);
}

const INJECTED_TABLES = ["journal_entries", "stock_movements", "payments", "audit_logs", "payroll_runs", "branch_stock_balances"];

export async function injectInsertFailure(world: World, table: (typeof INJECTED_TABLES)[number]): Promise<() => Promise<void>> {
  if (!INJECTED_TABLES.includes(table)) throw new Error("table not allowed for failure injection");
  await testDdl(
    world,
    sql`CREATE OR REPLACE FUNCTION p31_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'p31 injected failure' USING ERRCODE = 'XX000'; END $$`
  );
  await testDdl(world, sql`CREATE TRIGGER p31_fail_trigger BEFORE INSERT ON ${sql.identifier(table)} FOR EACH ROW EXECUTE FUNCTION p31_fail()`);
  return async () => {
    await testDdl(world, sql`DROP TRIGGER IF EXISTS p31_fail_trigger ON ${sql.identifier(table)}`);
  };
}

export async function orderWriteFootprint(world: World): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ["orders", "order_items", "payments", "stock_movements", "journal_entries", "journal_entry_lines", "print_jobs"]) out[t] = await count(world, tableOf(t));
  out.stockA = await stockOf(world, world.branchA);
  return out;
}

const ALL_TABLES = (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable));

function tableOf(name: string): PgTable {
  const table = tableByName(name);
  if (!table) throw new Error(`unknown table: ${name}`);
  return table;
}

function columnOf(table: PgTable, name: string): PgColumn {
  const column = Object.values(getTableColumns(table)).find((c) => c.name === name);
  if (!column) throw new Error(`unknown column: ${getTableName(table)}.${name}`);
  return column;
}

function foreignKeysTo(parent: PgTable): Array<{ child: PgTable; column: PgColumn }> {
  return ALL_TABLES.flatMap((child) =>
    getTableConfig(child)
      .foreignKeys.map((fk) => fk.reference())
      .filter((ref) => ref.foreignTable === parent && ref.columns.length === 1)
      .map((ref) => ({ child, column: ref.columns[0] }))
  );
}

function referencingClosure(roots: PgTable[]): PgTable[] {
  const out = new Set<PgTable>(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    for (const { child } of foreignKeysTo(queue.shift() as PgTable)) {
      if (out.has(child)) continue;
      out.add(child);
      queue.push(child);
    }
  }
  return [...out];
}

async function asReplica(db: Database, fn: (tx: DatabaseTx) => Promise<void>): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.select({ role: sql`set_config('session_replication_role', 'replica', true)` }).from(sql`(VALUES (1)) AS cfg`);
    await fn(tx);
  });
}

export async function purge(db: Database, table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await asReplica(db, async (tx) => {
    const seen = new Set<string>();
    const walk = async (parent: PgTable, parentIds: string[]): Promise<void> => {
      if (parentIds.length === 0) return;
      for (const { child, column } of foreignKeysTo(parent)) {
        const key = `${getTableName(child)}.${column.name}<-${getTableName(parent)}:${parentIds.join(",")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const childId = (getTableColumns(child) as Record<string, PgColumn | undefined>).id;
        if (childId) {
          const rows = await tx
            .select({ id: childId })
            .from(child)
            .where(and(inArray(column, parentIds), notInArray(sql`${childId}::text`, parentIds)));
          await walk(child, rows.map((r) => String(r.id)));
        }
        await tx.delete(child).where(inArray(column, parentIds));
      }
    };
    const root = tableOf(table);
    await walk(root, ids);
    await tx.delete(root).where(inArray(columnOf(root, "id"), ids));
  });
}
