#!/usr/bin/env node
/**
 * 把 Manus 產出的 JSON 匯入成一篇故事。
 *
 *   manus-output.json
 *      ├─► src/content/stories/<slug>/index.md    網站要用的內容（YAML frontmatter）
 *      ├─► src/content/stories/<slug>/prompts.md  角色設定表 + 每個場景的繪圖提示詞
 *      └─► src/content/stories/<slug>/images/     空的，等你把圖放進來
 *
 * 為什麼要 JSON 不要 YAML：YAML 縮排敏感、多行區塊字串是 LLM 最容易寫壞的結構。
 * 讓 LLM 產 JSON、讓腳本產 YAML —— 機器做機器擅長的事。見 docs/08。
 *
 * 用法：
 *   npm run import-story -- ./manus-output.json
 *   npm run import-story -- ./manus-output.json --force   覆蓋已存在的故事
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CATEGORIES, TAGS } from '../src/content/taxonomy.ts';

const INBOX = 'inbox';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const explicit = args.find((a) => !a.startsWith('--'));

/** 沒指定檔案時，自動去 inbox/ 找 */
async function resolveInput() {
  if (explicit) return explicit;

  if (!existsSync(INBOX)) return null;
  const jsons = (await readdir(INBOX)).filter((f) => f.toLowerCase().endsWith('.json')).sort();

  if (jsons.length === 0) return null;
  if (jsons.length === 1) {
    console.log(`（自動採用 ${INBOX}/${jsons[0]}）`);
    return path.join(INBOX, jsons[0]);
  }

  console.error(`\n${INBOX}/ 裡有 ${jsons.length} 個 JSON，請指定要匯入哪一個：\n`);
  jsons.forEach((f) => console.error(`  npm run import-story -- ${INBOX}/${f}`));
  process.exit(1);
}

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/** 字元數（正確處理中文與 emoji） */
const len = (s) => [...String(s)].length;

// ── JSON 解析 ────────────────────────────────────────────────────────────

function parseLoose(raw) {
  const text = raw.replace(/^﻿/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    /* 往下試 */
  }
  // Manus 常把 JSON 包在 ```json 區塊裡，或前後加一段說明文字
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* 往下試 */
    }
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch (e) {
      throw new Error(`找到 JSON 區塊但解析失敗：${e.message}`);
    }
  }
  throw new Error('檔案裡找不到 JSON 物件');
}

// ── 驗證 ─────────────────────────────────────────────────────────────────

