import { IsOptional, IsString, IsUUID } from "class-validator";

export class RegisterPositionDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() description?: string;
}
