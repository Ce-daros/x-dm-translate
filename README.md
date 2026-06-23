[简体中文](README.zh-CN.md) · **[English](README.md)** · [日本語](README.ja.md) · [한국어](README.ko.md)

---

# x-dm-translate

A Tampermonkey userscript for X (Twitter): translate DMs and tweets + draft Japanese replies. Backed by OpenRouter.

- **Direct messages (DM)**: Auto-translate incoming Japanese messages in matched conversations; manually translate Chinese drafts into 3 Japanese candidates via the 「译」 panel.
- **Tweets / comments**: A 「译」 button now appears under every `article[data-testid="tweet"]`. **Manual click** triggers translation — auto-translation is removed.
- **Cache**: Translations are cached in `GM_setValue` keyed by `(model, profile, statusId/messageId, hash)`. Cached results render immediately on revisit.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey).
2. Drag `dist/x-dm-openrouter-translate.user.js` into the browser to install. The root-level copy of the same file is also valid (AGENTS.md convention).
3. Open https://x.com/ and pick 「翻译设置」 from the Tampermonkey menu.
4. Fill in your **OpenRouter API key** (required), add target X IDs (comma-separated, or `*` for all).

> The API key lives only in browser-local `GM_setValue` and is never sent to any server. The source and build artifacts contain zero hardcoded keys — a security audit `grep "sk-"` returns zero hits under `src/` and `dist/`.

## Match scope

```js
match: [
  'https://x.com/i/chat*',
  'https://twitter.com/i/chat*',
  'https://x.com/*/status/*',
  'https://twitter.com/*/status/*',
]
```

Timeline / search pages aren't in `match`, but the script scans by `article[data-testid="tweet"]` so the 「译」 button still appears there. To suppress it on timeline, remove the `scanTweetArticles()` call from `tick()`.

## Development

```bash
npm install
npm run dev      # vite + vite-plugin-monkey, HMR
npm run build    # outputs dist/x-dm-openrouter-translate.user.js
npm run preview
```

After build, manually copy `dist/x-dm-openrouter-translate.user.js` to the repo root (AGENTS.md convention).

## Directory structure

```
src/
  app.ts        Main logic: scan, render, translation queue, settings panel, reply panel, cache panel
  main.ts       Entry, just calls start()
  constants.ts  SCRIPT_ID, model, URL, GM keys, etc.
  prompts.ts    4 LLM prompt templates (DM translation / reply translation / suggestions / profile summary)
  schemas.ts    OpenRouter json_schema response constraints
  state.ts      Shared mutable state (translating sets, profile queues, etc.)
  styles.ts     CSS injected into the page
```

`vite.config.ts` `userscript.grant` lists the `GM_*` permissions the script needs: `GM_xmlhttpRequest`, `GM_getValue` / `GM_setValue` / `GM_deleteValue` / `GM_listValues`, `GM_registerMenuCommand`, `unsafeWindow`, plus `@connect openrouter.ai`.

## Behavior

### Tweets / comments (since v0.3)

- **No more auto-translation**. Every tweet gets a row with a 「译」 button; clicking it triggers translation.
- If the clicked text isn't Japanese, the slot writes `未检测到日语内容，跳过翻译` (avoids silent failure).
- Already-translated tweets render from cache immediately, no need to click again.
- DM auto-translation is unchanged and still gated by the `autoTranslate` setting.

### Direct messages (DM)

- Only conversations matching `targetXIds` are scanned; incoming messages containing Japanese are auto-queued for translation.
- Queue limit is `maxConcurrentTranslations` (default 6); the rest wait in line.
- Every 10 new incoming messages triggers a partner profile-summary update, fed into subsequent translations as context.

### Reply drafts (DM and tweet detail pages)

- DM translation panel: write Chinese → click translate → 3 Japanese candidates + Chinese notes; clicking a candidate fills it into the input box.
- Tweet detail page 「🤔」 button: generates 3 Chinese reply drafts based on the main tweet; same click-to-fill behavior.

## Cache

- Keyed by `(model, profileId, messageId/statusId, textHash)`.
- Limit `cacheLimit` (default 800); LRU eviction.
- The settings panel has 「查看缓存」 and 「清空缓存」 actions.

## Settings

| key | default | description |
|---|---|---|
| `openRouterApiKey` | `''` | OpenRouter key, required |
| `targetXIds` | `[]` | List of X IDs to monitor; `*` for all |
| `userProfile` / `myProfile` | `''` | Your own profile (gender, address, relationship), affects translation pronouns |
| `partnerProfile` | `''` | Default partner profile fallback |
| `autoTranslate` | `true` | DM auto-translation toggle (does not affect tweets) |
| `maxMessagesPerScan` | `30` | Max messages processed per scan |
| `maxConcurrentTranslations` | `6` | Concurrent translation limit |
| `cacheLimit` | `800` | Cache entry limit |
| `taskLogLimit` | `200` | Task log entry limit |

Every prompt template is also editable in the settings panel, with per-prompt 「恢复默认」.

## Model / backend

- Model: `deepseek/deepseek-v4-flash` (`src/constants.ts`)
- URL: `https://openrouter.ai/api/v1/chat/completions`
- Provider restriction: `{ only: ['cloudflare'] }` (Cloudflare route)
- Requests include `HTTP-Referer: <origin>` and `X-OpenRouter-Title: X DM Translator`, per OpenRouter attribution requirements

## Known limitations

- `unsafeWindow` is declared but only used for `unsafeWindow.OPENROUTER_API_KEY` — that path only fires if the host page explicitly exposes a global; otherwise falls back to `GM_getValue`.
- All requests go through `GM_xmlhttpRequest`, not dependent on `event.isTrusted`.
- Timeline only renders buttons + cache; nothing is auto-called. Click to translate.
- For quoted / replied nested tweets, cache key uses each article's own `/status/<id>`; nested layers cache independently.

## Version

- v0.3.0: tweet / comment translation switched from auto to manual.
- v0.2.x and earlier: tweets auto-translated only on detail pages with `autoTranslate=true`.