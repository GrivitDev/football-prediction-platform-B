import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { memoryStorage } from 'multer';

import { UploadsService } from './uploads.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { RolesGuard } from '../common/guards/roles.guard';

import { Roles } from '../common/decorators/roles.decorator';

import { imageFileFilter } from './validators/image-file.validator';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  // ======================================================
  // USER PAYMENT PROOF
  // ======================================================

  @UseGuards(JwtAuthGuard)
  @Post('payment-proof')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),

      limits: {
        fileSize: 5 * 1024 * 1024,
      },

      fileFilter: imageFileFilter,
    }),
  )
  async uploadPaymentProof(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const image = await this.uploadsService.uploadPaymentProof(file);

    return {
      message: 'Payment proof uploaded successfully',

      data: image,
    };
  }

  // ======================================================
  // ADMIN AD IMAGE
  // ======================================================

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('ads')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),

      limits: {
        fileSize: 5 * 1024 * 1024,
      },

      fileFilter: imageFileFilter,
    }),
  )
  async uploadAdImage(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const image = await this.uploadsService.uploadAdImage(file);

    return {
      message: 'Advertisement image uploaded successfully',

      data: image,
    };
  }

  // ======================================================
  // ADMIN ARTICLE IMAGE
  // ======================================================

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('articles')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),

      limits: {
        fileSize: 5 * 1024 * 1024,
      },

      fileFilter: imageFileFilter,
    }),
  )
  async uploadArticleImage(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const image = await this.uploadsService.uploadArticleImage(file);

    return {
      message: 'Article image uploaded successfully',

      data: image,
    };
  }

  // ======================================================
  // ADMIN PREDICTION IMAGE
  // ======================================================

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('predictions')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),

      limits: {
        fileSize: 5 * 1024 * 1024,
      },

      fileFilter: imageFileFilter,
    }),
  )
  async uploadPredictionImage(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const image = await this.uploadsService.uploadPredictionImage(file);

    return {
      message: 'Prediction image uploaded successfully',

      data: image,
    };
  }

  // ======================================================
  // USER AVATAR
  // ======================================================

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),

      limits: {
        fileSize: 3 * 1024 * 1024,
      },

      fileFilter: imageFileFilter,
    }),
  )
  async uploadAvatar(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const image = await this.uploadsService.uploadUserAvatar(file);

    return {
      message: 'Avatar uploaded successfully',

      data: image,
    };
  }
}
