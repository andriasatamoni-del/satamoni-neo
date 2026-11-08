import "dotenv/config";
process.env.TZ = process.env.TZ || "UTC";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false, rawBody: true });
  app.use(helmet());
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN?.split(",").map((s) => s.trim()) ?? "http://localhost:5173",
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT) || 4100;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`satamoni-neo backend شغال على البورت ${port}`);
}

bootstrap();
