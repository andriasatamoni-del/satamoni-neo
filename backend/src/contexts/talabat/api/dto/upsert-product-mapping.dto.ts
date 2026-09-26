import { IsString } from "class-validator";

export class UpsertProductMappingDto {
  @IsString() branchId!: string;
  @IsString() talabatItemId!: string;
  @IsString() menuItemId!: string;
  @IsString() variantId!: string;
}
