import { IsString, MinLength } from "class-validator";

export class RejectPurchaseRequestDto {
  @IsString() @MinLength(1) reason!: string;
}
