import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

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

import { UpdatePostDto } from './dto/update-post.dto';

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

      type: dto.type,

      title: dto.title,

      message: dto.message,

      category: dto.category,

      media: dto.media,
    });
  }

  async findAll(page: number = 1, limit: number = 20, search?: string) {
    const filter: any = {
      isVisible: true,
    };

    if (search) {
      filter.$text = {
        $search: search,
      };
    }

    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.postModel

        .find(filter)

        .sort({
          createdAt: -1,
        })

        .skip(skip)

        .limit(limit),

      this.postModel.countDocuments(filter),
    ]);

    return {
      posts,

      page,

      total,

      totalPages: Math.ceil(total / limit),
    };
  }

  async featured() {
    return this.postModel

      .find({
        isVisible: true,

        isFeatured: true,
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

  async update(id: string, user: any, dto: UpdatePostDto) {
    const post = await this.postModel.findById(id);

    if (!post) {
      throw new NotFoundException('Community post not found');
    }

    if (post.userId.toString() !== user._id.toString()) {
      throw new ForbiddenException('You cannot edit this post');
    }

    Object.assign(post, dto);

    return post.save();
  }

  async remove(id: string, user: any) {
    const post = await this.postModel.findById(id);

    if (!post) {
      throw new NotFoundException('Community post not found');
    }

    if (post.userId.toString() !== user._id.toString()) {
      throw new ForbiddenException('You cannot delete this post');
    }

    post.isVisible = false;

    return post.save();
  }

  async react(postId: string, userId: string, reaction: string) {
    const post = await this.postModel.findById(postId);

    if (!post) {
      throw new NotFoundException('Community post not found');
    }

    const existingReaction = post.reactedBy.find((entry) =>
      entry.startsWith(`${userId}:`),
    );

    // User clicked the same reaction again
    if (existingReaction) {
      const [, previousReaction] = existingReaction.split(':');

      if (previousReaction === reaction) {
        await this.postModel.updateOne(
          { _id: postId },
          {
            $pull: {
              reactedBy: existingReaction,
            },
            $inc: {
              [`reactions.${reaction}`]: -1,
            },
          },
        );

        return this.postModel.findById(postId);
      }

      // User changed reaction
      await this.postModel.updateOne(
        { _id: postId },
        {
          $pull: {
            reactedBy: existingReaction,
          },
          $push: {
            reactedBy: `${userId}:${reaction}`,
          },
          $inc: {
            [`reactions.${previousReaction}`]: -1,
            [`reactions.${reaction}`]: 1,
          },
        },
      );

      return this.postModel.findById(postId);
    }

    // First reaction
    await this.postModel.updateOne(
      { _id: postId },
      {
        $push: {
          reactedBy: `${userId}:${reaction}`,
        },
        $inc: {
          [`reactions.${reaction}`]: 1,
        },
      },
    );

    return this.postModel.findById(postId);
  }

  async reply(postId: string, user: any, dto: CreateReplyDto) {
    const post = await this.postModel.findById(postId);

    if (!post) {
      throw new NotFoundException('Community post not found');
    }

    if (post.isLocked) {
      throw new ForbiddenException('This discussion is locked');
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
