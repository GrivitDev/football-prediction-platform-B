// src/articles/services/article.service.ts

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import sanitizeHtml from 'sanitize-html';

import { CreateArticleDto } from '../dto/create-article.dto';
import { QueryArticleDto } from '../dto/query-article.dto';
import { UpdateArticleDto } from '../dto/update-article.dto';
import { ArticleStatus } from '../enums/article-status.enum';
import { Article, ArticleDocument } from '../schemas/article.schema';

@Injectable()
export class ArticleService {
  constructor(
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
  ) {}

  async create(
    dto: CreateArticleDto,
    authorId: string,
  ): Promise<ArticleDocument> {
    const normalizedAuthorId = this.toObjectId(authorId);

    const slug = await this.generateUniqueSlug(dto.slug || dto.title);

    const content = this.sanitizeContent(dto.content);

    const wordCount = this.calculateWordCount(content);

    const readingTimeMinutes = this.calculateReadingTime(wordCount);

    const status = dto.publishedAt
      ? ArticleStatus.PUBLISHED
      : ArticleStatus.DRAFT;

    const publishedAt =
      status === ArticleStatus.PUBLISHED
        ? dto.publishedAt
          ? new Date(dto.publishedAt)
          : new Date()
        : null;

    const article = new this.articleModel({
      title: dto.title.trim(),
      slug,
      excerpt: dto.excerpt?.trim() || null,
      content,
      authorId: normalizedAuthorId,
      featuredImageUrl: dto.featuredImageUrl || null,
      featuredImageAlt: dto.featuredImageAlt?.trim() || null,
      featuredImagePublicId: dto.featuredImagePublicId || null,
      seo: {
        title: dto.seoTitle?.trim() || null,
        description: dto.seoDescription?.trim() || null,
        focusKeyword: dto.focusKeyword?.trim() || null,
        canonicalUrl: dto.canonicalUrl?.trim() || null,
      },
      tags: this.normalizeTags(dto.tags),
      status,
      publishedAt,
      wordCount,
      readingTimeMinutes,
    });

    try {
      return await article.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'An article with this slug already exists.',
        );
      }

