import { IsString } from "class-validator";

export class RenameRecipeDto {
  @IsString()
  name!: string;
}
