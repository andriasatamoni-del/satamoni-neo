// اختبارات تكامل ضد قاعدة Postgres حقيقية (مش mocks) - نفس فلسفة الريبو القديم بالظبط. بتتشغّل
// بالترتيب (maxWorkers: 1) عشان الـglobalSetup بيصفّر نفس القاعدة لكل التشغيلة مش لكل ملف
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/integration/**/*.spec.ts"],
  moduleFileExtensions: ["js", "json", "ts"],
  maxWorkers: 1,
  testTimeout: 30000,
  globalSetup: "<rootDir>/test/integration/global-setup.js",
  setupFiles: ["<rootDir>/test/integration/setup.ts"],
};
