import { PartialType } from '@nestjs/mapped-types';
import { CreateGeovilleDto } from './create-geoville.dto';

export class UpdateGeovilleDto extends PartialType(CreateGeovilleDto) {}
