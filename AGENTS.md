# Agent Instructions

## Project Overview

`x-dm-translate` is a browser userscript (Tampermonkey/Violentmonkey) that translates X (Twitter) DM messages using the OpenRouter API. It is built with TypeScript and Vite, using `vite-plugin-monkey` to bundle the userscript.

## Tech Stack

- **Language:** TypeScript
- **Build Tool:** Vite 8
- **Userscript Plugin:** `vite-plugin-monkey`
- **Package Manager:** npm

## Build Commands

```bash
npm install      # install dependencies
npm run dev      # start dev build with userscript HMR
npm run build    # production build -> outputs dist/x-dm-openrouter-translate.user.js
npm run preview  # preview built output
```

## Project Structure

```
src/
  app.ts        # main app logic / UI interaction
  main.ts       # entry point
  constants.ts  # constants (selectors, API config, etc.)
  prompts.ts    # LLM prompt templates
  schemas.ts    # Zod / validation schemas
  state.ts      # reactive / shared state
  styles.ts     # injected CSS styles
  vite-env.d.ts # Vite client types
dist/
  x-dm-openrouter-translate.user.js  # built userscript output
vite.config.ts
package.json
```

## Coding Conventions

- Use **TypeScript** for all source files.
- Keep logic modular; prefer small files under `src/`.
- Avoid committing `node_modules/` or `dist/` — both are ignored via `.gitignore`.
- The built userscript at `dist/x-dm-openrouter-translate.user.js` is currently also tracked in the repo root as a convenience copy. Be mindful when updating it.

## Notes

- This is a browser userscript, so DOM APIs and `unsafeWindow`-style access are expected.
- API keys and runtime config are managed inside the userscript / UI, not hardcoded.
