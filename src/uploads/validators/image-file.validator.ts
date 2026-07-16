import { BadRequestException } from '@nestjs/common';

export function imageFileFilter(
  req: any,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!file.originalname.match(/\.(jpg|jpeg|png|webp|pdf)$/i)) {
    return callback(
      new BadRequestException(
        'Only JPG, JPEG, PNG, WEBP images and PDF files are allowed.',
      ),
      false,
    );
  }

  callback(null, true);
}
