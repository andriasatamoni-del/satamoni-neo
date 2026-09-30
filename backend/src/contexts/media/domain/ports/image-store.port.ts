import type { ImageMime } from "../image-format";

export interface ImageStorePort {
  save(input: { mime: ImageMime; content: Buffer; uploadedBy: string | null }): Promise<string>;
  find(id: string): Promise<{ mime: string; content: Buffer } | null>;
}

export const IMAGE_STORE = Symbol("IMAGE_STORE");
