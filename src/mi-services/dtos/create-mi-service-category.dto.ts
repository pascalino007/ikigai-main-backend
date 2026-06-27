import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateMiServiceCategoryDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
