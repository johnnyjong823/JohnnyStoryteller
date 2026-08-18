const EXTERNAL = import.meta.env.PUBLIC_ASSET_BASE_URL ?? '';

/**
 * 產生故事圖片的 URL。
 *
 * ⛔ 任何地方都不准寫死圖片路徑，一律走這支函式。
 *
 * 現在 EXTERNAL 永遠是空字串，所以這支函式看起來多餘 —— 但它是唯一讓未來
 * 半天內完成搬家的東西。預期 300+ 篇故事，約 200 篇就會超過 GitHub Pages
 * 的 1 GB 硬限制，到時只要設 PUBLIC_ASSET_BASE_URL 就能把圖片切到
 * Cloudflare R2，內容檔案一個字都不用改。
 *
 * 見 docs/02「核心決定」與 docs/06 風險 1。
 */
export function assetUrl(storySlug: string, file: string): string {
  if (EXTERNAL) {
    return `${EXTERNAL.replace(/\/+$/, '')}/stories/${storySlug}/${file}`;
  }
  return `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/stories/${storySlug}/${file}`;
}

/** 站內連結。⛔ 禁止寫死開頭的 "/" —— 沒有自訂網域，base 是 /JohnnyStoryteller */
export function url(path = ''): string {
  return `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** 場景圖的響應式 srcset（變體由 scripts/prepare-images.mjs 產生） */
export function sceneSources(slug: string, image: string) {
  const stem = image.replace(/\.webp$/, '');
  return {
    avif: [480, 960, 1440].map((w) => `${assetUrl(slug, `${stem}-${w}.avif`)} ${w}w`).join(', '),
    webp: assetUrl(slug, `${stem}-960.webp`),
  };
}

/** 封面縮圖（選單用，320/640 兩種密度） */
export function coverSources(slug: string, cover: string) {
  const stem = cover.replace(/\.webp$/, '');
  return {
    avif: [320, 640].map((w) => `${assetUrl(slug, `${stem}-${w}.avif`)} ${w}w`).join(', '),
    webp: assetUrl(slug, `${stem}-320.webp`),
  };
}
