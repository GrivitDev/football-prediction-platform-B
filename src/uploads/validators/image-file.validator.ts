import { BadRequestException } from '@nestjs/common';

export function imageFileFilter(
  req: any,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/i)) {
    return callback(
      new BadRequestException(
        'Only JPG, JPEG, PNG and WEBP images are allowed.',
      ),
      false,
    );
  }

  callback(null, true);
}
