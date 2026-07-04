import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserSession } from './schemas/user-session.schema';

@Injectable()
export class UserSessionService {
  constructor(
    @InjectModel(UserSession.name)
    private sessionModel: Model<UserSession>,
  ) {}

  async createSession(data: Partial<UserSession>) {
    return this.sessionModel.create({
      ...data,
      lastActiveAt: new Date(),
      isActive: true,
    });
  }

  async findSessionById(sessionId: string) {
    return this.sessionModel.findById(sessionId);
  }

  async revokeSession(sessionId: string) {
    return this.sessionModel.findByIdAndUpdate(sessionId, {
      isActive: false,
    });
  }

  async revokeAllUserSessions(userId: string) {
    return this.sessionModel.updateMany({ userId }, { isActive: false });
  }

  async updateActivity(sessionId: string) {
    return this.sessionModel.findByIdAndUpdate(sessionId, {
      lastActiveAt: new Date(),
    });
  }
  // =====================================
  // ADMIN SUMMARY
  // =====================================
  async getSessionSummary(userId: string) {
    const sessions = await this.sessionModel
      .find({ userId })
      .sort({ lastActiveAt: -1 });

    const activeSessions = sessions.filter((session) => session.isActive);

    return {
      sessions,

      latestSessions: sessions.slice(0, 10),

      totalSessions: sessions.length,

      activeSessions: activeSessions.length,

      lastLogin: sessions.length > 0 ? sessions[0].lastActiveAt : null,

      currentSession: activeSessions.length > 0 ? activeSessions[0] : null,
    };
  }

  async getUserSessions(userId: string) {
    return this.sessionModel.find({ userId }).sort({ lastActiveAt: -1 });
  }
}
