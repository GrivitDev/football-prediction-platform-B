// src/articles/utils/article-html.util.ts

import sanitizeHtml from 'sanitize-html';

const allowedFontFamilies = [
  'Arial',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Courier New',
  'serif',
  'sans-serif',
  'monospace',
  'system-ui',
];

const allowedFontSizes = [
  '12px',
  '14px',
  '16px',
  '18px',
  '20px',
  '22px',
  '24px',
  '26px',
  '28px',
  '30px',
  '32px',
];

const alignmentPattern = /^(left|center|right|justify)$/i;

const fontFamilyPattern = new RegExp(
  `^(${allowedFontFamilies.join('|')})$`,
  'i',
);

const fontSizePattern = new RegExp(
  `^(${allowedFontSizes.map((size) => size.replace('px', '')).join('|')})px$`,
  'i',
);

export function sanitizeArticleHtml(content: string): string {
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
      'span',
    ],

    allowedAttributes: {
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      h4: ['style'],
      h5: ['style'],
      h6: ['style'],
      span: ['style'],

      a: ['href', 'target', 'rel', 'title'],

      img: ['src', 'alt', 'title', 'width', 'height'],

      th: ['colspan', 'rowspan'],

      td: ['colspan', 'rowspan'],
    },

    allowedStyles: {
      p: {
        'text-align': [alignmentPattern],
      },

      h1: {
        'text-align': [alignmentPattern],
      },

      h2: {
        'text-align': [alignmentPattern],
      },

      h3: {
        'text-align': [alignmentPattern],
      },

      h4: {
        'text-align': [alignmentPattern],
      },

      h5: {
        'text-align': [alignmentPattern],
      },

      h6: {
        'text-align': [alignmentPattern],
      },

      span: {
        'font-family': [fontFamilyPattern],
        'font-size': [fontSizePattern],
      },
    },

    allowedSchemes: ['http', 'https', 'mailto'],

    allowedSchemesByTag: {
      img: ['http', 'https'],
    },

    allowProtocolRelative: false,
  });
}

export function sanitizeArticlePlainText(content: string): string {
  return sanitizeHtml(content, {
    allowedTags: [],
    allowedAttributes: {},
    allowedSchemes: [],
    allowProtocolRelative: false,
  })
    .replace(/\s+/g, ' ')
    .trim();
}
