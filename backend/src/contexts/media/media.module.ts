import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { IMAGE_STORE } from "./domain/ports/image-store.port";
import { ImageStore } from "./infrastructure/persistence/image.store";
import { UploadImageHandler } from "./application/upload-image.handler";
import { GetImageHandler } from "./application/get-image.handler";
import { MediaController } from "./api/media.controller";

// Media - صور الأصناف والعروض ومكافآت الولاء (STORE-2). supporting context صغير: تخزين وخدمة بس
@Module({
  imports: [IdentityAccessModule],
  controllers: [MediaController],
  providers: [{ provide: IMAGE_STORE, useClass: ImageStore }, UploadImageHandler, GetImageHandler],
})
export class MediaModule {}
