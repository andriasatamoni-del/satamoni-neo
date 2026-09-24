import { IsInt, IsOptional, IsPositive, IsUUID } from "class-validator";

export class ComboItemInputDto {
  @IsUUID() variantId!: string;
  @IsOptional() @IsInt() @IsPositive() quantity?: number;
}
