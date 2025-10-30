import { IsNotEmpty, IsString } from "class-validator";

// create-sous-category.dto.ts
export class CreateSousCategoryDto {
 
 @IsNotEmpty()
  @IsString()
  name: string ;


   @IsNotEmpty()
  @IsString()
  category: string


   @IsNotEmpty()
  @IsString()
  tags: string

 
}