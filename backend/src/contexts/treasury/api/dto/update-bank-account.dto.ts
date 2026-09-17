import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateBankAccountDto {
  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() iban?: string;
  @IsOptional() @IsString() bankBranchName?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
