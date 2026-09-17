import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsUUID, ValidateNested } from "class-validator";

export class ActualConsumptionLineDto {
  @IsUUID() ingredientItemId!: string;
  @IsNumber() actualQuantity!: number;
}

export class StartConversionOrderDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActualConsumptionLineDto)
  actualConsumption?: ActualConsumptionLineDto[];

  @IsOptional() @IsBoolean() stockApproved?: boolean;
}
