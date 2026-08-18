# 說書人強尼

兒童說故事網站。選一篇故事 → 像投影片一樣一頁一頁播放（**大圖給孩子看、小字給說書人看**）→ 結尾接 2 題小題目。

Astro（純靜態）→ GitHub Pages。主力裝置是**手持平板與手機**。

## 新增一篇故事

```bash
# ① 去 Manus 產 JSON（提示詞範本在 docs/08-用-Manus-產生故事.md）
npm run import-story -- ./manus-output.json

# ② 想先看到效果？先用佔位圖跑一遍
npm run placeholders -- <slug>
npm run prepare-images -- <slug>
npm run dev

# ③ 產好真正的圖，丟進 src/content/stories/<slug>/images/
#    檔名 cover / 01 / 02…（png、jpg、webp 都可以）
npm run prepare-images -- <slug>

# ④ 把 index.md 的 status 改成 published，然後 push
```

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 本機開發（會一起顯示 draft 故事） |
| `npm run build` | 建置 + **schema 驗證**（內容有錯會在這裡失敗） |
| `npm run import-story -- <json>` | Manus JSON → `index.md` + `prompts.md` |
| `npm run placeholders -- <slug>` | 產佔位圖，讓故事沒美術也能先跑 |
| `npm run prepare-images -- <slug>` | 壓成 master + 產響應式變體 |

## 文件

設計權威在 [`docs/`](./docs/)，從 [docs/README.md](./docs/README.md) 開始。
動手改程式碼前請先看 [CLAUDE.md](./CLAUDE.md) 的「五條不能違反的規則」。
