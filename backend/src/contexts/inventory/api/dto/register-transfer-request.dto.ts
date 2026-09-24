import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, ValidateNested } from "class-validator";

export class TransferRequestLineInputDto {
  @IsUUID() inventoryItemId!: string;
  @IsNumber() @IsPositive() requestedQuantity!: number;
}

export class RegisterTransferRequestDto {
  @IsUUID() fromBranchId!: string;
  @IsUUID() toBranchId!: string;
  @IsOptional() @IsDateString() requiredDate?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferRequestLineInputDto)
  lines!: TransferRequestLineInputDto[];
}
