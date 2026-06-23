[简体中文](README.zh-CN.md) · [English](README.md) · **[日本語](README.ja.md)** · [한국어](README.ko.md)

---

# x-dm-translate

X (Twitter) 向けの Tampermonkey ユーザースクリプト：DM と投稿の翻訳 + 日本語返信の下書き生成。バックエンドは OpenRouter。

- **ダイレクトメッセージ (DM)**：対象会話に入った瞬間、受信した日本語メッセージを自動翻訳。「訳」パネルでは中文の下書きを手動で 3 つの日本語候補に翻訳可能。
- **投稿 / コメント**：すべての `article[data-testid="tweet"]` の下に「訳」ボタンが表示されます。**手動クリック**で初めて翻訳が走り、自動翻訳は廃止されました。
- **キャッシュ**：翻訳結果は `(model, profile, statusId/messageId, hash)` をキーに `GM_setValue` に保存され、次回以降は即座に表示されます。

## インストール

1. [Tampermonkey](https://www.tampermonkey.net/)（または Violentmonkey）をインストール。
2. `dist/x-dm-openrouter-translate.user.js` をブラウザにドラッグして導入。ルート直下にある同名コピーでも OK（`AGENTS.md` の慣習）。
3. https://x.com/ を開き、Tampermonkey メニューから「翻译设置」を選ぶ。
4. **OpenRouter API key** を入力（必須、ないと翻訳は走らない）、監視対象の X ID を追加（カンマ区切り、または `*` で全部）。

> API key はブラウザローカルの `GM_setValue` にしか保存されず、外部サーバーには送信されません。ソースとビルド成果物にハードコードされた key はゼロです。`grep "sk-"` のセキュリティ監査で `src/` と `dist/` の両方が 0 ヒット。

## マッチ範囲

```js
match: [
  'https://x.com/i/chat*',
  'https://twitter.com/i/chat*',
  'https://x.com/*/status/*',
  'https://twitter.com/*/status/*',
]
```

タイムライン / 検索ページは `match` に含まれませんが、スクリプトが `article[data-testid="tweet"]` で走査するため「訳」ボタンは表示されます。タイムラインで完全に非表示にしたい場合は、`tick()` の `scanTweetArticles()` 呼び出しを削除してください。

## 開発

```bash
npm install
npm run dev      # vite + vite-plugin-monkey、HMR 付き
npm run build    # dist/x-dm-openrouter-translate.user.js を出力
npm run preview
```

ビルド後、`dist/x-dm-openrouter-translate.user.js` を手動でリポジトリ直下にコピーしてください（`AGENTS.md` の規約）。

## ディレクトリ構成

```
src/
  app.ts        メインロジック：走査、レンダリング、翻訳キュー、設定パネル、返信パネル、キャッシュパネル
  main.ts       エントリポイント、start() を呼ぶだけ
  constants.ts  SCRIPT_ID、モデル、URL、GM キー名など
  prompts.ts    4 種類の LLM プロンプト（DM 翻訳 / 返信翻訳 / 会話提案 / プロフィール要約）
  schemas.ts    OpenRouter json_schema レスポンス制約
  state.ts      共有可変状態（translating セット、profile キューなど）
  styles.ts     ページに注入する CSS
```

`vite.config.ts` の `userscript.grant` に必要な `GM_*` 権限を列挙：`GM_xmlhttpRequest`、`GM_getValue` / `GM_setValue` / `GM_deleteValue` / `GM_listValues`、`GM_registerMenuCommand`、`unsafeWindow`、加えて `@connect openrouter.ai`。

## 挙動

### 投稿 / コメント（v0.3 以降）

- **自動翻訳は廃止**。すべての投稿に「译」行＋ボタンが挿入され、**ボタンを押したときだけ**翻訳が走ります。
- ボタン押下時に日本語が含まれていなければ、スロットに `未检测到日语内容，跳过翻译` を表示（無音失敗を避けるため）。
- 翻訳済みの投稿はキャッシュから即座に表示され、再クリック不要。
- DM の自動翻訳ロジックは無変更で、`autoTranslate` 設定で制御されます。

### ダイレクトメッセージ (DM)

- `targetXIds` にマッチした会話のみ走査。日本語を含む受信メッセージは自動で翻訳キューへ。
- キュー上限は `maxConcurrentTranslations`（デフォルト 6）、超過分は待機。
- 受信メッセージが累計 10 件に達するごとに相手の「プロフィール要約」を更新し、以降の翻訳のコンテキストに投入。

### 返信下書き（DM および投稿詳細ページ）

- DM 翻訳パネル：中文を書く → 翻訳をクリック → 日本語候補 3 件 + 中文の解説 → 候補をクリックで入力欄に流し込み。
- 投稿詳細ページの「🤔」ボタン：主投稿に基づいて中文返信案を 3 件生成、同じくクリックで流し込み。

## キャッシュ

- キーは `(model, profileId, messageId/statusId, textHash)`。
- 上限 `cacheLimit`（デフォルト 800）、超過分は LRU で淘汰。
- 設定パネルに「查看缓存」「清空缓存」操作あり。

## 設定項目

| key | デフォルト | 説明 |
|---|---|---|
| `openRouterApiKey` | `''` | OpenRouter key、必須 |
| `targetXIds` | `[]` | 監視対象の X ID リスト、`*` で全部 |
| `userProfile` / `myProfile` | `''` | 自身のプロフィール（性別、呼び方、関係）、翻訳の人称に影響 |
| `partnerProfile` | `''` | デフォルトの相手のプロフィール fallback |
| `autoTranslate` | `true` | DM 自動翻訳スイッチ（投稿には影響しない） |
| `maxMessagesPerScan` | `30` | 1 回の走査で処理する最大メッセージ数 |
| `maxConcurrentTranslations` | `6` | 並列翻訳数 |
| `cacheLimit` | `800` | キャッシュ件数上限 |
| `taskLogLimit` | `200` | タスクログ件数 |

各プロンプトも設定パネルで個別編集 / デフォルト復元が可能。

## モデル / バックエンド

- モデル：`deepseek/deepseek-v4-flash`（`src/constants.ts`）
- URL：`https://openrouter.ai/api/v1/chat/completions`
- Provider 制限：`{ only: ['cloudflare'] }`（Cloudflare 経由）
- リクエストに `HTTP-Referer: <origin>` と `X-OpenRouter-Title: X DM Translator` を付与、OpenRouter のアトリビューション要件に準拠

## 既知の制限

- `unsafeWindow` を宣言しているが用途は `unsafeWindow.OPENROUTER_API_KEY` の参照のみ。ホストページが明示的にグローバルを公開している場合のみヒットし、そうでなければ `GM_getValue` にフォールバック。
- すべてのリクエストは `GM_xmlhttpRequest` 経由、`event.isTrusted` に依存しない。
- タイムラインではボタンとキャッシュのみ表示、API は呼ばれない。翻訳するにはクリックが必要。
- 引用 / リプライで入れ子になった投稿は、それぞれの `/status/<id>` をキャッシュキーに使い、階層ごとに独立キャッシュ。

## バージョン

- v0.3.0：投稿 / コメントの翻訳を自動から手動に変更。
- v0.2.x 以前：投稿は詳細ページかつ `autoTranslate=true` のときのみ自動翻訳。