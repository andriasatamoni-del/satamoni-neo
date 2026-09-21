import { IsBoolean, IsOptional, IsString, IsUUID } from "class-validator";

export class RegisterKitchenStationDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsString() name!: string;
  @IsOptional() @IsUUID() printerId?: string;
}

export class UpdateKitchenStationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() printerId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RouteStationDto {
  @IsOptional() @IsUUID() stationId?: string | null;
}
