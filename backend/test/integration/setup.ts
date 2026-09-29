// نفس فلسفة tests/env.js في الريبو القديم - قاعدة اختبار منفصلة تمامًا، بتتصفّر قبل كل تشغيلة
import "dotenv/config";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_neo_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "neo_test_secret_do_not_use_in_production";
process.env.TALABAT_WEBHOOK_SECRET = process.env.TALABAT_WEBHOOK_SECRET || "neo_test_talabat_webhook_secret";
// اختبارات الـe2e بتعمل عشرات محاولات login متتالية على نفس IP في نفس الدقيقة (سيناريوهات فعلية،
// مش هجوم) - حد الـthrottle الإنتاجي (5/دقيقة) هيرفضها بـ429 غلط. بنرفع الحد هنا بس في بيئة الاختبار
// (راجع app.module.ts/auth.controller.ts اللي بتقرأ القيم دي)
process.env.THROTTLE_LIMIT = "100000";
process.env.THROTTLE_LOGIN_LIMIT = "100000";
