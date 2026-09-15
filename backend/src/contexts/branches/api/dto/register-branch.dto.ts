import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

export class RegisterBranchDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() hours?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsBoolean() isCentralKitchen?: boolean;
  @IsOptional() @IsBoolean() supportsDineIn?: boolean;
}
