import { PartialType } from '@nestjs/mapped-types';
import { CreateProOwnnerDto } from './create-proownner.dto';

export class UpdateProOwnnerDto extends PartialType(CreateProOwnnerDto) {}
