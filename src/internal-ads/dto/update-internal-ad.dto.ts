import { PartialType } from '@nestjs/mapped-types';

import { CreateInternalAdDto } from './create-internal-ad.dto';

export class UpdateInternalAdDto extends PartialType(CreateInternalAdDto) {}
