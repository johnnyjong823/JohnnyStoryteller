import { defineConfig } from 'astro/config';

// site 在 CI 由 workflow 依 github.repository_owner 自動帶入，本機不影響開發。
const site = process.env.SITE ?? 'https://example.github.io';

// ⚠ 已決定不綁自訂網域，所以專案頁一定要設 base。
// 之後若綁了網域，設 BASE_PATH=/ 即可，程式碼不用動
//（所有連結都走 import.meta.env.BASE_URL，所有圖片都走 assetUrl()）。
const base = process.env.BASE_PATH ?? '/JohnnyStoryteller';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
