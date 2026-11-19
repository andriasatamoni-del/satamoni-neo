import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";

export class BranchTransferLineDto {
  @IsUUID() inventoryItemId!: string;
  @IsNumber() @IsPositive() quantity!: number;
}

export class RegisterBranchTransferDto {
  @IsUUID() fromBranchId!: string;
  @IsUUID() toBranchId!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BranchTransferLineDto)
  lines!: BranchTransferLineDto[];
}