function validate(d) {
  if (!d || typeof d !== 'object') return err('最外層不是一個 JSON 物件');

  if (!d.slug) err('缺少 slug');
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug))
    err(`slug "${d.slug}" 格式不對：只能用小寫英數與連字號，例如 brave-little-owl`);

  if (!d.title) err('缺少 title');

  if (!d.summary) err('缺少 summary');
  else if (len(d.summary) < 20 || len(d.summary) > 80)
    err(`summary 是 ${len(d.summary)} 字，必須在 20–80 字之間（它是搜尋的主要來源）`);

  if (!CATEGORIES.includes(d.category))
    err(`category "${d.category}" 不在白名單。合法選項：${CATEGORIES.join(' / ')}`);

  if (!Array.isArray(d.tags)) err('缺少 tags 陣列');
  else {
    if (d.tags.length < 3 || d.tags.length > 6)
      err(`tags 有 ${d.tags.length} 個，必須是 3–6 個`);
    const bad = d.tags.filter((t) => !TAGS.includes(t));
    if (bad.length)
      err(`這些標籤不在白名單：${bad.join('、')}\n     合法標籤：${TAGS.join('、')}`);
    if (new Set(d.tags).size !== d.tags.length) err('tags 有重複');
  }

  if (!Array.isArray(d.ageRange) || d.ageRange.length !== 2) err('ageRange 必須是 [最小, 最大]');
  else if (d.ageRange[0] > d.ageRange[1])
    err(`ageRange 的最小值 ${d.ageRange[0]} 大於最大值 ${d.ageRange[1]}`);

  if (typeof d.minutes !== 'number' || d.minutes <= 0) err('minutes 必須是正數');

  // ── 場景 ──
  if (!Array.isArray(d.scenes)) err('缺少 scenes 陣列');
  else {
    if (d.scenes.length < 8 || d.scenes.length > 16)
      err(`scenes 有 ${d.scenes.length} 個，必須是 8–16 個`);
    d.scenes.forEach((s, i) => {
      const at = `scenes[${i}]（第 ${i + 1} 頁）`;
      if (!s.caption) err(`${at} 缺少 caption`);
      if (!s.alt) err(`${at} 缺少 alt`);
      else if (len(s.alt) < 8) err(`${at} 的 alt 太短：「${s.alt}」`);
      if (s.alt && s.caption && s.alt.trim() === s.caption.trim())
        err(`${at} 的 alt 跟 caption 一模一樣。alt 要寫「畫面上實際有什麼」，不是重複要念的話`);
      if (!s.imagePrompt) warn(`${at} 沒有 imagePrompt，prompts.md 會少這一頁`);
      if (!s.note) warn(`${at} 沒有 note`);
    });
  }

  // ── 問答 ──
  if (!Array.isArray(d.quiz)) err('缺少 quiz 陣列');
  else {
    if (d.quiz.length !== 2) err(`quiz 有 ${d.quiz.length} 題，必須剛好 2 題`);
    const [q1, q2] = d.quiz;
    if (q1 && q1.type !== 'choice') err('第 1 題必須是 choice（檢查有沒有聽懂）');
    if (q2 && q2.type !== 'open') err('第 2 題必須是 open（延伸到孩子自己的生活）');

    if (q1?.type === 'choice') {
      if (!Array.isArray(q1.options) || q1.options.length < 2 || q1.options.length > 3)
        err(`第 1 題的 options 必須是 2–3 個，目前是 ${q1.options?.length}`);
      if (!Number.isInteger(q1.answer)) err('第 1 題的 answer 必須是整數');
      else if (q1.answer < 0 || q1.answer >= (q1.options?.length ?? 0))
        err(
          `第 1 題的 answer 是 ${q1.answer}，但只有 ${q1.options?.length} 個選項。` +
            `注意 answer 從 0 開始（第一個選項是 0）`,
        );
      if (!q1.explain) err('第 1 題缺少 explain');
    }
    if (q2?.type === 'open' && !q2.hint) err('第 2 題缺少 hint（給說書人的引導方向）');
  }

  // ── 繪圖提示詞的健康檢查 ──
  const desc = d.characterSheet?.description;
  const style = d.styleToken;
  if (!desc) warn('缺少 characterSheet.description，prompts.md 不會有角色設定表');
  if (!style) warn('缺少 styleToken，12 張圖的畫風可能不一致');

  if (desc && style && Array.isArray(d.scenes)) {
    // 最常見的失敗：LLM 把角色描述簡寫成 "the girl"，12 張圖就變成 12 個人
    const abbreviated = d.scenes.filter(
      (s) => s.imagePrompt && s.imagePrompt.length < desc.length + style.length,
    );
    if (abbreviated.length)
      warn(
        `有 ${abbreviated.length} 個 imagePrompt 明顯偏短，可能把角色描述簡寫了。\n` +
          `     回 Manus 說：「每一個 imagePrompt 都要完整重複 characterSheet.description，不可以用代名詞」`,
      );

    const styleKey = style.slice(0, 24);
    const missingStyle = d.scenes.filter((s) => s.imagePrompt && !s.imagePrompt.includes(styleKey));
    if (missingStyle.length)
      warn(`有 ${missingStyle.length} 個 imagePrompt 沒有包含 styleToken，畫風會跑掉`);
  }
}

// ── YAML 輸出 ────────────────────────────────────────────────────────────

const dq = (s) =>
  '"' +
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n') +
  '"';

