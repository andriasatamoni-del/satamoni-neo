import { IsBoolean, IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateMenuItemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsBoolean() isBest?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
