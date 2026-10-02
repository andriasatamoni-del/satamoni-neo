import type { Generated } from "kysely";

export interface MediaImagesTable {
  id: Generated<string>;
  mime: string;
  content: Buffer;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: Generated<Date>;
}