/** 單行用雙引號，多行用 |- 區塊字串 */
function scalar(value, indent) {
  const str = String(value).replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (!str.includes('\n')) return dq(str);
  const pad = ' '.repeat(indent);
  return '|-\n' + str.split('\n').map((l) => pad + l.replace(/\s+$/, '')).join('\n');
}

function toFrontmatter(d) {
  const L = [];
  L.push('---');
  L.push(`title: ${dq(d.title)}`);
  L.push(`summary: ${dq(d.summary)}`);
  L.push('cover: "cover.webp"');
  L.push(`category: ${dq(d.category)}`);
  L.push(`tags: [${d.tags.map(dq).join(', ')}]`);
  L.push(`ageRange: [${d.ageRange[0]}, ${d.ageRange[1]}]`);
  L.push(`minutes: ${d.minutes}`);
  L.push('');
  L.push('# 圖片都放好之後，把這裡改成 published 就會上線');
  L.push('status: "draft"');
  L.push('');
  L.push('scenes:');
  d.scenes.forEach((s, i) => {
    L.push(`  - image: ${dq(String(i + 1).padStart(2, '0') + '.webp')}`);
    L.push(`    alt: ${scalar(s.alt, 6)}`);
    L.push(`    caption: ${scalar(s.caption, 6)}`);
    if (s.note) L.push(`    note: ${scalar(s.note, 6)}`);
    L.push('');
  });
  L.push('quiz:');
  for (const q of d.quiz) {
    if (q.type === 'choice') {
      L.push('  - type: "choice"');
      L.push(`    question: ${scalar(q.question, 6)}`);
      L.push(`    options: [${q.options.map(dq).join(', ')}]`);
      L.push(`    answer: ${q.answer}`);
      L.push(`    explain: ${scalar(q.explain, 6)}`);
    } else {
      L.push('  - type: "open"');
      L.push(`    question: ${scalar(q.question, 6)}`);
      L.push(`    hint: ${scalar(q.hint, 6)}`);
    }
  }
  L.push('---');
  L.push('');
  return L.join('\n');
}

function toPrompts(d) {
  const style = d.styleToken ?? '（缺少 styleToken）';
  const desc = d.characterSheet?.description ?? '（缺少 characterSheet.description）';
  const L = [];
  L.push(`# ${d.title} — 繪圖提示詞`);
  L.push('');
  L.push('> 產圖流程見 [docs/04-圖片製作指南](../../../../docs/04-圖片製作指南.md)。');
  L.push('> **先產角色設定表那一張，確認角色長相，再往下做。**');
  L.push('> 12 張圖並排看，如果有一張角色明顯不一樣，重產那一張，不要將就。');
  L.push('');
  L.push('## 風格字串');
  L.push('');
  L.push('每一張圖都要原封不動附加這一段，整篇故事都不要改：');
  L.push('');
  L.push('```');
  L.push(style);
  L.push('```');
  L.push('');
  L.push('## 角色設定表');
  L.push('');
  L.push(`**${d.characterSheet?.name ?? '主角'}** — 先產這一張，之後每一張都掛它當參考圖。`);
  L.push('');
  L.push('```');
  L.push(
    [
      `character reference sheet, ${desc},`,
      'three views: front view, side view, three-quarter view,',
      'plain light grey background, full body, neutral pose, no shadows,',
      style,
    ].join('\n'),
  );
  L.push('```');
  L.push('');
  L.push('## 場景');
  L.push('');
  d.scenes.forEach((s, i) => {
    const n = String(i + 1).padStart(2, '0');
    const firstLine = String(s.caption ?? '').split('\n')[0];
    L.push(`### ${n}.webp — ${firstLine}`);
    L.push('');
    L.push(`*畫面*：${s.alt ?? ''}`);
    L.push('');
    L.push('```');
    L.push(s.imagePrompt ?? '（Manus 沒有給這一頁的 imagePrompt）');
    L.push('```');
    L.push('');
  });
  L.push('## 封面');
  L.push('');
  L.push('存成 `cover.webp`。挑最能代表這個故事的一個畫面：');
  L.push('');
  L.push('```');
  L.push(
    [
      `${desc},`,
      '{最能代表這個故事的一個畫面}, inviting and warm composition,',
      'main subject centered, all important elements within the central square area,',
      'generous empty margins on the left and right sides,',
      style,
    ].join('\n'),
  );
  L.push('```');
  L.push('');
  return L.join('\n');
}

