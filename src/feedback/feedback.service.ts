import { Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Feedback, FeedbackDocument } from './schemas/feedback.schema';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel(Feedback.name)
    private feedbackModel: Model<FeedbackDocument>,
  ) {}

  async create(user: any, dto: any) {
    return this.feedbackModel.create({
      userId: user._id,

      username: user.username,

      fullName: user.fullName,

      title: dto.title,

      message: dto.message,
    });
  }

  async findAll() {
    return this.feedbackModel
      .find({
        isVisible: true,
      })
      .sort({
        createdAt: -1,
      })
      .limit(50);
  }

  async react(feedbackId: string, userId: string, emoji: string) {
    const feedback = await this.feedbackModel.findById(feedbackId);

    if (!feedback) {
      throw new Error('Feedback not found');
    }

    const key = feedback.reactedBy.findIndex(
      (item) => item === `${userId}:${emoji}`,
    );

    if (key !== -1) {
      feedback.reactedBy.splice(key, 1);

      feedback.reactions[emoji] = Math.max(0, feedback.reactions[emoji] - 1);
    } else {
      feedback.reactedBy.push(`${userId}:${emoji}`);

      feedback.reactions[emoji] = (feedback.reactions[emoji] || 0) + 1;
    }

    return feedback.save();
  }
}
