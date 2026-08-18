# inbox — Manus 的 JSON 放這裡

把 Manus 給你的 JSON 存成檔案丟進這個資料夾（檔名隨便），然後直接跑：

```bash
npm run import-story
```

它會自動找到這裡唯一的 JSON 並匯入。有多個檔案時會列出來讓你選。

匯入後這個 JSON 就沒用了，可以刪掉 —— 內容已經變成
`src/content/stories/<slug>/index.md` 和 `prompts.md` 了。

> 這個資料夾裡的 `.json` 不會進版控。
