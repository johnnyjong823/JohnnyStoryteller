# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案狀態

**階段 1（骨架與部署管線）完成，階段 2 的內容管線完成。可以放故事了。**

已經可以跑：`npm run dev`、`npm run build`（含 schema 驗證）、`import-story`、`placeholders`、`prepare-images`。
GitHub Actions workflow 已就緒，但**尚未建立 GitHub repo、尚未 push**。

repo 名稱定為 **`JohnnyStoryteller`**，所以 `base` 是 `/JohnnyStoryteller`。

還沒做：選單的搜尋與分類篩選（階段 3）、PWA 離線（階段 4）。見 [docs/07-實作路線圖.md](docs/07-實作路線圖.md)。

`src/content/stories/demo-brave-owl/` 是示範故事（佔位圖），真實故事進來後可以整個資料夾刪掉。

## 這是什麼

兒童說故事的靜態網站。選單選一篇故事 → 像投影片一樣一頁一頁播放（**大圖給孩子看、小字給說書人看**）→ 結尾固定 2 題小題目。

技術棧：**Astro（`output: 'static'`）+ TypeScript + Content Collections + GitHub Actions → GitHub Pages**。

## 文件是權威

`docs/` 是這個專案的設計權威，**動手前先讀**。從 [docs/README.md](docs/README.md) 開始。

| 文件 | 什麼時候要讀 |
|---|---|
| `02-技術架構.md` | 寫任何程式碼之前 |
| `03-內容模型與撰寫規範.md` | 動到 schema、taxonomy、內容檔案時 |
| `05-畫面與互動設計.md` | 寫 UI 時（含 iOS 踩雷清單） |
| `06-風險評估.md` | 動到部署、圖片路徑、容量相關的事 |
| `08-用-Manus-產生故事.md` | 寫 `import-story` 腳本、或要產新故事時 |

## ⛔ 五條不能違反的規則

這五條都不是偏好問題，違反了會造成實際損害。每一條的完整理由在對應文件裡。

### 1. 圖片路徑一律走 `assetUrl()`，禁止寫死

```ts
// src/lib/assetUrl.ts
assetUrl(storySlug, file)   // ✅
`/stories/${slug}/01.webp`  // ❌
```

**為什麼**：預期 300+ 篇故事，約 **200 篇就會超過 GitHub Pages 的 1 GB 硬限制**。到時要把圖片搬到 Cloudflare R2，靠的就是切換 `PUBLIC_ASSET_BASE_URL` 這一個環境變數。任何寫死的路徑都會讓搬家從「半天」變成「重寫」。
→ `docs/02` 的「核心決定」、`docs/06` 風險 1

### 2. 站內連結一律用 `import.meta.env.BASE_URL` 開頭，禁止寫死開頭的 `/`

**為什麼**：已決定**不綁自訂網域**，網址是 `<帳號>.github.io/<repo>/`，所以 `astro.config.mjs` 必須設 `base`。寫死 `/` 的後果是「**本機開發完全正常、線上全部 404**」，而且很難 debug。會踩到的地方比想像多：CSS 背景圖、`<a href>`、`fetch()` 搜尋索引、PWA manifest 的 `start_url`、Service Worker scope。
→ `docs/06` 風險 10

### 3. `src/content.config.ts` 的 zod schema 是唯一品質防線，只能收緊不能放寬

**為什麼**：故事文字由 **Manus（LLM）產生**，不是人寫的。人類作者會記得規則，LLM 每次都會重新發明標籤、把 `alt` 寫成 `caption` 的複製、把 0-based 的 `answer` 寫成 1-based。分類與標籤走 `src/content/taxonomy.ts` 白名單，打錯字必須讓 `npm run build` 直接失敗。

核心觀念：**讓錯誤在 build 時爆炸，而不是在說故事給孩子聽的時候才發現。**
→ `docs/03` 的「分類與標籤白名單」、`docs/06` 風險 5

### 4. 圖片不能用 Git LFS，且進 repo 前必須壓好

