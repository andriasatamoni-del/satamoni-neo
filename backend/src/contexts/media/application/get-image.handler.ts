import { Inject, Injectable } from "@nestjs/common";
import { IMAGE_STORE, type ImageStorePort } from "../domain/ports/image-store.port";
import { ImageNotFoundError } from "../domain/image-format";

@Injectable()
export class GetImageHandler {
  constructor(@Inject(IMAGE_STORE) private readonly store: ImageStorePort) {}

  async execute(id: string): Promise<{ mime: string; content: Buffer }> {
    const image = await this.store.find(id);
    if (!image) throw new ImageNotFoundError();
    return image;
  }
}
