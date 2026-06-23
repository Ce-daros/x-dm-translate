**[简体中文](README.zh-CN.md)** · [English](README.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

---

# x-dm-translate

X (Twitter) 的 Tampermonkey 用户脚本：私信和推文翻译 + 日语回复草稿生成，后端走 OpenRouter。

- **私信（DM）**：进入目标会话后自动翻译收到的日文消息，可手动用「译」面板把中文草稿翻成 3 个日语候选。
- **推文 / 评论**：每条 `article[data-testid="tweet"]` 下方出现「译」按钮，**手动点击**才会触发翻译（不再自动跑）。
- **回退的缓存**：翻译结果按 `(model, profile, statusId/messageId, hash)` 缓存到 `GM_setValue`，下一次直接展示。

## 安装

1. 装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）。
2. 把 `dist/x-dm-openrouter-translate.user.js` 拖进浏览器安装；或者从仓库根的同文件名副本装也行（AGENTS.md 里约定的便利副本）。
3. 打开 https://x.com/ ，Tampermonkey 菜单里选「翻译设置」。
4. 填 **OpenRouter API key**（必填，没有就跑不了翻译），加目标 X ID（多个用逗号分隔，或填 `*` 表示全部）。

> API key 只存在浏览器本地 `GM_setValue` 里，不会上传到任何服务器。源码和构建产物里都没有硬编码 key —— 安全审计可见 `grep "sk-"` 在 `src/` 和 `dist/` 下零命中。

## 匹配范围

```js
match: [
  'https://x.com/i/chat*',
  'https://twitter.com/i/chat*',
  'https://x.com/*/status/*',
  'https://twitter.com/*/status/*',
]
```

时间线 / 搜索页虽然不在 match 里，但脚本里通过 `article[data-testid="tweet"]` 选择器扫描，所以也会显示「译」按钮。需要在时间线上完全不显示，去 `tick()` 里把 `scanTweetArticles()` 调用删了。

## 开发

```bash
npm install
npm run dev      # vite + vite-plugin-monkey，边改边热更新
npm run build    # 产出 dist/x-dm-openrouter-translate.user.js
npm run preview
```

构建完手动把 `dist/x-dm-openrouter-translate.user.js` 复制一份到仓库根（`AGENTS.md` 的约定）。

## 目录结构

```
src/
  app.ts        主逻辑：扫描、渲染、翻译队列、设置面板、回复面板、缓存面板
  main.ts       入口，只调 start()
  constants.ts  SCRIPT_ID、模型、URL、GM key 名等
  prompts.ts    4 套 LLM prompt（私信翻译 / 回复翻译 / 建议对话 / 画像总结）
  schemas.ts    OpenRouter json_schema 响应约束
  state.ts      共享可变状态（translating 集合、profile 队列等）
  styles.ts     注入到页面的 CSS
```

`vite.config.ts` 里 `userscript.grant` 列了脚本需要的 `GM_*` 权限：`GM_xmlhttpRequest`、`GM_getValue` / `GM_setValue` / `GM_deleteValue` / `GM_listValues`、`GM_registerMenuCommand`、`unsafeWindow`，外加 `@connect openrouter.ai`。

## 行为说明

### 推文 / 评论（v0.3 起）

- **不再自动翻译**。每条推文都会插一行 + 一个「译」按钮，**只有点按钮才触发翻译**。
- 点按钮命中非日语内容时，槽位里写 `未检测到日语内容，跳过翻译`（避免静默失败）。
- 已经翻译过的推文会立刻展示缓存，不需要再点。
- DM 的自动翻译逻辑没动，仍受 `autoTranslate` 设置控制。

### 私信（DM）

- 命中 `targetXIds` 的会话才会扫；收到含日语的消息自动入翻译队列。
- 队列上限 `maxConcurrentTranslations`（默认 6），超过排队。
- 收到的消息每累计 10 条会更新对方的「画像摘要」，喂给后续翻译作为上下文。

### 回复草稿（DM 和推文详情页）

- DM 翻译面板里写中文 → 点翻译 → 出 3 个日语候选 + 中文解释；点候选填到输入框。
- 推文详情页的「🤔」按钮基于主推文生成 3 条中文回复建议，同样点候选填到输入框。

## 缓存

- 按 `(model, profileId, messageId/statusId, textHash)` 缓存。
- 上限 `cacheLimit`（默认 800）条，超出按 LRU 淘汰。
- 设置面板里可以「查看缓存」「清空缓存」。

## 设置项

| key | 默认 | 说明 |
|---|---|---|
| `openRouterApiKey` | `''` | OpenRouter key，必填 |
| `targetXIds` | `[]` | 监听的 X ID 列表，`*` 表示全部 |
| `userProfile` / `myProfile` | `''` | 自己的资料（性别、称呼、关系），影响翻译人称 |
| `partnerProfile` | `''` | 默认对方资料 fallback |
| `autoTranslate` | `true` | DM 自动翻译开关（不影响推文） |
| `maxMessagesPerScan` | `30` | 单次扫描最多处理的消息数 |
| `maxConcurrentTranslations` | `6` | 并发翻译数 |
| `cacheLimit` | `800` | 缓存条目上限 |
| `taskLogLimit` | `200` | 任务日志条数 |

每条 prompt 也都能在设置面板里单独编辑 / 恢复默认。

## 模型 / 后端

- 模型：`deepseek/deepseek-v4-flash`（`src/constants.ts`）
- URL：`https://openrouter.ai/api/v1/chat/completions`
- Provider 限制：`{ only: ['cloudflare'] }`（走 Cloudflare 路由）
- 请求里会带 `HTTP-Referer: <origin>` 和 `X-OpenRouter-Title: X DM Translator`，符合 OpenRouter 的归属要求

## 已知限制

- `unsafeWindow` 拿不到、但脚本又用了 `unsafeWindow.OPENROUTER_API_KEY` —— 那条路径只有在宿主页面里显式注入全局变量时才会命中，正常情况下走 `GM_getValue`。
- 所有请求都通过 `GM_xmlhttpRequest` 发出，不依赖 `event.isTrusted`。
- 时间线只展示按钮 + 缓存，不调用任何 API；想看翻译必须点。
- 评论区嵌套引用推文时，缓存键按文章自身的 `/status/<id>` 算，多层引用各自独立缓存。

## 版本

- 0.3.0 起，推文/评论的翻译由自动改为手动。
- 0.2.x 及之前：推文只在详情页且设置 `autoTranslate=true` 时自动跑。