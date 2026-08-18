#!/usr/bin/env node
/**
 * 產生佔位圖，讓故事匯入後可以「馬上看到效果」，不用等美術。
 *
 * 每一張圖上會印出頁碼與該頁的 alt（畫面描述），所以你可以先跑一次完整流程、
 * 確認節奏對不對，再去產真正的圖。
 *
 * 用法：
 *   npm run placeholders -- demo-brave-owl
 *   npm run placeholders -- demo-brave-owl --force   覆蓋已存在的圖
 *
 * ⚠ 只會建立還不存在的檔案 —— 真正的圖放進去之後再跑一次也不會被蓋掉。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const W = 1600;
const H = 1200;

// 夜晚色調，跟播放器的深色介面搭
const PALETTE = [
  ['#2b3a5c', '#16203a'],
  ['#3a3357', '#1e1b33'],
  ['#264a4a', '#132b2b'],
  ['#4a3a2e', '#2a201a'],
  ['#33445c', '#1b2436'],
  ['#4a2e42', '#2a1a26'],
];

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const slug = args.find((a) => !a.startsWith('--'));

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 把描述折成多行，中文以字元數估寬 */
function wrap(text, perLine = 22, maxLines = 3) {
  const chars = [...String(text)];
  const lines = [];
  for (let i = 0; i < chars.length && lines.length < maxLines; i += perLine) {
    lines.push(chars.slice(i, i + perLine).join(''));
  }
  if (lines.length === maxLines && chars.length > perLine * maxLines) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, perLine - 1) + '…';
  }
  return lines;
}

function svg(label, caption, [c1, c2]) {
  const lines = wrap(caption);
  const tspans = lines
    .map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 54}">${esc(l)}</tspan>`)
    .join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <!-- 中央 1:1 安全區示意（見 docs/04）-->
  <rect x="${(W - H) / 2}" y="0" width="${H}" height="${H}"
        fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="3" stroke-dasharray="14 12"/>
  <text x="${W / 2}" y="${H / 2 - 90}" text-anchor="middle"
        font-family="system-ui, sans-serif" font-size="150" font-weight="700"
        fill="rgba(255,255,255,0.34)">${esc(label)}</text>
  <text x="${W / 2}" y="${H / 2 + 40}" text-anchor="middle"
        font-family="system-ui, 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
        font-size="42" fill="rgba(255,255,255,0.62)">${tspans}</text>
  <text x="${W / 2}" y="${H - 70}" text-anchor="middle"
        font-family="system-ui, sans-serif" font-size="30"
        fill="rgba(255,255,255,0.28)">佔位圖 · 待替換</text>
</svg>`);
}

async function main() {
  if (!slug) {
    console.error('用法：npm run placeholders -- <slug>');
    process.exit(1);
  }

  const dir = path.join('src', 'content', 'stories', slug);
  const mdPath = path.join(dir, 'index.md');
  if (!existsSync(mdPath)) {
    console.error(`找不到 ${mdPath}`);
    process.exit(1);
  }

  // 從 frontmatter 撈出每一頁的 alt 當佔位圖的說明文字（不需要完整 YAML parser）
  const md = await readFile(mdPath, 'utf8');
  const alts = [...md.matchAll(/^\s{4}alt:\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) =>
    m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
  );
  const titleMatch = md.match(/^title:\s*"((?:[^"\\]|\\.)*)"/m);
  const title = titleMatch ? titleMatch[1] : slug;

  if (alts.length === 0) {
    console.error('讀不到任何 alt，index.md 格式可能不對');
    process.exit(1);
  }

  const imagesDir = path.join(dir, 'images');
  await mkdir(imagesDir, { recursive: true });

  const jobs = [
    { file: 'cover.webp', label: '封面', caption: title },
    ...alts.map((alt, i) => ({
      file: `${String(i + 1).padStart(2, '0')}.webp`,
      label: String(i + 1).padStart(2, '0'),
      caption: alt,
    })),
  ];

  let made = 0;
  let skipped = 0;
  for (const [i, job] of jobs.entries()) {
    const out = path.join(imagesDir, job.file);
    if (existsSync(out) && !FORCE) {
      skipped++;
      continue;
    }
    const buf = await sharp(svg(job.label, job.caption, PALETTE[i % PALETTE.length]))
      .webp({ quality: 80 })
      .toBuffer();
    await writeFile(out, buf);
    made++;
  }

  console.log(`✓ ${slug}：產生 ${made} 張佔位圖${skipped ? `，略過 ${skipped} 張已存在的` : ''}`);
  console.log(`  下一步：npm run prepare-images -- ${slug}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
