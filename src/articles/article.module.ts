// src/articles/article.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { ArticleController } from './controllers/article.controller';
import { ArticleGrammarService } from './services/article-grammar.service';
import { ArticleSeoService } from './services/article-seo.service';
import { ArticleService } from './services/article.service';
import { ArticleWritingService } from './services/article-writing.service';
import { Article, ArticleSchema } from './schemas/article.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      {
        name: Article.name,
        schema: ArticleSchema,
      },
    ]),
  ],
  controllers: [ArticleController],
  providers: [
    ArticleService,
    ArticleSeoService,
    ArticleGrammarService,
    ArticleWritingService,
  ],
  exports: [
    ArticleService,
    ArticleSeoService,
    ArticleGrammarService,
    ArticleWritingService,
  ],
})
export class ArticleModule {}
