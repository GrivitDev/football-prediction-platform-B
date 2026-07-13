import { Injectable } from '@nestjs/common';

import cloudinary from './config/cloudinary.config';

import { UploadFolder } from './enums/upload-folder.enum';

@Injectable()
export class UploadsService {
  private async upload(file: Express.Multer.File, folder: UploadFolder) {
    return new Promise<{
      url: string;
      publicId: string;
      width: number;
      height: number;
      format: string;
      bytes: number;
    }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,

            resource_type: 'image',

            transformation: [
              {
                width: 1200,
                crop: 'limit',
                quality: 'auto',
                fetch_format: 'auto',
              },
            ],
          },

          (error, result) => {
            if (error || !result) {
              return reject(error);
            }

            resolve({
              url: result.secure_url,

              publicId: result.public_id,

              width: result.width,

              height: result.height,

              format: result.format,

              bytes: result.bytes,
            });
          },
        )
        .end(file.buffer);
    });
  }

  async uploadAdImage(file: Express.Multer.File) {
    return this.upload(file, UploadFolder.ADS);
  }

  async uploadPredictionImage(file: Express.Multer.File) {
    return this.upload(file, UploadFolder.PREDICTIONS);
  }

  async uploadArticleImage(file: Express.Multer.File) {
    return this.upload(file, UploadFolder.ARTICLES);
  }

  async uploadPaymentProof(file: Express.Multer.File) {
    return this.upload(file, UploadFolder.PAYMENT_PROOFS);
  }

  async uploadUserAvatar(file: Express.Multer.File) {
    return this.upload(file, UploadFolder.USERS);
  }

  async deleteImage(publicId: string) {
    return cloudinary.uploader.destroy(publicId);
  }
}
