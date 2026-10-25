import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { eq } from "drizzle-orm";
import { assertLocalDevDatabase } from "./seed-dev";
import { SimulatedClock, addDays, cairoTime } from "./demo/clock";
import { DEMO_MARKER_BRANCH, DEMO_LOGIN_SECRET, STAFF } from "./demo/demo-data";
import { seededRandom, type SeedContext } from "./demo/seed-context";

const EXTERNAL_SERVICE_KEYS = [
  "SMS_WEBHOOK_URL",
  "SMS_WEBHOOK_AUTH_HEADER",
  "GEMINI_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_STAFF_NOTIFY_NUMBER",
  "META_PAGE_ACCESS_TOKEN",
  "TALABAT_CLIENT_ID",
  "TALABAT_CLIENT_SECRET",
];

function parseDays(argv: string[]): number {
  const index = argv.indexOf("--days");
  const days = index >= 0 ? Number(argv[index + 1]) : 45;
  if (!Number.isInteger(days) || days < 1 || days > 120) throw new Error("--days must be an integer between 1 and 120");
  return days;
}

async function main() {
  const url = process.env.DATABASE_URL;
  assertLocalDevDatabase(url);
  const days = parseDays(process.argv);

  const { TALABAT_SEED_SECRET } = await import("./demo/daily-operations");
  process.env.TZ = "UTC";
  process.env.ACCOUNTING_ENFORCEMENT = "strict";
  process.env.TALABAT_WEBHOOK_SECRET = TALABAT_SEED_SECRET;
  for (const key of EXTERNAL_SERVICE_KEYS) delete process.env[key];

  const { businessDateString } = await import("../../src/shared/time/business-date");
  const lastDay = addDays(businessDateString(new Date()), -1);
  const firstDay = addDays(lastDay, -(days - 1));

  const clock = new SimulatedClock();
  clock.set(cairoTime(firstDay, 7, 0));
  clock.install();

  const { AppModule } = await import("../../src/app.module");
  const { DATABASE } = await import("../../src/shared/database/database.token");
  const { branches } = await import("../../src/contexts/branches/infrastructure/persistence/branches.tables");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  try {
    const db = app.get(DATABASE, { strict: false });
    const [existing] = await db.select({ id: branches.id }).from(branches).where(eq(branches.name, DEMO_MARKER_BRANCH));
    if (existing) {
      console.log("ℹ️  Demo data is already seeded on this database. Run `pnpm db:reset` (or teardown/setup your worktree) to reseed.");
      return;
    }

    const ctx: SeedContext = {
      app,
      db,
      clock,
      rand: seededRandom(20260917),
      users: {},
      branches: {},
      treasuries: {},
      bankTreasuryId: "",
      accounts: {},
      inventory: {},
      suppliers: {},
      menuItems: {},
      variants: {},
      combos: {},
      paymentMethods: {},
      drivers: {},
      employees: {},
      customers: [],
      expenseCategories: {},
      rewards: [],
      stats: {},
    };

    const { seedMasterData } = await import("./demo/master-data");
    const { runBranchDay, resolveComplaints, registerInstapayStatements, RETAIL_BRANCHES } = await import("./demo/daily-operations");
    const { runBackOffice } = await import("./demo/back-office");

    console.log(`🌱 Seeding master data (business day ${firstDay})…`);
    await seedMasterData(ctx);

    const started = performance.now();
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      const before = ordersSoFar(ctx);
      await runBackOffice(ctx, day, firstDay, lastDay);
      await resolveComplaints(ctx, day);
      for (const branch of RETAIL_BRANCHES) {
        try {
          await runBranchDay(ctx, day, branch);
        } catch (err) {
          console.warn(`   ⚠️  ${day} ${branch.name}: ${err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err)}`);
          ctx.stats[`failed:branchDay`] = (ctx.stats[`failed:branchDay`] ?? 0) + 1;
        }
      }
      await registerInstapayStatements(ctx, day);
      console.log(`   📅 ${day}: ${ordersSoFar(ctx) - before} orders`);
    }

    clock.uninstall();
    console.log(`\n✅ Demo seed done in ${Math.round((performance.now() - started) / 1000)}s - ${firstDay} → ${lastDay} (${days} business days)`);
    for (const [key, value] of Object.entries(ctx.stats).sort(([a], [b]) => a.localeCompare(b))) console.log(`   ${key.padEnd(42)} ${value}`);
    console.log(`\n🔑 Every staff and customer login uses the password: ${DEMO_LOGIN_SECRET}`);
    for (const s of STAFF) console.log(`   ${s.roles.join(",").padEnd(15)} ${s.email}`);
    console.log("   customers: customer001@mail.satamoni-demo.example … customer048@mail.satamoni-demo.example");
  } finally {
    clock.uninstall();
    await app.close();
  }
}

function ordersSoFar(ctx: SeedContext): number {
  return Object.entries(ctx.stats)
    .filter(([key]) => key.startsWith("orders:") && !["orders:completed", "orders:cancelled", "orders:talabatCancelled"].includes(key))
    .reduce((sum, [, value]) => sum + value, 0);
}

main().catch((err) => {
  console.error("❌ Demo seed failed:", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
