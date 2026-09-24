import { IsString, MinLength } from "class-validator";

export class RejectTransferRequestDto {
  @IsString() @MinLength(1) reason!: string;
}
