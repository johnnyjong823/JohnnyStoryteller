#!/usr/bin/env node
/**
 * 圖片管線。
 *
 *   src/content/stories/<slug>/images/*.webp   ← master（進版控，1600px q80）
 *                    ↓  本腳本
 *   public/stories/<slug>/*-{480,960,1440}.avif + *-960.webp   ← 變體（gitignored，建置產物）
 *
 * 兩件事一起做：
 *   1. 把你從 AI 繪圖工具拿到的 png/jpg 轉成 master webp（原檔移到 <slug>/raw/，不進版控）
 *   2. 從 master 產生響應式變體到 public/
 *
 * 用法：
 *   npm run prepare-images -- --all           全部故事
 *   npm run prepare-images -- <slug>          單一故事
 *   npm run prepare-images -- --all --force   忽略快取，全部重做
 *
 * 見 docs/04-圖片製作指南.md
 */

import {
  readdir,
  mkdir,
  stat,
  rename,
  writeFile,
  readFile,
  copyFile,
  unlink,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const STORIES_DIR = path.join('src', 'content', 'stories');
const OUT_ROOT = path.join('public', 'stories');

const MASTER_WIDTH = 1600;
const MASTER_QUALITY = 80;
const MASTER_MAX_BYTES = 300 * 1024; // 交付規格：每張 < 300 KB（docs/04）
/** 低於這個寬度的 master 會被警告：放大的變體只是浪費位元組 */
const MIN_USEFUL_WIDTH = 1440;

const SCENE_VARIANTS = [
  { w: 480, fmt: 'avif', q: 50 },
  { w: 960, fmt: 'avif', q: 50 },
  { w: 1440, fmt: 'avif', q: 50 },
  { w: 960, fmt: 'webp', q: 78 },
];

const COVER_VARIANTS = [
  { w: 320, fmt: 'avif', q: 50 },
  { w: 640, fmt: 'avif', q: 50 },
  { w: 320, fmt: 'webp', q: 78 },
];

const SOURCE_EXT = /\.(png|jpe?g|webp)$/i;
const STEM_RE = /^(cover|\d{2})$/;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const targets = args.filter((a) => !a.startsWith('--'));
const QUIET = flags.has('--quiet');
const FORCE = flags.has('--force');
const ALL = flags.has('--all');

const log = (...m) => !QUIET && console.log(...m);
const warn = (...m) => console.warn(...m);

function kb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}
function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function mtime(p) {
  try {
    return (await stat(p)).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Windows 專用的搬檔重試。
 *
 * 縮圖產生器（dllhost）、防毒、檔案總管預覽窗格都可能短暫鎖住剛寫過的圖，
 * rename 就會吐 EBUSY／EPERM。退讓重試，最後才退到「複製再刪除」。
 * 這裡不能吞掉錯誤：原始 PNG 留在 images/ 會被 git 收進版控（見 CLAUDE.md 規則 4）。
 */
async function moveOut(from, to, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err;
      if (i >= tries) {
        await copyFile(from, to);
        await unlink(from); // 失敗就讓它炸，原檔絕不能留在 images/
        return;
      }
      await new Promise((r) => setTimeout(r, 150 * 2 ** i));
    }
  }
}

/** 把 AI 產出的 png/jpg（或過大的 webp）整理成規格內的 master */
async function ensureMaster(imagesDir, rawDir, file) {
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  if (!STEM_RE.test(stem)) {
    warn(`  ⚠ 略過 ${file}：檔名要是 cover 或兩位數補零（01、02…）`);
    return null;
  }

  const src = path.join(imagesDir, file);
  const master = path.join(imagesDir, `${stem}.webp`);
  // 一定要先整個讀成 Buffer 再餵給 sharp。
  // sharp(路徑) 會讓 libvips 把來源檔開著，Windows 上接下來的 rename／覆寫
  // 就會拿到 EBUSY（2026-08-19 實際踩到，整批圖處理到第一張就斷）。
  const srcBuf = await readFile(src);
  const meta = await sharp(srcBuf).metadata();
  // ⚠ 格式看內容，不信副檔名 —— AI 工具下載的常是「改了名的 PNG」（火星那批
  //   12 張就是：.webp 副檔名、PNG 內容、每張 6 MB），信副檔名會直接放行進版控。
  const isWebp = meta.format === 'webp';
  const oversized = (meta.width ?? 0) > MASTER_WIDTH;
  const tooHeavy = srcBuf.length > MASTER_MAX_BYTES;

  // 已經是規格內的 master（真 webp、寬度夠、容量達標），不動它
  if (isWebp && !oversized && !tooHeavy) return master;

  const buf = await sharp(srcBuf)
    .rotate() // 依 EXIF 轉正
    .resize({ width: MASTER_WIDTH, withoutEnlargement: true })
    .webp({ quality: MASTER_QUALITY })
    .toBuffer();

  if (!isWebp) {
    // 原始大檔移到 raw/（gitignored）—— git 歷史刪不掉，原檔絕不能進版控。
    // 副檔名說謊時（.webp 的 PNG），src 就是 master 本人，一定要先搬走再寫，
    // 順序反了會把剛壓好的 master 搬進 raw/。raw/ 裡用真實格式命名才看得懂。
    await mkdir(rawDir, { recursive: true });
    const fmt = meta.format === 'jpeg' ? 'jpg' : (meta.format ?? 'bin');
    const rawName = ext.toLowerCase() === `.${fmt}` ? file : `${stem}.${fmt}`;
    await moveOut(src, path.join(rawDir, rawName));
    await writeFile(master, buf);
    log(`  ↻ ${file}（實際是 ${meta.format}）→ ${stem}.webp (${kb(buf.length)})，原檔移到 raw/${rawName}`);
  } else {
    await writeFile(master, buf);
    const why = oversized ? `太寬（${meta.width}px）` : `太肥（${kb(srcBuf.length)}）`;
    log(`  ↻ ${file} ${why} → 重壓成 ${kb(buf.length)}`);
  }

  if (buf.length > MASTER_MAX_BYTES) {
    warn(`  ⚠ ${stem}.webp 重壓後仍有 ${kb(buf.length)}（規格 < ${kb(MASTER_MAX_BYTES)}）— 這張圖太複雜，考慮換一張`);
  }
  return master;
}

