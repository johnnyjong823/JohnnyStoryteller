#!/usr/bin/env node
/**
 * 產生要貼給 Manus 的提示詞。
 *
 * 白名單直接從 src/content/taxonomy.ts 讀進來，所以**永遠不會跟程式碼脫節**。
 * 這很重要 —— 白名單沒貼進提示詞（或貼了舊版）是 LLM 產內容最主要的失敗原因。
 *
 * 用法：
 *   npm run manus-prompt
 *   npm run manus-prompt -- "我想跟孩子講：東西要收好。他最近玩具丟滿地"
 *
 * 產出 manus-prompt.txt（不進版控），整份貼進 Manus 就好。
 */

import { writeFile } from 'node:fs/promises';
import { CATEGORIES, TAGS } from '../src/content/taxonomy.ts';

const OUT = 'manus-prompt.txt';
const idea = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ');

const IDEA_PLACEHOLDER = `{ 換成你的構想。越具體越好，例如：
  我想跟孩子講「害怕是正常的，重要的是害怕的時候還是去做」。
  他最近不敢自己睡覺，一定要開燈。
  希望故事裡有一隻小動物，最後靠自己克服。 }`;

// 標籤照 taxonomy.ts 的分組換行，比較好讀
function groupTags(tags) {
  const lines = [];
  for (let i = 0; i < tags.length; i += 7) lines.push(tags.slice(i, i + 7).join(', '));
  return lines.join(',\n');
}

const prompt = `你是兒童繪本的分場編劇。請把我的故事構想，轉成一份結構化的 JSON。

## 讀者設定
- 聽故事的孩子：{ 年齡，例如 5 歲 }
- 說故事的人：孩子的爸爸（會照著 caption 念出來）
- 語言：**繁體中文、台灣用語**。禁止簡體字與中國用語
  （用「影片」不用「視頻」、用「品質」不用「質量」、用「馬鈴薯」不用「土豆」）

## 我想說的故事
${idea || IDEA_PLACEHOLDER}

## 輸出格式
**只輸出一個 JSON 物件，不要有任何說明文字、不要包在 markdown 程式碼區塊裡。**

{
  "slug": "英文或拼音的小寫短名，用連字號，例如 brave-little-owl",
  "title": "故事名稱（繁體中文）",
  "summary": "20-80 字的摘要",
  "category": "從下方分類白名單選 1 個",
  "tags": ["從下方標籤白名單選 3-6 個"],
  "ageRange": [最小年齡, 最大年齡],
  "minutes": 預估說故事的分鐘數（整數）,

  "characterSheet": {
    "name": "主角名字",
    "description": "英文的角色外觀描述，要非常具體：年齡、臉型、眼睛顏色與大小、髮型髮色、每一件衣服的顏色與款式、鞋子。這段會被原封不動貼進每一張圖的繪圖提示詞裡"
  },
  "styleToken": "英文的畫風描述，整篇故事共用。必須包含 no text, no letters, no watermark",

  "scenes": [
    {
      "image": "01.webp",
      "alt": "繁體中文。描述【畫面上實際有什麼】，給視障讀者與搜尋用",
      "caption": "繁體中文。說書人要【念出來】的話。2-4 行，換行處就是停頓處",
      "note": "繁體中文。給說書人的提示：什麼時候停、問什麼、用什麼語氣",
      "imagePrompt": "英文。完整的繪圖提示詞，格式見下方規則"
    }
  ],

  "quiz": [
    {
      "type": "choice",
      "question": "繁體中文題目",
      "options": ["選項A", "選項B", "選項C"],
      "answer": 0,
      "explain": "答對後顯示的一句話"
    },
    {
      "type": "open",
      "question": "繁體中文的開放討論題",
      "hint": "給說書人的引導方向"
    }
  ]
}

## 規則（每一條都要遵守）

### 分類白名單 — 只能用這 ${CATEGORIES.length} 個，一個字都不能改
${CATEGORIES.join(' / ')}

### 標籤白名單 — 只能從這 ${TAGS.length} 個裡選，不可以自己造新的
${groupTags([...TAGS])}

### 場景
- **12 個場景**（最少 8、最多 16）
- image 依序是 "01.webp"、"02.webp" … **兩位數補零，必須連續不跳號**
- 節奏：1-2 介紹角色與日常 / 3-4 事情發生 / 5-8 遇到困難與嘗試 / 9-10 轉折 / 11-12 解決收尾
- 每個 caption 最多 4 行、每行最多 20 字，超過就拆成兩個場景

### caption 與 alt 的差別（最容易寫錯的地方）
**絕對不可以把 alt 寫成 caption 的複製。** 對照範例：

- caption: "從前從前，有一個小女孩。她總是戴著奶奶送的紅色斗篷。"
  （← 你要念出來的話）
- alt: "穿著紅色斗篷的小女孩站在石頭小屋門口，手裡提著蓋著格子布的籃子"
  （← 畫面上實際有什麼）

### quiz
- **剛好 2 題**。第 1 題必須是 choice，第 2 題必須是 open
- choice 給 **2-3 個**選項，答案就在故事裡（回憶型）
- **answer 的索引從 0 開始** —— 第一個選項是 0，第二個是 1，第三個是 2
- open 沒有標準答案，要把故事延伸到孩子自己的生活

### imagePrompt 的格式
每一個 imagePrompt 都要是這個結構，把 characterSheet.description 和 styleToken **完整貼進去**：

{characterSheet.description 的完整內容},
{這一頁在做什麼}, {在哪裡}, {手上拿著什麼},
{表情與肢體動作}, {光線},
main subject centered, all important elements within the central square area,
generous empty margins on the left and right sides,
{styleToken 的完整內容}

要求：
- **不可以把角色描述簡寫成 "the girl" 或 "she"** —— 每一張都要完整重複，
  否則 12 張圖會變成 12 個不同的人
- 情緒要明講（例：eyes wide with curiosity / shoulders slumped, looking down）
- 夜晚場景要有明確光源（例：moonlight from the upper left / warm lantern glow）
- 畫面裡不可以有文字

## 輸出前自我檢查
- [ ] category 在白名單內
- [ ] 每個 tag 都在白名單內，共 3-6 個
- [ ] summary 是 20-80 字
- [ ] 場景數 8-16，image 檔名補零且連續
- [ ] 每個 alt 都不是 caption 的複製
- [ ] quiz 剛好 2 題，第 1 題 choice、第 2 題 open
- [ ] answer 是 0-based，且小於 options 的數量
- [ ] 每個 imagePrompt 都完整包含角色描述與 styleToken
- [ ] 全部是繁體中文、台灣用語
- [ ] 輸出是純 JSON，沒有其他文字
`;

await writeFile(OUT, prompt, 'utf8');

console.log(`✅ 提示詞已寫到 ${OUT}（${CATEGORIES.length} 個分類、${TAGS.length} 個標籤，直接讀自 taxonomy.ts）`);
if (!idea) {
  console.log(`\n⚠ 你還沒填故事構想。兩個做法：`);
  console.log(`   · 打開 ${OUT}，把「## 我想說的故事」那段換掉`);
  console.log(`   · 或重跑：npm run manus-prompt -- "我想跟孩子講……"`);
}
console.log(`\n接下來：整份貼進 Manus → 把它回的 JSON 存成檔案 → npm run import-story -- ./那個檔案.json`);
