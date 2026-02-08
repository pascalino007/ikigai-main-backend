import { PartialType } from '@nestjs/mapped-types';
import { CreateSousCategoryDto } from './create-souscategory.dto';

export class UpdateSousCategoryDto extends PartialType(CreateSousCategoryDto) {}