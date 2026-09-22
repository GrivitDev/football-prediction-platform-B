import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { AnalyzeArticleDto } from '../dto/analyze-article.dto';
import { AiWritingDto } from '../dto/ai-writing.dto';
import { CheckGrammarDto } from '../dto/check-grammar.dto';
import { CreateArticleDto } from '../dto/create-article.dto';
import { QueryArticleDto } from '../dto/query-article.dto';
import { UpdateArticleDto } from '../dto/update-article.dto';

import { ArticleGrammarService } from '../services/article-grammar.service';
import { ArticleSeoService } from '../services/article-seo.service';
import { ArticleService } from '../services/article.service';
import { ArticleWritingService } from '../services/article-writing.service';

interface AuthenticatedUser {
  _id: string;
  fullName: string;
  username: string;
  email: string;
  role: string;
}

@Controller('articles')
export class ArticleController {
  constructor(
    private readonly articleService: ArticleService,
    private readonly articleSeoService: ArticleSeoService,
    private readonly articleGrammarService: ArticleGrammarService,
    private readonly articleWritingService: ArticleWritingService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async create(
    @Body() dto: CreateArticleDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.articleService.create(dto, user._id);
  }

  @Get()
  async findAll(@Query() query: QueryArticleDto) {
    return this.articleService.findAll(query);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async findAdminAll(@Query() query: QueryArticleDto) {
    return this.articleService.findAdminAll(query);
  }

  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.articleService.findBySlug(slug);
  }

  @Post('seo/analyze')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  analyzeSeo(@Body() dto: AnalyzeArticleDto) {
    return this.articleSeoService.analyze(dto);
  }

  @Post('grammar/check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async checkGrammar(@Body() dto: CheckGrammarDto) {
    return this.articleGrammarService.check(dto.content, dto.language);
  }

  @Post('ai/process')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async processWithAi(@Body() dto: AiWritingDto) {
    /*
     * SEO is analyzer-driven.
     *
     * The platform performs its deterministic SEO analysis first.
     * Groq then receives the exact failures and metrics so it can
     * produce corrections based on the real current article state.
     */
    if (dto.action === 'seo') {
      const seoAnalysis = this.articleSeoService.analyze({
        title: dto.title?.trim() || 'Untitled article',

        content: dto.content,

        slug: dto.slug,

        seoTitle: dto.seoTitle,

        seoDescription: dto.seoDescription,

        focusKeyword: dto.focusKeyword,

        canonicalUrl: dto.canonicalUrl,
      });

      return this.articleWritingService.process(
        dto.content,
        dto.action,
        dto.target,
        dto.title,
        dto.subtitle,
        dto.description,
        dto.focusKeyword,
        dto.slug,
        dto.seoTitle,
        dto.seoDescription,
        dto.canonicalUrl,
        seoAnalysis,
      );
    }

    return this.articleWritingService.process(
      dto.content,
      dto.action,
      dto.target,
      dto.title,
      dto.subtitle,
      dto.description,
      dto.focusKeyword,
      dto.slug,
      dto.seoTitle,
      dto.seoDescription,
      dto.canonicalUrl,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.articleService.findOne(id, false);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articleService.update(id, dto);
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async publish(@Param('id') id: string) {
    return this.articleService.publish(id);
  }

  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async unpublish(@Param('id') id: string) {
    return this.articleService.unpublish(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async remove(@Param('id') id: string) {
    await this.articleService.remove(id);

    return {
      success: true,
      message: 'Article deleted successfully.',
    };
  }

  @Post(':id/view')
  async incrementView(@Param('id') id: string) {
    return this.articleService.incrementView(id);
  }

  @Post(':id/like')
  async likeArticle(@Param('id') id: string) {
    return this.articleService.likeArticle(id);
  }
}
