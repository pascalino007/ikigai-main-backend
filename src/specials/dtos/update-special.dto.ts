import { PartialType } from '@nestjs/mapped-types';
import { CreateSpecialDto } from './create-special.dto';

export class UpdateSpecialDto extends PartialType(CreateSpecialDto) {}