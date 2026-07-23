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
    const session = await this.sessionModel.findById(sessionId);

    if (!session) {
      return null;
    }

    if (
      session.isActive &&
      session.expiresAt &&
      session.expiresAt <= new Date()
    ) {
      await this.sessionModel.findByIdAndUpdate(sessionId, {
        $set: {
          isActive: false,
        },
      });

      session.isActive = false;
    }

    return session;
  }

  async revokeSession(sessionId: string) {
    return this.sessionModel.findOneAndUpdate(
      {
        _id: sessionId,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
        },
      },
    );
  }

  async deactivateAllUserSessions(userId: string) {
    await this.sessionModel.updateMany(
      {
        userId,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
        },
      },
    );
  }

  async updateActivity(sessionId: string) {
    return this.sessionModel.findOneAndUpdate(
      {
        _id: sessionId,
        isActive: true,
        expiresAt: {
          $gt: new Date(),
        },
      },
      {
        $set: {
          lastActiveAt: new Date(),
        },
      },
    );
  }
  // =====================================
  // ADMIN SUMMARY
  // =====================================
  async getSessionSummary(userId: string) {
    const sessions = await this.sessionModel
      .find({ userId })
      .sort({ lastActiveAt: -1 });

    const now = new Date();

    const activeSessions = sessions.filter(
      (session) => session.isActive && session.expiresAt > now,
    );

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
    const now = new Date();

    const sessions = await this.sessionModel.find({ userId }).sort({
      lastActiveAt: -1,
    });

    return sessions.map((session) => ({
      _id: session._id,

      device: session.device || 'Unknown Device',

      lastActiveAt: session.lastActiveAt,

      createdAt: session.createdAt,

      active: session.isActive && session.expiresAt > now,

      expired: session.expiresAt <= now,
    }));
  }

  async cleanupUserSessions(userId: string) {
    return this.sessionModel.updateMany(
      {
        userId,
        expiresAt: {
          $lte: new Date(),
        },
        isActive: true,
      },
      {
        $set: {
          isActive: false,
        },
      },
    );
  }
}
