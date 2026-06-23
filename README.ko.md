[简体中文](README.zh-CN.md) · [English](README.md) · [日本語](README.ja.md) · **[한국어](README.ko.md)**

---

# x-dm-translate

X (Twitter)용 Tampermonkey 사용자 스크립트: DM 및 트윗 번역 + 일본어 답장 초안 생성. 백엔드는 OpenRouter.

- **다이렉트 메시지 (DM)**: 대상 대화에 들어가면 수신한 일본어 메시지를 자동 번역. 「译」 패널에서 중국어 초안을 수동으로 일본어 후보 3개로 번역 가능.
- **트윗 / 댓글**: 모든 `article[data-testid="tweet"]` 하단에 「译」 버튼이 표시됩니다. **수동 클릭**으로 번역이 트리거되며 자동 번역은 제거되었습니다.
- **캐시**: 번역 결과는 `(model, profile, statusId/messageId, hash)` 키로 `GM_setValue`에 저장되어 재방문 시 즉시 표시됩니다.

## 설치

1. [Tampermonkey](https://www.tampermonkey.net/) (또는 Violentmonkey) 설치.
2. `dist/x-dm-openrouter-translate.user.js`를 브라우저로 드래그해 설치. 루트 디렉터리의 동일 이름 사본도 사용 가능 (`AGENTS.md` 컨벤션).
3. https://x.com/ 을 열고 Tampermonkey 메뉴에서 「翻译设置」 선택.
4. **OpenRouter API key** 입력 (필수), 감시할 X ID 추가 (쉼표 구분, 또는 `*`로 전체).

> API key는 브라우저 로컬 `GM_setValue`에만 저장되며 외부 서버로 전송되지 않습니다. 소스와 빌드 산출물에 하드코드된 key는 0건 — `grep "sk-"` 보안 감사에서 `src/` 및 `dist/` 모두 0 히트.

## 매치 범위

```js
match: [
  'https://x.com/i/chat*',
  'https://twitter.com/i/chat*',
  'https://x.com/*/status/*',
  'https://twitter.com/*/status/*',
]
```

타임라인 / 검색 페이지는 `match`에 포함되지 않지만 스크립트가 `article[data-testid="tweet"]` 셀렉터로 스캔하므로 「译」 버튼이 표시됩니다. 타임라인에서 완전히 숨기려면 `tick()`의 `scanTweetArticles()` 호출을 제거하세요.

## 개발

```bash
npm install
npm run dev      # vite + vite-plugin-monkey, HMR
npm run build    # dist/x-dm-openrouter-translate.user.js 출력
npm run preview
```

빌드 후 `dist/x-dm-openrouter-translate.user.js`를 리포 루트에 수동으로 복사 (`AGENTS.md` 컨벤션).

## 디렉터리 구조

```
src/
  app.ts        메인 로직: 스캔, 렌더링, 번역 큐, 설정 패널, 답장 패널, 캐시 패널
  main.ts       엔트리, start() 호출만
  constants.ts  SCRIPT_ID, 모델, URL, GM 키 이름 등
  prompts.ts    LLM 프롬프트 4종 (DM 번역 / 답장 번역 / 대화 제안 / 프로필 요약)
  schemas.ts    OpenRouter json_schema 응답 제약
  state.ts      공유 가변 상태 (translating 셋, profile 큐 등)
  styles.ts     페이지에 주입하는 CSS
```

`vite.config.ts`의 `userscript.grant`에 필요한 `GM_*` 권한 나열: `GM_xmlhttpRequest`, `GM_getValue` / `GM_setValue` / `GM_deleteValue` / `GM_listValues`, `GM_registerMenuCommand`, `unsafeWindow`, 추가로 `@connect openrouter.ai`.

## 동작

### 트윗 / 댓글 (v0.3부터)

- **자동 번역 제거**. 모든 트윗에 「译」 행과 버튼이 삽입되며, **버튼을 눌러야만 번역이 트리거됩니다**.
- 버튼 클릭 시 일본어가 아니면 슬롯에 `未检测到日语内容，跳过翻译` 표시 (무음 실패 방지).
- 이미 번역된 트윗은 캐시에서 즉시 표시되어 재클릭 불필요.
- DM 자동 번역 로직은 그대로이며 `autoTranslate` 설정으로 제어됩니다.

### 다이렉트 메시지 (DM)

- `targetXIds`에 매치된 대화만 스캔. 일본어가 포함된 수신 메시지는 자동 큐 진입.
- 큐 상한은 `maxConcurrentTranslations` (기본 6), 초과분은 대기.
- 수신 메시지가 10건 누적될 때마다 상대 「프로필 요약」을 갱신해 이후 번역의 컨텍스트로 투입.

### 답장 초안 (DM 및 트윗 상세 페이지)

- DM 번역 패널: 중국어 작성 → 번역 클릭 → 일본어 후보 3개 + 중국어 해설 → 후보 클릭 시 입력란에 채워넣기.
- 트윗 상세 페이지 「🤔」 버튼: 메인 트윗을 기반으로 중국어 답안 3개 생성, 동일하게 클릭으로 채워넣기.

## 캐시

- 키는 `(model, profileId, messageId/statusId, textHash)`.
- 상한 `cacheLimit` (기본 800), 초과 시 LRU로 축출.
- 설정 패널에 「查看缓存」, 「清空缓存」 액션 있음.

## 설정 항목

| key | 기본값 | 설명 |
|---|---|---|
| `openRouterApiKey` | `''` | OpenRouter key, 필수 |
| `targetXIds` | `[]` | 감시할 X ID 목록, `*`는 전체 |
| `userProfile` / `myProfile` | `''` | 본인 프로필 (성별, 호칭, 관계), 번역 인칭에 영향 |
| `partnerProfile` | `''` | 기본 상대 프로필 fallback |
| `autoTranslate` | `true` | DM 자동 번역 토글 (트윗에는 영향 없음) |
| `maxMessagesPerScan` | `30` | 스캔 1회당 처리할 최대 메시지 수 |
| `maxConcurrentTranslations` | `6` | 동시 번역 수 |
| `cacheLimit` | `800` | 캐시 항목 상한 |
| `taskLogLimit` | `200` | 작업 로그 항목 수 |

각 프롬프트도 설정 패널에서 개별 편집 / 기본값 복원 가능.

## 모델 / 백엔드

- 모델: `deepseek/deepseek-v4-flash` (`src/constants.ts`)
- URL: `https://openrouter.ai/api/v1/chat/completions`
- Provider 제한: `{ only: ['cloudflare'] }` (Cloudflare 경로)
- 요청에 `HTTP-Referer: <origin>` 및 `X-OpenRouter-Title: X DM Translator` 포함, OpenRouter 어트리뷰션 요구사항 충족

## 알려진 제약

- `unsafeWindow` 선언되어 있으나 사용처는 `unsafeWindow.OPENROUTER_API_KEY` 참조뿐. 호스트 페이지가 명시적으로 글로벌을 노출하는 경우에만 적중, 아니면 `GM_getValue`로 폴백.
- 모든 요청은 `GM_xmlhttpRequest`로 발신, `event.isTrusted`에 의존하지 않음.
- 타임라인에는 버튼과 캐시만 표시, API는 호출되지 않음. 번역하려면 클릭 필요.
- 인용 / 답글로 중첩된 트윗은 각 글의 `/status/<id>`를 캐시 키로 사용, 계층별로 독립 캐시.

## 버전

- v0.3.0: 트윗 / 댓글 번역을 자동에서 수동으로 전환.
- v0.2.x 및 이전: 트윗은 상세 페이지 + `autoTranslate=true` 일 때만 자동 번역.