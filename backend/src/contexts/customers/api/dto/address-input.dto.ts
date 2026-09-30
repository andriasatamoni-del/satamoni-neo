import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

// العنوان المقسّم - الحقول الإلزامية بيتحقق منها الـaggregate (برسالة عربي لكل حقل ناقص)
export class AddressInputDto {
  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @IsString() @MaxLength(120) area!: string;
  @IsString() @MaxLength(120) street!: string;
  @IsString() @MaxLength(120) building!: string;
  @IsString() @MaxLength(120) floor!: string;
  @IsString() @MaxLength(120) apartment!: string;
  @IsOptional() @IsString() @MaxLength(150) distinguishingMark?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
