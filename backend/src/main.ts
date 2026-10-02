import "dotenv/config";
// Dates read from Postgres `date` columns are materialised as JS Dates at local midnight; business logic assumes the process runs in
// UTC (Render default). Pin it so a different host TZ can not shift business dates.
process.env.TZ = process.env.TZ || "UTC";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody:true - محتاجينه عشان توقيع HMAC بتاع Talabat webhook (talabat-webhook.controller.ts)
  // لازم يتحقق على البايتات الخام بالظبط، مش على الـJSON بعد ما Express يعيد تسلسله - باقي الراوتس
  // مش متأثرة، JSON body parsing العادي شغال زي ما هو
  const app = await NestFactory.create(AppModule, { cors: false, rawBody: true });
  app.use(helmet());
  // FRONTEND_ORIGIN لازم يتحدد في بيئة production (رابط الفرونت إند الفعلي على Render) - في التطوير
  // المحلي بيرجع لـ localhost:5173 (Vite) تلقائيًا. cors:true القديم كان بيسمح لأي origin يتصل
  // بالـAPI - فتحة غير ضرورية لواجهة برمجية بتحمل بيانات مالية حساسة
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN?.split(",").map((s) => s.trim()) ?? "http://localhost:5173",
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT) || 4100;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`satamoni-neo backend شغال على البورت ${port}`);
}

bootstrap();
