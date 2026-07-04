import { Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Post } from './schemas/post.schema';

import { CreatePostDto } from './dto/create-post.dto';

import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name)
    private postModel: Model<Post>,
  ) {}

  async create(createPostDto: CreatePostDto) {
    const post = new this.postModel(createPostDto);

    return post.save();
  }

  async findAll() {
    return this.postModel
      .find({
        published: true,
      })
      .sort({ createdAt: -1 });
  }

  async findFeaturedPosts() {
    return this.postModel
      .find({
        featured: true,
        published: true,
      })
      .sort({ createdAt: -1 });
  }

  async findOneBySlug(slug: string) {
    const post = await this.postModel.findOne({
      slug,
    });

    if (post) {
      post.views += 1;

      await post.save();
    }

    return post;
  }

  async update(id: string, updatePostDto: UpdatePostDto) {
    return this.postModel.findByIdAndUpdate(id, updatePostDto, {
      new: true,
    });
  }

  async delete(id: string) {
    return this.postModel.findByIdAndDelete(id);
  }
}
