// Unit tests only - pure domain logic, no DB, no NestJS bootstrap. Integration tests use
// jest.integration.config.js instead (real Postgres test DB, see test/integration/setup.ts).
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/unit/**/*.spec.ts"],
  moduleFileExtensions: ["js", "json", "ts"],
  maxWorkers: 1,
  testTimeout: 30000,
};
