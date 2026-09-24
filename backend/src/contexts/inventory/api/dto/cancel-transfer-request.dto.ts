import { IsString, MinLength } from "class-validator";

export class CancelTransferRequestDto {
  @IsString() @MinLength(1) reason!: string;
}
