import { IsInt, IsOptional, IsString } from "class-validator";

export class UpdateHomeTileDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() displayOrder?: number;
}
