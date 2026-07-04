import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async findAll(query: any) {
    const search = query.search || '';
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const skip = (page - 1) * limit;

    const filter: any = {
      isDeleted: false,
    };

    if (search) {
      filter.$or = [
        {
          email: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          fullName: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          username: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.role && query.role !== 'all') {
      filter.role = query.role;
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),

      this.userModel.countDocuments(filter),
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // =========================
  // FINDERS
  // =========================
  async findByEmail(email: string) {
    return this.userModel.findOne({
      email: email.trim().toLowerCase(),
      isDeleted: false,
    });
  }

  async findByUsername(username: string) {
    return this.userModel.findOne({
      username: username.trim().toLowerCase(),
      isDeleted: false,
    });
  }

  async findByEmailWithPassword(email: string) {
    return this.userModel
      .findOne({
        email: email.trim().toLowerCase(),
        isDeleted: false,
      })
      .select('+password');
  }

  async findById(userId: string) {
    return this.userModel.findOne({
      _id: userId,
      isDeleted: false,
    });
  }

  // =========================
  // CREATE USER
  // =========================
  async create(userData: Partial<User>) {
    const user = new this.userModel({
      ...userData,
      email: userData.email?.trim().toLowerCase(),
      username: userData.username?.trim().toLowerCase(),
      status: UserStatus.ACTIVE,
    });

    return user.save();
  }

  // =========================
  // VERIFICATION
  // =========================
  async verifyUser(email: string) {
    return this.userModel.findOneAndUpdate(
      { email: email.trim().toLowerCase(), isDeleted: false },
      {
        $set: {
          isVerified: true,
        },
        $unset: {
          verificationExpiresAt: 1,
        },
      },
      { returnDocument: 'after' },
    );
  }

  // =========================
  // ADMIN CONTROL
  // =========================

  async suspendUser(
    userId: string,
    data: { reason?: string; bannedUntil?: Date; adminId?: string },
  ) {
    return this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          status: UserStatus.SUSPENDED,
          banReason: data.reason,
          bannedUntil: data.bannedUntil,
          bannedBy: data.adminId,
        },
      },
      { returnDocument: 'after' },
    );
  }

  async activateUser(userId: string) {
    return this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          status: UserStatus.ACTIVE,
        },
        $unset: {
          banReason: 1,
          bannedUntil: 1,
          bannedBy: 1,
        },
      },
      { returnDocument: 'after' },
    );
  }

  async softDeleteUser(userId: string, adminId?: string) {
    return this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          status: UserStatus.DELETED,
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: adminId,
        },
      },
      { returnDocument: 'after' },
    );
  }

  // =========================
  // LOGIN TRACKING
  // =========================
  async updateLoginInfo(userId: string) {
    return this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          lastLoginAt: new Date(),
        },
        $inc: {
          loginCount: 1,
        },
      },
      { returnDocument: 'after' },
    );
  }

  // =========================
  // ANALYTICS
  // =========================
  async countUsers() {
    return this.userModel.countDocuments({ isDeleted: false });
  }

  async countActiveUsers() {
    return this.userModel.countDocuments({
      status: UserStatus.ACTIVE,
      isDeleted: false,
    });
  }

  async countSuspendedUsers() {
    return this.userModel.countDocuments({
      status: UserStatus.SUSPENDED,
      isDeleted: false,
    });
  }

  async getRecentUsers(limit: number = 10) {
    return this.userModel
      .find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async getNewUsersToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    return this.userModel.countDocuments({
      createdAt: { $gte: start },
      isDeleted: false,
    });
  }

  async updateProfile(
    userId: string,
    data: {
      fullName?: string;
      username?: string;
      phoneNumber?: string;
    },
  ) {
    return this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          ...(data.fullName && {
            fullName: data.fullName,
          }),

          ...(data.username && {
            username: data.username.toLowerCase(),
          }),

          ...(data.phoneNumber && {
            phoneNumber: data.phoneNumber,
          }),
        },
      },
      { returnDocument: 'after' },
    );
  }
  // =========================
  // CLEANUP
  // =========================
  async deleteExpiredUnverifiedUsers() {
    return this.userModel.deleteMany({
      isVerified: false,
      isDeleted: false,
      verificationExpiresAt: {
        $lt: new Date(),
      },
    });
  }
}
