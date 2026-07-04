import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UserSession, UserSessionSchema } from './schemas/user-session.schema';

import { UserSessionService } from './user-session.service';
import { UserSessionController } from './user-session.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: UserSession.name,
        schema: UserSessionSchema,
      },
    ]),
  ],
  providers: [UserSessionService],
  controllers: [UserSessionController],
  exports: [UserSessionService],
})
export class UserSessionModule {}
