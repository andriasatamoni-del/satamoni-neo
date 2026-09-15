import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { ITEM_TYPES, NEGATIVE_STOCK_POLICIES } from "../../domain/inventory-item.aggregate";

export class RegisterInventoryItemDto {
  @IsString()
  name!: string;

  @IsString()
  unit!: string;

  @IsOptional() @IsNumber() unitCost?: number;
  @IsOptional() @IsIn(ITEM_TYPES) itemType?: string;
  @IsOptional() @IsIn(NEGATIVE_STOCK_POLICIES) negativeStockPolicy?: string;
}
