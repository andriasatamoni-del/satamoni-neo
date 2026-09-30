import { Inject, Injectable } from "@nestjs/common";
import { IMAGE_STORE, type ImageStorePort } from "../domain/ports/image-store.port";
import { imagePath, validateImage } from "../domain/image-format";

@Injectable()
export class UploadImageHandler {
  constructor(@Inject(IMAGE_STORE) private readonly store: ImageStorePort) {}

  async execute(input: { content: Buffer | undefined; uploadedBy: string | null }): Promise<{ id: string; url: string }> {
    const mime = validateImage(input.content);
    const id = await this.store.save({ mime, content: input.content!, uploadedBy: input.uploadedBy });
    return { id, url: imagePath(id) };
  }
}
