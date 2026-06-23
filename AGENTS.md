# Agent Instructions

`x-dm-translate` — Tampermonkey userscript for X (Twitter) DM + tweet translation via OpenRouter. TypeScript + Vite + `vite-plugin-monkey`.

## Build

```bash
npm install
npm run dev      # vite + userscript HMR
npm run build    # dist/x-dm-openrouter-translate.user.js
```

After build, **copy `dist/x-dm-openrouter-translate.user.js` to the repo root** — the root copy is intentionally tracked. Use `git add -f dist/...` since `.gitignore` excludes the directory.

## Layout

```
src/
  app.ts        main logic: scanning, rendering, queues, panels, cache
  main.ts       entry, just calls start()
  constants.ts  SCRIPT_ID, model, URL, GM_* keys
  prompts.ts    LLM prompt templates
  schemas.ts    OpenRouter json_schema response constraints
  state.ts      shared mutable state (translating sets, profile queues)
  styles.ts     CSS injected into the page
```

End-user docs live in `README.md` / `README.zh-CN.md` / `README.ja.md` / `README.ko.md` — keep them in sync on user-visible behavior changes. Don't write code that contradicts what's documented there.

## Conventions

- TypeScript for all source. `tsconfig.json` has `strict: false`; many existing helpers pass plain `Element`/`EventTarget` — match that style unless fixing the typing.
- DOM-based. `GM_*` APIs only via `GM_xmlhttpRequest` / `GM_getValue` / etc. — never `fetch`.
- **No hardcoded API keys, model URLs, or secrets in source.** `ENV_OPENROUTER_API_KEY` in `constants.ts` must stay `''`. Audit `grep -E "sk-or-v1-|sk-[A-Za-z0-9]{20,}" src/ dist/` should return zero hits before pushing.
- Bump `version` in both `vite.config.ts` and `package.json` together on user-facing changes (semver: `fix:` → patch, `feat:` → minor).
- Commit message prefix: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` (Conventional Commits). Scope is optional, e.g. `feat(tweet):`.

## Notes

- The script runs on `x.com` and `twitter.com` URLs (DM + status pages). DOM selectors are X's internal `data-testid` attributes; when X changes them, scan both `app.ts` and `styles.ts` for the selector and update.
- Tweet scan / reply buttons (`scanTweetArticles`, `ensureTweetReplyButtons`) are intentionally NOT gated by `isTargetConversation()` — they run on every page. Only DM scanning (`scanMessages`) and suggestion panels are gated. Preserve this distinction.
- The built userscript bundle is minified but not minified-pretty — readable enough to grep for selectors and class names when debugging.