async function buildVariants(master, outDir, variants) {
  const stem = path.basename(master, '.webp');
  const srcTime = await mtime(master);
  const meta = await sharp(master).metadata();
  let written = 0;
  let bytes = 0;

  for (const v of variants) {
    const out = path.join(outDir, `${stem}-${v.w}.${v.fmt}`);
    if (!FORCE && (await mtime(out)) > srcTime) {
      bytes += (await stat(out)).size;
      continue; // 快取命中
    }
    const pipeline = sharp(master).resize({ width: v.w, withoutEnlargement: true });
    const buf =
      v.fmt === 'avif'
        ? await pipeline.avif({ quality: v.q, effort: 4 }).toBuffer()
        : await pipeline.webp({ quality: v.q }).toBuffer();
    await writeFile(out, buf);
    written++;
    bytes += buf.length;
  }
  return { written, bytes, width: meta.width ?? 0 };
}

async function processStory(slug) {
  const storyDir = path.join(STORIES_DIR, slug);
  const imagesDir = path.join(storyDir, 'images');
  const rawDir = path.join(storyDir, 'raw');
  const outDir = path.join(OUT_ROOT, slug);

  if (!existsSync(imagesDir)) {
    warn(`⚠ ${slug}：找不到 images/，跳過`);
    return { slug, bytes: 0, written: 0, images: 0 };
  }

  log(`\n▸ ${slug}`);
  await mkdir(outDir, { recursive: true });

  const files = (await readdir(imagesDir)).filter((f) => SOURCE_EXT.test(f)).sort();
  const masters = new Set();
  for (const f of files) {
    const m = await ensureMaster(imagesDir, rawDir, f);
    if (m) masters.add(m);
  }

  let totalWritten = 0;
  let totalBytes = 0;
  for (const master of [...masters].sort()) {
    const stem = path.basename(master, '.webp');
    const variants = stem === 'cover' ? COVER_VARIANTS : SCENE_VARIANTS;
    const { written, bytes, width } = await buildVariants(master, outDir, variants);
    if (width && width < MIN_USEFUL_WIDTH && stem !== 'cover') {
      warn(`  ⚠ ${stem}.webp 只有 ${width}px 寬，建議至少 ${MIN_USEFUL_WIDTH}px`);
    }
    totalWritten += written;
    totalBytes += bytes;
  }

  log(`  ${masters.size} 張 master → ${totalWritten} 個變體重建，共 ${kb(totalBytes)}`);
  return { slug, bytes: totalBytes, written: totalWritten, images: masters.size };
}

async function main() {
  if (!ALL && targets.length === 0) {
    console.error('用法：npm run prepare-images -- --all   或   npm run prepare-images -- <slug>');
    process.exit(1);
  }

  if (!existsSync(STORIES_DIR)) {
    log('尚無 src/content/stories/，跳過');
    return;
  }

  const slugs = ALL
    ? (await readdir(STORIES_DIR, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : targets;

  if (slugs.length === 0) {
    log('尚無故事，跳過');
    return;
  }

  const results = [];
  for (const slug of slugs) results.push(await processStory(slug));

  const totalBytes = results.reduce((a, r) => a + r.bytes, 0);
  const totalImages = results.reduce((a, r) => a + r.images, 0);

  log(`\n${'─'.repeat(52)}`);
  log(`${results.length} 篇故事 ／ ${totalImages} 張圖 ／ 輸出 ${mb(totalBytes)}`);

  // 容量警戒線（docs/06 風險 1：GitHub Pages 發布網站上限 1 GB 是硬限制）
  const MB = totalBytes / 1024 / 1024;
  if (MB > 700) {
    warn(`\n🔴 圖片輸出已達 ${mb(totalBytes)} —— 超過 700 MB 警戒線。`);
    warn(`   該執行 docs/06 的 R2 遷移劇本了（設定 PUBLIC_ASSET_BASE_URL）。`);
  } else if (MB > 500) {
    warn(`\n🟡 圖片輸出 ${mb(totalBytes)}，接近 700 MB 警戒線，可以開始準備 R2 了。`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
