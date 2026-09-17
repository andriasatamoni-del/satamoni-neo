import { Type } from "class-transformer";
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from "class-validator";
import { PurchaseRequestLineInputDto } from "./register-purchase-request.dto";

export class EditPurchaseRequestDto {
  @IsOptional() @IsDateString() requiredDate?: string;
  @IsOptional() @IsString() reason?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineInputDto)
  lines?: PurchaseRequestLineInputDto[];
}
