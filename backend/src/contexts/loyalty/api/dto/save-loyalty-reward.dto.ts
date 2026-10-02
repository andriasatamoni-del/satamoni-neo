import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { LOYALTY_REWARD_KINDS } from "../../domain/loyalty-reward.aggregate";

export class SaveLoyaltyRewardDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @IsString() @MaxLength(300) imageUrl?: string | null;
  @IsInt() @Min(1) pointsCost!: number;
  @IsIn(LOYALTY_REWARD_KINDS) kind!: string;
  @IsOptional() @IsNumber() @IsPositive() discountAmount?: number | null;
  @IsOptional() @IsUUID() variantId?: string | null;
  @IsOptional() @IsUUID() comboId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