      throw error;
    }
  }

  async findAll(query: QueryArticleDto): Promise<{
    data: ArticleDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: QueryFilter<ArticleDocument> = {
      status: ArticleStatus.PUBLISHED,
    };

    if (query.tag) {
      filter.tags = query.tag.trim().toLowerCase();
    }

    if (query.search?.trim()) {
      filter.$text = {
        $search: query.search.trim(),
      };
    }

    const [data, total] = await Promise.all([
      this.articleModel
        .find(filter)
        .sort({
          publishedAt: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.articleModel.countDocuments(filter),
    ]);

    return {
      data: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAdminAll(query: QueryArticleDto): Promise<{
    data: ArticleDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: QueryFilter<ArticleDocument> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.tag) {
      filter.tags = query.tag.trim().toLowerCase();
    }

    if (query.search?.trim()) {
      filter.$text = {
        $search: query.search.trim(),
      };
    }

    const [data, total] = await Promise.all([
      this.articleModel
        .find(filter)
        .sort({
          updatedAt: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.articleModel.countDocuments(filter),
    ]);

    return {
      data: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, includeDraft = false): Promise<ArticleDocument> {
    const objectId = this.toObjectId(id);

    const filter: QueryFilter<ArticleDocument> = {
      _id: objectId,
    };

    if (!includeDraft) {
      filter.status = ArticleStatus.PUBLISHED;
    }

    const article = await this.articleModel.findOne(filter);

    if (!article) {
      throw new NotFoundException('Article not found.');
    }

    return article;
  }

  async findBySlug(
    slug: string,
    includeDraft = false,
  ): Promise<ArticleDocument> {
    const filter: QueryFilter<ArticleDocument> = {
      slug: slug.trim().toLowerCase(),
    };

    if (!includeDraft) {
      filter.status = ArticleStatus.PUBLISHED;
    }

    const article = await this.articleModel.findOne(filter);

    if (!article) {
      throw new NotFoundException('Article not found.');
    }

    return article;
  }

  async update(id: string, dto: UpdateArticleDto): Promise<ArticleDocument> {
    const objectId = this.toObjectId(id);

    const article = await this.articleModel.findById(objectId);

    if (!article) {
      throw new NotFoundException('Article not found.');
    }

    if (dto.title !== undefined) {
      article.title = dto.title.trim();
    }

    if (dto.slug !== undefined) {
      article.slug = await this.generateUniqueSlug(
        dto.slug,
        article._id.toString(),
      );
    }

    if (dto.excerpt !== undefined) {
      article.excerpt = dto.excerpt.trim() || null;
    }

    if (dto.content !== undefined) {
      article.content = this.sanitizeContent(dto.content);

      article.wordCount = this.calculateWordCount(article.content);

      article.readingTimeMinutes = this.calculateReadingTime(article.wordCount);
    }

    if (dto.featuredImageUrl !== undefined) {
      article.featuredImageUrl = dto.featuredImageUrl || null;
    }

    if (dto.featuredImageAlt !== undefined) {
      article.featuredImageAlt = dto.featuredImageAlt.trim() || null;
    }

    if (dto.featuredImagePublicId !== undefined) {
      article.featuredImagePublicId = dto.featuredImagePublicId || null;
    }

    if (dto.seoTitle !== undefined) {
      article.seo.title = dto.seoTitle.trim() || null;
    }

    if (dto.seoDescription !== undefined) {
      article.seo.description = dto.seoDescription.trim() || null;
    }

    if (dto.focusKeyword !== undefined) {
      article.seo.focusKeyword = dto.focusKeyword.trim() || null;
    }

    if (dto.canonicalUrl !== undefined) {
      article.seo.canonicalUrl = dto.canonicalUrl.trim() || null;
    }

    if (dto.tags !== undefined) {
      article.tags = this.normalizeTags(dto.tags);
    }

    if (dto.publishedAt !== undefined) {
      article.publishedAt = new Date(dto.publishedAt);
      article.status = ArticleStatus.PUBLISHED;
    }

    try {
      return await article.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'An article with this slug already exists.',
        );
      }

      throw error;
    }
  }

  async publish(id: string): Promise<ArticleDocument> {
    const objectId = this.toObjectId(id);

    const article = await this.articleModel.findOneAndUpdate(
      {
        _id: objectId,
      },
      {
        $set: {
          status: ArticleStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      },
      {
        new: true,
      },
    );

    if (!article) {
      throw new NotFoundException('Article not found.');
    }

    return article;
  }

  async unpublish(id: string): Promise<ArticleDocument> {
    const objectId = this.toObjectId(id);

    const article = await this.articleModel.findOneAndUpdate(
      {
        _id: objectId,
      },
      {
        $set: {
          status: ArticleStatus.DRAFT,
          publishedAt: null,
        },
      },
      {
        new: true,
      },
    );

    if (!article) {
      throw new NotFoundException('Article not found.');
    }

    return article;
  }

  async remove(id: string): Promise<void> {
    const objectId = this.toObjectId(id);

    const result = await this.articleModel.deleteOne({
      _id: objectId,
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Article not found.');
    }
  }

  async incrementView(id: string): Promise<{
    viewsCount: number;
  }> {
    const objectId = this.toObjectId(id);

    const article = await this.articleModel.findOneAndUpdate(
      {
        _id: objectId,
        status: ArticleStatus.PUBLISHED,
      },
      {
        $inc: {
          viewsCount: 1,
        },
      },
      {
        new: true,
        projection: {
          viewsCount: 1,
        },
      },
    );

    if (!article) {
      throw new NotFoundException('Article not found.');
    }

    return {
      viewsCount: article.viewsCount,
    };
  }

  async likeArticle(id: string): Promise<{
    likesCount: number;
  }> {
    const objectId = this.toObjectId(id);

    const article = await this.articleModel.findOneAndUpdate(
      {
        _id: objectId,
        status: ArticleStatus.PUBLISHED,
      },
      {
        $inc: {
          likesCount: 1,
        },
      },
      {
        new: true,
        projection: {
          likesCount: 1,
        },
      },
    );

    if (!article) {
      throw new NotFoundException('Article not found.');
    }

    return {
      likesCount: article.likesCount,
    };
  }

  private async generateUniqueSlug(
    value: string,
    excludeId?: string,
  ): Promise<string> {
    const baseSlug = this.slugify(value);

    if (!baseSlug) {
      throw new BadRequestException('A valid title or slug is required.');
    }

    let slug = baseSlug;
    let suffix = 1;

    while (true) {
      const filter: QueryFilter<ArticleDocument> = {
        slug,
      };

      if (excludeId) {
        filter._id = {
          $ne: this.toObjectId(excludeId),
        };
      }

      const existingArticle = await this.articleModel.exists(filter);

      if (!existingArticle) {
        return slug;
      }

      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }
  }

  private slugify(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!tags?.length) {
      return [];
    }

    return [
      ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
    ];
  }

  private sanitizeContent(content: string): string {
    return sanitizeHtml(content, {
      allowedTags: [
        'p',
        'br',
        'strong',
        'b',
        'em',
        'i',
        'u',
        's',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'ul',
        'ol',
        'li',
        'blockquote',
        'a',
        'img',
        'figure',
        'figcaption',
        'hr',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
      ],
      allowedAttributes: {
        a: ['href', 'target', 'rel', 'title'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        th: ['colspan', 'rowspan'],
        td: ['colspan', 'rowspan'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: {
        img: ['http', 'https'],
      },
      allowProtocolRelative: false,
    });
  }

  private calculateWordCount(content: string): number {
    const plainText = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!plainText) {
      return 0;
    }

    return plainText.split(' ').length;
  }

  private calculateReadingTime(wordCount: number): number {
    return Math.max(1, Math.ceil(wordCount / 200));
  }

  private toObjectId(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Invalid identifier.');
    }

    return new Types.ObjectId(value);
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
