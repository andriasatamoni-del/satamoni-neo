import { IsOptional, IsString } from "class-validator";

export class UpdateBranchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() hours?: string | null;
  @IsOptional() @IsString() talabatBranchId?: string | null;
}
