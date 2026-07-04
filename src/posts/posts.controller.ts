import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { PostsService } from './posts.service';

import { CreatePostDto } from './dto/create-post.dto';

import { UpdatePostDto } from './dto/update-post.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { RolesGuard } from '../common/guards/roles.guard';

import { Roles } from '../common/decorators/roles.decorator';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  getAllPosts() {
    return this.postsService.findAll();
  }

  @Get('featured')
  getFeaturedPosts() {
    return this.postsService.findFeaturedPosts();
  }

  @Get(':slug')
  getSinglePost(
    @Param('slug')
    slug: string,
  ) {
    return this.postsService.findOneBySlug(slug);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  createPost(
    @Body()
    createPostDto: CreatePostDto,
  ) {
    return this.postsService.create(createPostDto);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  updatePost(
    @Param('id') id: string,

    @Body()
    updatePostDto: UpdatePostDto,
  ) {
    return this.postsService.update(id, updatePostDto);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  deletePost(@Param('id') id: string) {
    return this.postsService.delete(id);
  }
}
