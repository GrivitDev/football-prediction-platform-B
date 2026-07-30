import { BadRequestException } from '@nestjs/common';

export function communityMediaFilter(
  req: any,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (
    !file.mimetype.startsWith('image/') &&
    !file.mimetype.startsWith('video/')
  ) {
    return callback(
      new BadRequestException('Only image and video files are allowed.'),
      false,
    );
  }

  callback(null, true);
}
