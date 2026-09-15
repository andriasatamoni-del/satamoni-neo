import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { ACCOUNT_TYPES } from "../../domain/account.aggregate";

export class RegisterAccountDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsIn(ACCOUNT_TYPES)
  accountType!: string;

  @IsOptional() @IsUUID() parentAccountId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsBoolean() isSystemAccount?: boolean;
}
