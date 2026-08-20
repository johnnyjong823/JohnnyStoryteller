import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORIES, TAGS, SERIES } from './content/taxonomy';

/**
 * 內容的守門員。
 *
 * 核心觀念：讓錯誤在 build 時爆炸，而不是在說故事給孩子聽的時候才發現。
 * 因為故事由 Manus（LLM）產生，這份 schema 是唯一的品質防線 —— 只能收緊，不能放寬。
 */

const sceneSchema = z.object({
  image: z.string().regex(/^\d{2}\.webp$/, 'image 必須是兩位數補零的 .webp，例如 "01.webp"'),
  alt: z.string().min(8, 'alt 太短。寫「畫面上實際有什麼」，不是重複 caption'),
  caption: z.string().min(1),
  note: z.string().optional(),
});

const quizSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    question: z.string().min(1),
    options: z.array(z.string()).min(2).max(3),
    answer: z.number().int().min(0),
    explain: z.string().min(1),
  }),
  z.object({
    type: z.literal('open'),
    question: z.string().min(1),
    hint: z.string().min(1),
  }),
]);

const stories = defineCollection({
  loader: glob({
    pattern: '*/index.md',
    base: './src/content/stories',
    // id = 資料夾名 = slug = 網址
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: z
    .object({
      title: z.string().min(1),
      summary: z.string().min(20, 'summary 至少 20 字（它是搜尋的主要來源）').max(80),
      cover: z.string().default('cover.webp'),
      category: z.enum(CATEGORIES),
      tags: z.array(z.enum(TAGS)).min(3).max(6),
      ageRange: z.tuple([z.number().int(), z.number().int()]),
      minutes: z.number().positive(),
      status: z.enum(['draft', 'published']),
      // 系列（選填）：結尾自動推薦同系列的下一篇。order 從 1 開始（太陽系就用行星順序）
      series: z
        .object({
          name: z.enum(SERIES),
          order: z.number().int().positive(),
        })
        .optional(),
      // 關聯故事（選填）：故事裡提到的其他故事，放資料夾名（slug）。
      // 可以「預留」還不存在的故事 —— 等那篇存在且 published，結尾才會出現連結，
      // 在那之前完全不顯示，所以先寫上去是安全的。
      related: z
        .array(
          z
            .string()
            .regex(
              /^[a-z0-9]+(-[a-z0-9]+)*$/,
              'related 放故事資料夾名（slug）：小寫英數 + 連字號，例如 "hermes-winged-messenger"',
            ),
        )
        .max(4)
        .default([]),
      scenes: z.array(sceneSchema).min(8).max(16),
      quiz: z.array(quizSchema).length(2, 'quiz 必須剛好 2 題'),
    })
    .superRefine((data, ctx) => {
      // ageRange 要合理
      const [min, max] = data.ageRange;
      if (min > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ageRange'],
          message: `ageRange 的最小值 ${min} 大於最大值 ${max}`,
        });
      }

      // 場景圖檔名要從 01 連續編號
      data.scenes.forEach((scene, i) => {
        const expected = String(i + 1).padStart(2, '0') + '.webp';
        if (scene.image !== expected) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scenes', i, 'image'],
            message: `第 ${i + 1} 個場景的 image 應該是 "${expected}"，實際是 "${scene.image}"`,
          });
        }
      });

      // answer 是 0-based，且不能超出 options 範圍（LLM 最常寫錯的地方）
      data.quiz.forEach((q, i) => {
        if (q.type === 'choice' && q.answer >= q.options.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['quiz', i, 'answer'],
            message:
              `answer 是 ${q.answer}，但只有 ${q.options.length} 個選項。` +
              `注意 answer 從 0 開始（第一個選項是 0）`,
          });
        }
      });

      // 第 1 題 choice、第 2 題 open（見 docs/03 的建議組合）
      if (data.quiz[0]?.type !== 'choice') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quiz', 0, 'type'],
          message: '第 1 題必須是 choice（檢查有沒有聽懂）',
        });
      }
      if (data.quiz[1]?.type !== 'open') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quiz', 1, 'type'],
          message: '第 2 題必須是 open（延伸到孩子自己的生活）',
        });
      }
    }),
});

export const collections = { stories };
