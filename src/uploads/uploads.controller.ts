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

  // ==================================
  // USER PAYMENT PROOF UPLOAD
  // ==================================
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
    const uploadedImage = await this.uploadsService.uploadPaymentProof(file);

    return {
      message: 'Payment proof uploaded successfully',

      url: uploadedImage.secure_url,

      publicId: uploadedImage.public_id,
    };
  }

  // ==================================
  // ADMIN IMAGE UPLOAD
  // (Prediction images, banners, etc.)
  // ==================================
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),

      limits: {
        fileSize: 5 * 1024 * 1024,
      },

      fileFilter: imageFileFilter,
    }),
  )
  async uploadImage(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const uploadedImage = await this.uploadsService.uploadImage(file);

    return {
      message: 'Image uploaded successfully',

      data: uploadedImage,
    };
  }
}
