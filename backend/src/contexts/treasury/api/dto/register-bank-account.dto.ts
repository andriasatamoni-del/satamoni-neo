import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class RegisterBankAccountDto {
  @IsUUID()
  bankId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() iban?: string;
  @IsOptional() @IsString() bankBranchName?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() branchId?: string;
}
