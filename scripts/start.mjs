#!/usr/bin/env node
/**
 * start.bat 的實作。
 *
 * 為什麼中文不寫在 .bat 裡：cmd.exe 是逐位元組解析批次檔的，
 * UTF-8 中文會讓解析器錯位，`chcp 65001` 也救不了（它只影響顯示，
 * 不影響已經在進行的解析）。所以 .bat 保持純 ASCII，所有中文由 Node 輸出。
 */

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { lanIps } from './lan-ip.mjs';

const DEFAULT_PORT = 4321;
const BASE = '/JohnnyStoryteller/';

/**
 * 先自己挑一個空的埠，再把它傳給 astro。
 * 不能讓 astro 自己挑 —— 它會靜靜換到 4322，但橫幅上印的還是 4321，
 * 使用者就會照著錯的網址在手機上打，然後以為壞掉了。
 */
function isFree(port) {
  return new Promise((resolve) => {
    const srv = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => srv.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

async function findPort(start) {
  for (let p = start; p < start + 20; p++) {
    if (await isFree(p)) return p;
  }
  return start;
}

const PORT = await findPort(DEFAULT_PORT);
const LOCAL = `http://localhost:${PORT}${BASE}`;

const line = (s = '') => console.log(s);

function run(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 0));
  });
}

async function countStories() {
  const dir = path.join('src', 'content', 'stories');
  if (!existsSync(dir)) return 0;
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).length;
}

/** 等伺服器真的起來再開瀏覽器，不然會看到「無法連線」 */
async function openWhenReady() {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(LOCAL, { signal: AbortSignal.timeout(1000) });
      if (res.ok) break;
    } catch {
      continue;
    }
  }
  spawn('cmd', ['/c', 'start', '', LOCAL], { detached: true, stdio: 'ignore' }).unref();
}

// ── 開始 ─────────────────────────────────────────────────

line();
line('  ============================================');
line('    說書人強尼 — 本地測試');
line('  ============================================');
line();

const n = await countStories();
if (n === 0) {
  line('  目前沒有任何故事。加一篇：');
  line();
  line('    npm run manus-prompt -- "我想跟孩子講……"');
  line('    （把 Manus 回的 JSON 存進 inbox/ 資料夾）');
  line('    npm run import-story');
  line();
} else {
  line(`  ${n} 篇故事`);
  line();
}

line('  [..] 整理圖片…');
const imgCode = await run([path.join('scripts', 'prepare-images.mjs'), '--all', '--quiet']);
if (imgCode !== 0) {
  line();
  line('  [X] 圖片處理失敗，請把上面的錯誤訊息貼給我。');
  process.exit(1);
}

line();
line('  --------------------------------------------');
line('   在這台電腦上看：');
line(`     ${LOCAL}`);
line();
line('   用手機或平板看（要連同一個 Wi-Fi）：');

const ips = lanIps();
if (ips.length === 0) {
  line('     [找不到區網 IP，請確認電腦有連上 Wi-Fi]');
} else {
  ips.slice(0, 3).forEach((ip, i) => {
    const url = `http://${ip.address}:${PORT}${BASE}`;
    line(i === 0 ? `     ${url}` : `     連不上的話試： ${url}`);
  });
}

line('  --------------------------------------------');
if (PORT !== DEFAULT_PORT) {
  line();
  line(`   （${DEFAULT_PORT} 埠被別的程式占用了，改用 ${PORT}）`);
}
line();
line('   手機／平板才是真正的測試方式 —— 這個網站是為手持裝置');
line('   做的，電腦上看不出真正的樣子。');
line();
line('   草稿（status: draft）在本地看得到，正式網站不會。');
line();
line('   要停止：按 Ctrl+C');
line();

if (!process.argv.includes('--no-open')) openWhenReady();

const code = await run([
  path.join('node_modules', 'astro', 'astro.js'),
  'dev',
  '--host',
  '--port',
  String(PORT),
]);
process.exit(code);
