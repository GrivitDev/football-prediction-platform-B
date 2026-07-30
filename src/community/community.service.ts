import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import {
  CommunityPost,
  CommunityPostDocument,
} from './schemas/community-post.schema';

import {
  CommunityReply,
  CommunityReplyDocument,
} from './schemas/community-reply.schema';

import { CreatePostDto } from './dto/create-post.dto';

import { CreateReplyDto } from './dto/create-reply.dto';

@Injectable()
export class CommunityService {
  constructor(
    @InjectModel(CommunityPost.name)
    private readonly postModel: Model<CommunityPostDocument>,

    @InjectModel(CommunityReply.name)
    private readonly replyModel: Model<CommunityReplyDocument>,
  ) {}

  async create(user: any, dto: CreatePostDto) {
    return this.postModel.create({
      userId: user._id,

      username: user.username,

      fullName: user.fullName,

      title: dto.title,

      message: dto.message,

      category: dto.category,
    });
  }

  async findAll() {
    return this.postModel
      .find({
        isVisible: true,
      })
      .sort({
        createdAt: -1,
      })
      .limit(20);
  }

  async featured() {
    return this.postModel
      .find({
        isVisible: true,
      })
      .sort({
        createdAt: -1,
      })
      .limit(3);
  }

  async findOne(id: string) {
    const post = await this.postModel.findById(id);

    if (!post) {
      throw new NotFoundException('Community post not found');
    }

    const replies = await this.replyModel
      .find({
        postId: id,
        isVisible: true,
      })
      .sort({
        createdAt: 1,
      });

    return {
      ...post.toObject(),

      replies,
    };
  }

  async react(postId: string, userId: string, emoji: string) {
    const post = await this.postModel.findById(postId);

    if (!post) {
      throw new NotFoundException('Community post not found');
    }

    const reactionKey = `${userId}:${emoji}`;

    const existingReaction = post.reactedBy.findIndex(
      (item) => item === reactionKey,
    );

    if (existingReaction !== -1) {
      post.reactedBy.splice(existingReaction, 1);

      post.reactions[emoji] = Math.max(0, (post.reactions[emoji] || 0) - 1);
    } else {
      post.reactedBy.push(reactionKey);

      post.reactions[emoji] = (post.reactions[emoji] || 0) + 1;
    }

    return post.save();
  }

  async reply(postId: string, user: any, dto: CreateReplyDto) {
    const post = await this.postModel.findById(postId);

    if (!post) {
      throw new NotFoundException('Community post not found');
    }

    const reply = await this.replyModel.create({
      postId,

      userId: user._id,

      username: user.username,

      fullName: user.fullName,

      message: dto.message,
    });

    await this.postModel.findByIdAndUpdate(
      postId,

      {
        $inc: {
          replyCount: 1,
        },
      },
    );

    return reply;
  }

  async findReplies(postId: string) {
    return this.replyModel
      .find({
        postId,
        isVisible: true,
      })
      .sort({
        createdAt: 1,
      });
  }
}
