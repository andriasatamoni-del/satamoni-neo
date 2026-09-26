import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody:true - محتاجينه عشان توقيع HMAC بتاع Talabat webhook (talabat-webhook.controller.ts)
  // لازم يتحقق على البايتات الخام بالظبط، مش على الـJSON بعد ما Express يعيد تسلسله - باقي الراوتس
  // مش متأثرة، JSON body parsing العادي شغال زي ما هو
  const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT) || 4100;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`satamoni-neo backend شغال على البورت ${port}`);
}

bootstrap();
