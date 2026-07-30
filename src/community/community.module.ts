import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import {
  CommunityPost,
  CommunityPostSchema,
} from './schemas/community-post.schema';

import {
  CommunityReply,
  CommunityReplySchema,
} from './schemas/community-reply.schema';

import { CommunityController } from './community.controller';

import { CommunityService } from './community.service';
import { UploadsModule } from 'src/uploads/uploads.module';

@Module({
  imports: [
    UploadsModule,
    MongooseModule.forFeature([
      {
        name: CommunityPost.name,
        schema: CommunityPostSchema,
      },

      {
        name: CommunityReply.name,
        schema: CommunityReplySchema,
      },
    ]),
  ],

  controllers: [CommunityController],

  providers: [CommunityService],

  exports: [CommunityService],
})
export class CommunityModule {}