// ── 主流程 ───────────────────────────────────────────────────────────────

async function main() {
  const input = await resolveInput();

  if (!input) {
    console.error(`\n找不到要匯入的 JSON。兩個做法：\n`);
    console.error(`  · 把 Manus 給的 JSON 存進 ${INBOX}/ 資料夾，然後直接跑 npm run import-story`);
    console.error(`  · 或指定路徑：npm run import-story -- ./某個檔案.json\n`);
    console.error(`還沒有提示詞？先跑：npm run manus-prompt -- "我想跟孩子講……"`);
    process.exit(1);
  }
  if (!existsSync(input)) {
    console.error(`找不到檔案：${input}`);
    process.exit(1);
  }

  let data;
  try {
    data = parseLoose(await readFile(input, 'utf8'));
  } catch (e) {
    console.error(`\n❌ 解析失敗：${e.message}`);
    console.error('   提示：請 Manus「只輸出一個 JSON 物件，不要有任何說明文字」。');
    process.exit(1);
  }

  validate(data);

  if (errors.length) {
    console.error(`\n❌ 這份 JSON 有 ${errors.length} 個問題，沒有匯入：\n`);
    errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
    console.error('\n   把上面的訊息貼回 Manus 請它修正，再匯入一次。');
    process.exit(1);
  }

  const dir = path.join('src', 'content', 'stories', data.slug);
  if (existsSync(dir) && !FORCE) {
    console.error(`\n❌ ${dir} 已經存在。要覆蓋請加 --force`);
    process.exit(1);
  }

  await mkdir(path.join(dir, 'images'), { recursive: true });
  await writeFile(path.join(dir, 'index.md'), toFrontmatter(data), 'utf8');
  await writeFile(path.join(dir, 'prompts.md'), toPrompts(data), 'utf8');
  await writeFile(
    path.join(dir, 'images', '.gitkeep'),
    '',
    'utf8',
  );

  if (warnings.length) {
    console.warn(`\n⚠ ${warnings.length} 個提醒（不影響匯入）：\n`);
    warnings.forEach((w, i) => console.warn(`  ${i + 1}. ${w}`));
  }

  const n = data.scenes.length;
  console.log(`\n✅ 匯入成功：${data.title}（${n} 個場景）`);
  console.log(`   ${dir}/index.md`);
  console.log(`   ${dir}/prompts.md`);
  console.log(`\n接下來：`);
  console.log(`   ① 改 index.md 裡的 note ★ 不要跳過，這是這個網站的靈魂`);
  console.log(`   ② 用 prompts.md 的「角色設定表」產第 1 張參考圖，確認角色長相`);
  console.log(`   ③ 用參考圖 + ${n} 個場景提示詞產圖，再加一張封面`);
  console.log(`   ④ 圖丟進這個資料夾（可以直接貼到檔案總管的網址列）：`);
  console.log(`      ${path.resolve(dir, 'images')}`);
  console.log(`      檔名：cover / 01 / 02 … ${String(n).padStart(2, '0')}（png、jpg、webp 都可以）`);
  console.log(`   ⑤ npm run prepare-images -- ${data.slug}`);
  console.log(`   ⑥ 把 index.md 的 status 改成 published`);
  console.log(`   ⑦ start.bat  在手機上看一遍`);
  console.log(`\n   還沒有圖也想先看效果？`);
  console.log(`   npm run placeholders -- ${data.slug} && npm run prepare-images -- ${data.slug}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
