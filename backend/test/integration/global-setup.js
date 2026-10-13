// بيتصفّر قاعدة الاختبار (DROP + إعادة تطبيق الـmigrations) قبل أي تشغيلة اختبارات تكامل - نفس فلسفة
// tests/global-setup.js في الريبو القديم بالظبط، بس هنا بنشغّل migrations حقيقية بدل schema.sql واحد
require("dotenv").config();
const { Client } = require("pg");
const { execSync } = require("node:child_process");
const { assertDisposableDatabase } = require("../safety/assert-disposable-db");

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_neo_test";

module.exports = async () => {
  assertDisposableDatabase(TEST_DATABASE_URL);
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  // سجلّ الـmigrations بتاع Drizzle في schema اسمها drizzle مش public - لازم تتمسح هي كمان، وإلا الـrunner
  // يفتكر إن الـbaseline اتطبّق ومايعملش أي جدول
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
  await client.end();

  execSync("npx ts-node src/migrations/run-migrations.ts", {
    cwd: __dirname + "/../..",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
};
