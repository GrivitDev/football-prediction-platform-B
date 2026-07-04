import { BadRequestException } from '@nestjs/common';

export function imageFileFilter(req: any, file: any, callback: any) {
  if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/i)) {
    return callback(
      new BadRequestException('Only image files are allowed'),
      false,
    );
  }

  callback(null, true);
}
