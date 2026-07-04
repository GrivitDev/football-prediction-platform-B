import { Injectable } from '@nestjs/common';

import cloudinary from './config/cloudinary.config';

@Injectable()
export class UploadsService {
  // ==================================
  // ADMIN IMAGES
  // Prediction images, banners, etc.
  // ==================================
  async uploadImage(file: Express.Multer.File) {
    return new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: 'football-predictions',

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
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          },
        )
        .end(file.buffer);
    });
  }

  // ==================================
  // PAYMENT PROOFS
  // ==================================
  async uploadPaymentProof(file: Express.Multer.File) {
    return new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: 'football-predictions/payment-proofs',

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
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          },
        )
        .end(file.buffer);
    });
  }
}