**為什麼**：**GitHub Pages 不提供 LFS 檔案服務** — 會直接吐出 LFS 指標文字檔，圖片全壞。而 git 歷史刪不掉，原始大檔傳過一次就永遠佔著空間。規格是長邊 1600px、WebP q80、每張 < 300 KB。
→ `docs/04` 交付規格、`docs/06` 風險 2

### 5. PWA 絕對不能預快取所有故事圖片

**為什麼**：300 篇 = 約 1.4 GB。塞進使用者手機會直接失敗，還會吃光行動數據。只預快取殼層與搜尋索引；故事大圖改成使用者按「離線收藏」才下載。
→ `docs/02` 的「PWA 離線策略」

## 設計上的根本限制

寫 UI 前必須內化這一條，否則會做出看起來合理但實際不能用的東西：

> **說書人（大人，看文字）與孩子（看圖）共用同一塊手持螢幕。** 沒有投影機、沒有第二螢幕。

推導出來的硬性需求：圖片佔絕大部分畫面、文字小到不搶戲但清楚可讀（對比度 WCAG AA）、文字要能一鍵完全隱藏、單手可操作、防孩子誤觸（尤其是離開故事的按鈕）。

主力裝置是**手持平板與手機**，所以是觸控優先。注意 **iPhone Safari 不支援元素全螢幕 API**（iPad 支援）—— 去掉瀏覽器介面的唯一方法是 PWA「加入主畫面」的 standalone 模式。
→ `docs/01` 的「兩種使用者，同一塊螢幕」、`docs/05` 的 iOS 踩雷清單

## 其他容易踩的雷

- **中文搜尋不能用 Fuse.js / Lunr 的預設設定** — 它們用空白斷詞，中文沒有空白，搜「小紅」會找不到「小紅帽」。要用正規化 + 子字串比對。→ `docs/02`
- **`public/.nojekyll` 要存在** — Astro 輸出 `_astro/`，Jekyll 會忽略底線開頭的目錄。
- **圖片轉檔快取要納入 Actions cache** — 300 篇 × 13 張 × 4 變體 = 15,600 次 sharp 轉檔，沒快取每次 push 要 20–40 分鐘。
- **repo 是公開的** — 故事裡不要出現真實姓名、可辨識地點。→ `docs/06` 風險 3

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 本機開發。**會一起顯示 draft 故事**（正式站不會） |
| `npm run build` | `prepare-images --all` + `astro build`。**內容有錯會在這裡失敗** |
| `npm run check` | 型別檢查（`astro check`） |
| `npm run import-story -- <json>` | Manus 的 JSON → `index.md` + `prompts.md` |
| `npm run placeholders -- <slug>` | 產佔位圖，故事沒美術也能先跑完整流程 |
| `npm run prepare-images -- <slug>` | 整理 master（1600px WebP q80）+ 產響應式變體 |

⚠ npm script 傳參數要用 `--` 分隔：`npm run prepare-images -- my-slug`。

### 圖片管線的形狀

```
src/content/stories/<slug>/images/*.webp   master，進版控
        ↓ prepare-images
public/stories/<slug>/*-{480,960,1440}.avif + *-960.webp   變體，gitignored
        ↓ astro build（只是複製）
dist/stories/<slug>/...
```

刻意不用 Astro 內建的 `<Image>`：自己控制檔名才能讓 R2 遷移是「rsync + 改一個環境變數」，
而不是要處理 `_astro/` 的雜湊檔名。變體不進版控，靠 Actions cache 加速 CI。

### 已知的 Windows 現象（不是 bug）

內容驗證失敗時，Windows 上 `astro build` 會以 **127** 離開並印出
`Assertion failed: ... src\win\async.c` —— 這是 Node/libuv 在 Windows 的崩潰式離開，
不是乾淨的 `exit(1)`。**錯誤訊息仍然正確、離開碼仍然非 0，CI（Linux）不受影響。**

容量監控（搬 R2 的觸發門檻是 180 篇或 `dist/` > 700 MB）：

```bash
du -sh dist/            # 網站容量，1 GB 是硬限制
git count-objects -vH   # repo 容量，看 size-pack
```

## 語言

專案文件、內容、與使用者溝通一律**繁體中文、台灣用語**。程式碼識別字用英文。
