import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class RegisterTreasuryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
