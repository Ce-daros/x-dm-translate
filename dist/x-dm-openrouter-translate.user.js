// ==UserScript==
// @name         X DM OpenRouter Translator
// @namespace    https://github.com/ame/x-chat-translate
// @version      0.3.1
// @description  Translate selected X DMs and tweet comments to Chinese and draft Japanese replies.
// @match        https://x.com/i/chat*
// @match        https://twitter.com/i/chat*
// @match        https://x.com/*/status/*
// @match        https://twitter.com/*/status/*
// @connect      openrouter.ai
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function() {
	"use strict";
	var MODEL = "deepseek/deepseek-v4-flash";
	var OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
	var MAX_COMPLETION_TOKENS = 8192;
	var CACHE_INDEX_KEY = "translationCacheIndex:v2";
	var PARTNER_SUMMARIES_KEY = "partnerProfileSummaries:v1";
	var PARTNER_SUMMARY_SEEN_KEY = "partnerProfileSummarySeen:v1";
	var PARTNER_PROFILE_BATCHES_KEY = "partnerProfileBatches:v1";
	var CONVERSATION_SUGGESTIONS_KEY = "conversationSuggestions:v1";
	var TWEET_SUGGESTIONS_KEY = "tweetReplySuggestions:v1";
	var TASK_LOGS_KEY = "taskLogs:v1";
	var PROMPT_OVERRIDES_KEY = "promptOverrides:v1";
	var PARTNER_PROFILES_KEY = "partnerProfiles:v1";
	var DEFAULT_PROMPTS = {
		incomingTranslation: "你负责翻译 X 私信。根据双方资料、长期画像、主题状态和最近 10 条双方消息，把目标日语消息翻译成自然的简体中文。双方资料优先级高于上下文推断，用它判断人称、性别、称呼、关系和代词。严格只翻译目标消息，不解释、不总结、不补充事实、不替说话者圆场，不把上下文里没有的意思写进译文。保留原文换行、表情、暧昧程度和语气。只按 schema 返回 JSON。",
		replyTranslation: "你负责把中文私信翻译成日语。结合双方资料、长期画像、主题状态和最近 10 条双方消息，返回三个自然可直接发送的日语候选。双方资料优先级高于上下文推断，用它决定人称、性别、称呼、关系、代词和自称。严格忠实中文草稿的意思，不添加新信息、不删改关键含义、不擅自道歉或解释；只允许为了日语自然度和候选风格做轻微语气调整。不要使用固定风格模板；由你自行选择三个适合当前关系和语境的风格名。每个候选包含风格名、中文简短解释和日语正文。只按 schema 返回 JSON。",
		conversationSuggestions: "你是 X 私信对话建议助手。messages 中每条消息都标注了说话者：【我】代表当前用户，【对方】代表聊天对象。请严格基于双方资料、长期画像、主题状态、最近 10 条双方消息和最近一条消息，给出三个当前用户（我）可继续对话的中文草稿。注意区分消息来源，不要把我的话当成对方的话。三个建议应代表不同对话意图，不是固定语气模板。严格基于原对话，不制造不存在的事实、邀约、承诺或情绪。每条包含短标签、中文说明和中文草稿。只按 schema 返回 JSON。",
		partnerSummary: "你维护 X 私信对方的长期画像摘要。画像只在累计 10 条新的对方消息后更新。根据旧画像、这 10 条新的对方消息、最近 10 条双方上下文和最新消息更新画像；若没有旧画像，就从这些材料中新建画像。只记录对理解翻译、人称、称呼、关系、兴趣、偏好、语气有用的信息。不要编造；不确定就不要写。摘要用简体中文，短而密，保留稳定事实和高置信倾向。只按 schema 返回 JSON。",
		tweetTranslation: "你负责翻译 X 帖子或评论。根据帖子作者资料（如有），把目标日语内容翻译成自然的简体中文。严格只翻译目标内容，不解释、不总结、不补充事实、不替说话者圆场，不把上下文里没有的意思写进译文。保留原文换行、表情、暧昧程度和语气。只按 schema 返回 JSON。",
		tweetReplySuggestions: "你是 X 帖子回复建议助手。请基于帖子原文、帖子作者资料（如有）和我的资料（如有），给出三个适合当前用户回复该帖子的中文草稿。三个建议应代表不同回复意图，不是固定语气模板。严格基于原帖，不制造不存在的事实、邀约、承诺或情绪。每条包含短标签、中文说明和中文草稿。只按 schema 返回 JSON。"
	};
	function jsonSchemaFormat(name, schema) {
		return {
			type: "json_schema",
			json_schema: {
				name,
				strict: true,
				schema
			}
		};
	}
	var INCOMING_TRANSLATION_FORMAT = jsonSchemaFormat("dm_translation", {
		type: "object",
		properties: { translation: {
			type: "string",
			description: "Natural Simplified Chinese translation."
		} },
		required: ["translation"],
		additionalProperties: false
	});
	var REPLY_OPTIONS_FORMAT = jsonSchemaFormat("dm_reply_options", {
		type: "object",
		properties: { options: {
			type: "array",
			minItems: 3,
			maxItems: 3,
			items: {
				type: "object",
				properties: {
					label: {
						type: "string",
						description: "Short style name."
					},
					note: {
						type: "string",
						description: "Brief Chinese explanation of the tone."
					},
					text: {
						type: "string",
						description: "Japanese DM candidate."
					}
				},
				required: [
					"label",
					"note",
					"text"
				],
				additionalProperties: false
			}
		} },
		required: ["options"],
		additionalProperties: false
	});
	var PARTNER_SUMMARY_FORMAT = jsonSchemaFormat("partner_profile_summary", {
		type: "object",
		properties: { summary: {
			type: "string",
			description: "Updated concise Chinese profile summary for the DM partner."
		} },
		required: ["summary"],
		additionalProperties: false
	});
	var CONVERSATION_SUGGESTIONS_FORMAT = jsonSchemaFormat("conversation_suggestions", {
		type: "object",
		properties: { suggestions: {
			type: "array",
			minItems: 3,
			maxItems: 3,
			items: {
				type: "object",
				properties: {
					label: { type: "string" },
					note: { type: "string" },
					draft: { type: "string" }
				},
				required: [
					"label",
					"note",
					"draft"
				],
				additionalProperties: false
			}
		} },
		required: ["suggestions"],
		additionalProperties: false
	});
	var state = {
		seenConversationId: "",
		seenPathname: "",
		lastSeenLatestMessageKey: "",
		translating: new Set(),
		pending: new Map(),
		activeTranslations: 0,
		profileUpdating: new Set(),
		profilePending: new Map(),
		suggestionUpdating: new Set(),
		profileRetryAt: new Map(),
		suggestionRetryAt: new Map(),
		activeTasks: 0,
		totalTasks: 0,
		finishedTasks: 0,
		scannedMessageKeys: new Set(),
		scannedTweetKeys: new Set()
	};
	function injectStyles() {
		if (document.getElementById(`xct-style`)) return;
		const style = document.createElement("style");
		style.id = `xct-style`;
		style.textContent = `

    [class^="xct-"],
    [id^="xct-"] {
      font-family: 'TwitterChirp', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-feature-settings: "ss01" on;
    }

    :root {
      --xct-bg: #ffffff;
      --xct-surface: #ffffff;
      --xct-surface-hover: #eff3f4;
      --xct-surface-active: #1d9bf0;
      --xct-text: #0f1419;
      --xct-text-secondary: #536471;
      --xct-text-tertiary: #829aab;
      --xct-border: #cfd9de;
      --xct-border-light: #eff3f4;
      --xct-accent: #1d9bf0;
      --xct-accent-hover: #1a8cd8;
      --xct-on-accent: #ffffff;
      --xct-error: #0f1419;
      --xct-shadow: rgba(101, 119, 134, 0.2) 0px 0px 8px 0px, rgba(101, 119, 134, 0.25) 0px 1px 3px 1px;
    }

    [data-theme="dark"] {
      --xct-bg: #000000;
      --xct-surface: #16181c;
      --xct-surface-hover: #1d1f23;
      --xct-surface-active: #1d9bf0;
      --xct-text: #e7e9ea;
      --xct-text-secondary: #71767b;
      --xct-text-tertiary: #71767b;
      --xct-border: #2f3336;
      --xct-border-light: #202327;
      --xct-accent: #1d9bf0;
      --xct-accent-hover: #1a8cd8;
      --xct-on-accent: #ffffff;
      --xct-error: #e7e9ea;
      --xct-shadow: rgba(91, 112, 131, 0.25) 0px 0px 8px 0px, rgba(91, 112, 131, 0.3) 0px 1px 3px 1px;
    }

    [data-theme="dim"] {
      --xct-bg: #15202b;
      --xct-surface: #192734;
      --xct-surface-hover: #22303c;
      --xct-surface-active: #1d9bf0;
      --xct-text: #e7e9ea;
      --xct-text-secondary: #8899a6;
      --xct-text-tertiary: #8899a6;
      --xct-border: #38444d;
      --xct-border-light: #253341;
      --xct-accent: #1d9bf0;
      --xct-accent-hover: #1a8cd8;
      --xct-on-accent: #ffffff;
      --xct-error: #e7e9ea;
      --xct-shadow: rgba(91, 112, 131, 0.25) 0px 0px 8px 0px, rgba(91, 112, 131, 0.3) 0px 1px 3px 1px;
    }

    @keyframes xct-fade-in-up {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes xct-shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-3px); }
      40%, 80% { transform: translateX(3px); }
    }

    .xct-translation-row {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      width: 100%;
      padding: 4px 16px 8px;
      pointer-events: none;
      animation: xct-fade-in-up 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .xct-translation-row.is-incoming {
      align-items: flex-start;
    }

    .xct-translation-row.is-outgoing {
      align-items: flex-end;
    }

    .xct-translation {
      max-width: min(70%, 520px);
      color: var(--xct-text-secondary);
      font-size: 13px;
      line-height: 1.33;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .xct-error {
      color: var(--xct-text) !important;
      font-weight: 500;
      animation: xct-shake 320ms ease-in-out;
    }

    #xct-progress {
      position: absolute;
      top: 0;
      left: 18px;
      right: 18px;
      z-index: 1;
      height: 2px;
      overflow: hidden;
      border-radius: 9999px;
      background: transparent;
      pointer-events: none;
    }

    [data-testid="dm-composer-form"] {
      position: relative;
    }

    #xct-progress span {
      display: block;
      width: 0;
      height: 100%;
      border-radius: inherit;
      background: var(--xct-accent);
      opacity: 0;
      transition: width 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
    }

    #xct-progress.is-active span {
      opacity: 1;
    }

    #xct-suggestions {
      position: fixed;
      top: auto;
      right: auto;
      bottom: auto;
      z-index: 2147483646;
      display: grid;
      grid-template-columns: auto repeat(3, minmax(0, 1fr));
      gap: 8px;
      box-sizing: border-box;
      padding: 8px 2px;
      opacity: 0;
      transform: translateY(4px) scale(0.98);
      pointer-events: none;
      transition: left 240ms cubic-bezier(0.16, 1, 0.3, 1),
                  top 240ms cubic-bezier(0.16, 1, 0.3, 1),
                  width 240ms cubic-bezier(0.16, 1, 0.3, 1),
                  bottom 240ms cubic-bezier(0.16, 1, 0.3, 1),
                  max-height 240ms cubic-bezier(0.16, 1, 0.3, 1),
                  opacity 180ms ease,
                  transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    #xct-suggestions:not(:empty) {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    #xct-suggestions.is-right {
      grid-template-columns: 1fr;
      align-content: start;
      gap: 8px;
      padding: 12px;
      border-left: 1px solid var(--xct-border);
      border-radius: 0;
      background: var(--xct-surface);
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .xct-suggestion-refresh {
      min-width: 44px;
      min-height: 44px;
      margin: 4px 0;
      padding: 0;
      border: 1px solid var(--xct-border);
      border-radius: 9999px;
      background: var(--xct-surface);
      color: var(--xct-text-secondary);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
    }

    #xct-suggestions.is-right .xct-suggestion-refresh {
      grid-row: auto;
      margin: 0 0 4px;
    }

    .xct-suggestion-refresh:hover {
      background: var(--xct-surface-hover);
      border-color: var(--xct-accent);
      color: var(--xct-accent);
    }

    .xct-suggestion {
      min-width: 0;
      min-height: 44px;
      margin: 4px 0;
      padding: 8px 12px;
      border: 1px solid var(--xct-border);
      border-radius: 12px;
      background: var(--xct-surface);
      color: var(--xct-text);
      cursor: pointer;
      text-align: left;
      font-size: 13px;
      line-height: 1.33;
      transition: background-color 150ms ease, border-color 150ms ease, transform 150ms ease;
    }

    .xct-suggestion:hover {
      background: var(--xct-surface-hover);
      border-color: var(--xct-accent);
    }

    .xct-suggestion strong,
    .xct-suggestion span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .xct-suggestion strong {
      margin-bottom: 4px;
      color: var(--xct-text);
      font-weight: 700;
      font-size: 13px;
    }

    .xct-suggestion span {
      color: var(--xct-text-secondary);
      font-size: 12px;
    }

    #xct-reply-button,
    #xct-suggest-button {
      flex: 0 0 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      align-self: center;
      margin-left: 8px;
      padding: 0;
      border: 0;
      border-radius: 9999px;
      background: var(--xct-accent);
      color: var(--xct-on-accent);
      font-size: 14px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      transition: background-color 150ms ease, transform 150ms ease;
    }

    #xct-reply-button:hover,
    #xct-suggest-button:hover {
      background: var(--xct-accent-hover);
    }

    #xct-toast {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483647;
      max-width: min(320px, calc(100vw - 48px));
      padding: 10px 16px;
      background: rgba(15, 20, 25, 0.94);
      color: #ffffff;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      font-size: 14px;
      line-height: 1.35;
      letter-spacing: 0.01em;
      pointer-events: none;
      opacity: 0;
      transform: translateY(8px) scale(0.98);
      transition: opacity 180ms ease, transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    #xct-toast.is-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    #xct-reply-button-row {
      min-height: 32px;
    }

    #xct-reply-panel {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      width: min(380px, calc(100vw - 24px));
      max-height: min(640px, calc(100vh - 24px));
      padding: 16px;
      border: 1px solid var(--xct-border);
      border-radius: 16px;
      overflow: hidden;
      background: var(--xct-surface);
      box-shadow: var(--xct-shadow);
      color: var(--xct-text);
      font-size: 15px;
      line-height: 1.33;
      opacity: 0;
      visibility: hidden;
      transform: scale(0.98);
      transform-origin: bottom center;
      transition: opacity 200ms ease,
                  transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
                  visibility 200ms ease;
    }

    #xct-reply-panel.is-open {
      opacity: 1;
      visibility: visible;
      transform: scale(1);
    }

    .xct-reply-input {
      flex: 0 0 auto;
      box-sizing: border-box;
      width: 100%;
      min-height: 76px;
      max-height: 140px;
      padding: 10px 12px;
      border: 1px solid var(--xct-border);
      border-radius: 4px;
      resize: vertical;
      outline: none;
      background: var(--xct-surface);
      color: var(--xct-text);
      font: inherit;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }

    .xct-reply-input:focus {
      border-color: var(--xct-accent);
      box-shadow: rgba(0, 0, 0, 0.03) 0px 0px 2px 0px inset;
    }

    .xct-reply-actions {
      flex: 0 0 auto;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    .xct-reply-actions button,
    .xct-tone {
      min-height: 36px;
      padding: 6px 16px;
      border: 1px solid var(--xct-border);
      border-radius: 9999px;
      background: var(--xct-surface);
      color: var(--xct-text);
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
    }

    .xct-reply-actions button:hover,
    .xct-tone:hover {
      background: var(--xct-surface-hover);
    }

    .xct-reply-submit {
      border-color: var(--xct-accent) !important;
      background: var(--xct-accent) !important;
      color: var(--xct-on-accent) !important;
      font-weight: 700 !important;
    }

    .xct-reply-submit:hover {
      background: var(--xct-accent-hover) !important;
      border-color: var(--xct-accent-hover) !important;
    }

    .xct-reply-status {
      flex: 0 0 auto;
      min-height: 20px;
      margin-top: 8px;
      color: var(--xct-text-secondary);
      font-size: 13px;
      line-height: 1.33;
      transition: color 150ms ease;
    }

    .xct-reply-status.xct-error {
      color: var(--xct-text);
      font-weight: 500;
      animation: xct-shake 320ms ease-in-out;
    }

    .xct-tone-list {
      flex: 1 1 auto;
      display: grid;
      align-content: start;
      gap: 8px;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;
      margin-top: 12px;
    }

    .xct-tone {
      display: grid;
      gap: 4px;
      width: 100%;
      padding: 10px 12px;
      text-align: left;
      border-radius: 12px;
    }

    .xct-tone span,
    .xct-tone em {
      color: var(--xct-text-secondary);
      font-size: 12px;
      line-height: 1.22;
      font-style: normal;
    }

    .xct-tone strong {
      color: var(--xct-text);
      font-weight: 500;
      white-space: pre-wrap;
      font-size: 15px;
      line-height: 1.33;
    }

    .xct-modal {
      position: fixed;
      top: 72px;
      left: 50%;
      z-index: 2147483647;
      display: block;
      box-sizing: border-box;
      width: min(520px, calc(100vw - 32px));
      max-height: calc(100vh - 112px);
      padding: 16px;
      border: 1px solid var(--xct-border);
      border-radius: 16px;
      overflow: auto;
      transform: translateX(-50%) scale(0.98);
      background: var(--xct-surface);
      box-shadow: var(--xct-shadow);
      color: var(--xct-text);
      font-size: 15px;
      line-height: 1.33;
      opacity: 0;
      visibility: hidden;
      transition: opacity 200ms ease,
                  transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
                  visibility 200ms ease;
    }

    .xct-modal.is-open {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) scale(1);
    }

    .xct-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .xct-modal-head strong {
      font-size: 20px;
      font-weight: 800;
      line-height: 1.2;
      color: var(--xct-text);
    }

    .xct-modal-head button,
    .xct-section-head button {
      min-height: 32px;
      padding: 0 14px;
      border: 1px solid var(--xct-border);
      border-radius: 9999px;
      background: var(--xct-surface);
      color: var(--xct-text);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: background-color 150ms ease, border-color 150ms ease;
    }

    .xct-modal-head button:hover,
    .xct-section-head button:hover {
      background: var(--xct-surface-hover);
    }

    .xct-settings-section {
      display: grid;
      gap: 12px;
      padding: 16px 0;
      border-top: 1px solid var(--xct-border-light);
    }

    .xct-settings-section:first-of-type {
      border-top: 0;
      padding-top: 0;
    }

    .xct-settings-section h3 {
      margin: 0;
      color: var(--xct-text);
      font-size: 15px;
      font-weight: 700;
      line-height: 1.2;
    }

    .xct-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .xct-target-section {
      display: grid;
      gap: 8px;
    }

    .xct-target-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 0;
    }

    .xct-target-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 4px 4px 10px;
      border: 1px solid var(--xct-border);
      border-radius: 9999px;
      background: var(--xct-surface);
      color: var(--xct-text);
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
    }

    .xct-target-chip code {
      font-family: inherit;
      font-size: 13px;
    }

    .xct-target-chip button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 9999px;
      background: transparent;
      color: var(--xct-text-secondary);
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      transition: background-color 150ms ease, color 150ms ease;
    }

    .xct-target-chip button:hover {
      background: var(--xct-surface-hover);
      color: var(--xct-text);
    }

    .xct-target-add {
      display: flex;
      gap: 8px;
    }

    .xct-target-add input {
      flex: 1 1 auto;
      min-width: 0;
      height: 36px;
      padding: 0 12px;
      border: 1px solid var(--xct-border);
      border-radius: 9999px;
      background: var(--xct-surface);
      color: var(--xct-text);
      font-size: 14px;
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }

    .xct-target-add input:focus {
      border-color: var(--xct-accent);
    }

    .xct-target-add button {
      flex: 0 0 auto;
      height: 36px;
      padding: 0 14px;
      border: 1px solid var(--xct-border);
      border-radius: 9999px;
      background: var(--xct-surface);
      color: var(--xct-text);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: background-color 150ms ease, border-color 150ms ease;
    }

    .xct-target-add button:hover {
      background: var(--xct-surface-hover);
    }

    .xct-target-profiles {
      display: grid;
      gap: 12px;
    }

    .xct-modal label {
      display: grid;
      gap: 6px;
      margin: 0;
      color: var(--xct-text-secondary);
      font-size: 13px;
      line-height: 1.22;
    }

    .xct-setting-state {
      justify-self: start;
      color: var(--xct-text-tertiary);
      font-size: 12px;
      line-height: 1;
    }

    .xct-setting-state.is-dirty {
      color: var(--xct-accent);
    }

    .xct-modal input,
    .xct-modal textarea {
      box-sizing: border-box;
      width: 100%;
      padding: 0 12px;
      border: 1px solid var(--xct-border);
      border-radius: 4px;
      outline: none;
      background: var(--xct-surface);
      color: var(--xct-text);
      font-size: 15px;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }

    .xct-modal input {
      height: 40px;
    }

    .xct-modal textarea {
      min-height: 88px;
      max-height: 180px;
      padding-top: 10px;
      padding-bottom: 10px;
      resize: vertical;
      line-height: 1.45;
    }

    .xct-modal input:focus,
    .xct-modal textarea:focus {
      border-color: var(--xct-accent);
      box-shadow: rgba(0, 0, 0, 0.03) 0px 0px 2px 0px inset;
    }

    .xct-check {
      display: flex !important;
      grid-template-columns: none !important;
      align-items: center;
      gap: 8px !important;
      color: var(--xct-text) !important;
      font-size: 15px;
    }

    .xct-check input {
      width: 18px;
      height: 18px;
      accent-color: var(--xct-accent);
    }

    .xct-check-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
    }

    .xct-settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .xct-prompt-list,
    .xct-task-log {
      display: grid;
      gap: 8px;
    }

    .xct-task-log {
      max-height: 240px;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 4px;
    }

    .xct-prompt-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      padding: 8px 12px;
      border: 1px solid var(--xct-border-light);
      border-radius: 12px;
      background: var(--xct-surface);
      transition: background-color 150ms ease;
    }

    .xct-prompt-row:hover {
      background: var(--xct-surface-hover);
    }

    .xct-prompt-row strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
      font-size: 15px;
      color: var(--xct-text);
    }

    .xct-prompt-row button {
      min-height: 32px;
      padding: 0 14px;
      border: 1px solid var(--xct-border);
      border-radius: 9999px;
      background: var(--xct-surface);
      color: var(--xct-text);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: background-color 150ms ease, border-color 150ms ease;
    }

    .xct-prompt-row button:hover {
      background: var(--xct-surface-hover);
    }

    .xct-prompt-state {
      color: var(--xct-text-tertiary);
      font-size: 12px;
    }

    .xct-prompt-state.is-dirty {
      color: var(--xct-accent);
    }

    .xct-prompt-editor {
      width: min(760px, calc(100vw - 32px));
    }

    .xct-prompt-editor textarea {
      min-height: 280px;
      max-height: calc(100vh - 260px);
    }

    .xct-log-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 6px 8px;
      align-items: center;
      padding: 8px 12px;
      border: 1px solid var(--xct-border-light);
      border-radius: 12px;
      background: var(--xct-surface);
      transition: background-color 150ms ease;
    }

    .xct-log-row:hover {
      background: var(--xct-surface-hover);
    }

    .xct-log-row span,
    .xct-log-row em,
    .xct-log-row p {
      color: var(--xct-text-tertiary);
      font-size: 12px;
      line-height: 1.22;
      font-style: normal;
    }

    .xct-log-row strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 500;
      color: var(--xct-text);
    }

    .xct-log-row p {
      grid-column: 1 / -1;
      margin: 0;
      overflow-wrap: anywhere;
    }

    .xct-log-row.is-error em,
    .xct-log-row.is-error p {
      color: var(--xct-text);
      font-weight: 500;
    }

    .xct-settings-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }

    .xct-modal button {
      min-height: 36px;
      padding: 0 16px;
      border: 1px solid var(--xct-border);
      border-radius: 9999px;
      background: var(--xct-surface);
      color: var(--xct-text);
      cursor: pointer;
      font-size: 15px;
      font-weight: 700;
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
    }

    .xct-modal button:hover {
      background: var(--xct-surface-hover);
    }

    .xct-primary {
      border-color: var(--xct-accent) !important;
      background: var(--xct-accent) !important;
      color: var(--xct-on-accent) !important;
    }

    .xct-primary:hover {
      background: var(--xct-accent-hover) !important;
      border-color: var(--xct-accent-hover) !important;
    }

    .xct-settings-status,
    .xct-cache-count {
      min-height: 20px;
      margin-top: 12px;
      color: var(--xct-text-secondary);
      font-size: 13px;
      line-height: 1.33;
    }

    .xct-current-summary {
      box-sizing: border-box;
      max-height: 140px;
      padding: 12px;
      border: 1px solid var(--xct-border-light);
      border-radius: 12px;
      overflow: auto;
      background: var(--xct-surface);
      color: var(--xct-text);
      font-size: 14px;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    .xct-cache-modal {
      width: min(720px, calc(100vw - 32px));
    }

    .xct-cache-list {
      display: grid;
      gap: 12px;
      margin-top: 12px;
    }

    .xct-cache-search {
      box-sizing: border-box;
      width: 100%;
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--xct-border);
      border-radius: 4px;
      outline: none;
      background: var(--xct-surface);
      color: var(--xct-text);
      font-size: 15px;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }

    .xct-cache-search:focus {
      border-color: var(--xct-accent);
      box-shadow: rgba(0, 0, 0, 0.03) 0px 0px 2px 0px inset;
    }

    .xct-cache-item {
      display: grid;
      gap: 6px;
      padding: 12px;
      border: 1px solid var(--xct-border-light);
      border-radius: 12px;
      background: var(--xct-surface);
      transition: background-color 150ms ease;
    }

    .xct-cache-item:hover {
      background: var(--xct-surface-hover);
    }

    .xct-cache-item span {
      color: var(--xct-text-tertiary);
      font-size: 12px;
      line-height: 1.22;
    }

    .xct-cache-item p,
    .xct-cache-item strong {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 15px;
      line-height: 1.33;
    }

    .xct-cache-item p {
      color: var(--xct-text-secondary);
    }

    .xct-cache-item strong {
      color: var(--xct-text);
      font-weight: 500;
    }

    @media (max-width: 720px) {
      #xct-suggestions:not(.is-right) {
        grid-template-columns: auto 1fr;
      }

      #xct-suggestions:not(.is-right) .xct-suggestion-refresh {
        grid-row: 1 / -1;
      }

      .xct-settings-grid,
      .xct-check-grid {
        grid-template-columns: 1fr;
      }

      .xct-prompt-row {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .xct-prompt-row button {
        width: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .xct-translation-row,
      #xct-progress span,
      #xct-suggestions,
      .xct-suggestion,
      #xct-reply-button,
      #xct-suggest-button,
      #xct-reply-panel,
      .xct-reply-input,
      .xct-reply-actions button,
      .xct-tone,
      .xct-modal,
      .xct-modal-head button,
      .xct-section-head button,
      .xct-modal input,
      .xct-modal textarea,
      .xct-prompt-row,
      .xct-prompt-row button,
      .xct-log-row,
      .xct-modal button,
      .xct-primary,
      .xct-cache-search,
      .xct-cache-item,
      .xct-tweet-translation-row,
      .xct-tweet-translate-btn {
        transition: none !important;
        animation: none !important;
      }
    }



    .xct-tweet-translation-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 4px;
      padding: 4px 0 8px;
      animation: xct-fade-in-up 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .xct-tweet-translation {
      flex: 1 1 auto;
      color: var(--xct-text-secondary);
      font-size: 14px;
      line-height: 1.4;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .xct-tweet-translate-btn {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 1px solid var(--xct-border);
      border-radius: 9999px;
      background: var(--xct-surface);
      color: var(--xct-text-secondary);
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
    }

    .xct-tweet-translate-btn:hover {
      background: var(--xct-surface-hover);
      border-color: var(--xct-accent);
      color: var(--xct-accent);
    }

    #xct-progress {
      position: absolute;
    }

    [data-testid="dm-composer-form"],
    .xct-tweet-composer {
      position: relative;
    }
  `;
		document.head.appendChild(style);
	}
	var DEFAULT_SETTINGS = {
		targetXIds: [],
		openRouterApiKey: "",
		userProfile: "",
		myProfile: "",
		partnerProfile: "",
		autoTranslate: true,
		maxMessagesPerScan: 30,
		maxConcurrentTranslations: 6,
		cacheLimit: 800,
		taskLogLimit: 200
	};
	function loadSettings() {
		const saved = GM_getValue("settings", {});
		const settings = {
			...DEFAULT_SETTINGS,
			...saved
		};
		settings.targetXIds = Array.isArray(settings.targetXIds) ? settings.targetXIds : [];
		settings.userProfile = String(settings.userProfile || "").trim();
		settings.myProfile = String(settings.myProfile || settings.userProfile || "").trim();
		settings.partnerProfile = String(settings.partnerProfile || "").trim();
		settings.maxMessagesPerScan = clampNumber(settings.maxMessagesPerScan, 5, 80);
		settings.maxConcurrentTranslations = clampNumber(settings.maxConcurrentTranslations, 1, 6);
		settings.cacheLimit = clampNumber(settings.cacheLimit, 50, 3e3);
		settings.taskLogLimit = clampNumber(settings.taskLogLimit, 20, 1e3);
		return settings;
	}
	function saveSettings(nextSettings) {
		GM_setValue("settings", {
			...loadSettings(),
			...nextSettings
		});
	}
	function clampNumber(value, min, max) {
		const number = Number(value);
		if (!Number.isFinite(number)) return min;
		return Math.min(max, Math.max(min, Math.round(number)));
	}
	function getCacheIndex() {
		const index = GM_getValue(CACHE_INDEX_KEY, []);
		return Array.isArray(index) ? index : [];
	}
	function saveCacheIndex(index) {
		const limit = loadSettings().cacheLimit;
		const trimmed = index.filter((entry) => entry?.key).sort((left, right) => right.createdAt - left.createdAt).slice(0, limit);
		const kept = new Set(trimmed.map((entry) => entry.key));
		for (const entry of index) if (entry?.key && !kept.has(entry.key)) GM_deleteValue(entry.key);
		GM_setValue(CACHE_INDEX_KEY, trimmed);
		return trimmed;
	}
	function getCachedTranslation(cacheKey) {
		const cached = GM_getValue(cacheKey, null);
		return cached && typeof cached.translation === "string" ? cached : null;
	}
	function setCachedTranslation(cacheKey, record) {
		GM_setValue(cacheKey, record);
		const index = getCacheIndex().filter((entry) => entry.key !== cacheKey);
		saveCacheIndex([{
			...record,
			key: cacheKey
		}, ...index]);
	}
	function clearTranslationCache() {
		for (const entry of getCacheIndex()) GM_deleteValue(entry.key);
		for (const key of GM_listValues()) if (key.startsWith("translation:")) GM_deleteValue(key);
		GM_setValue(CACHE_INDEX_KEY, []);
	}
	function getPromptOverrides() {
		const overrides = GM_getValue(PROMPT_OVERRIDES_KEY, {});
		return overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {};
	}
	function savePromptOverrides(overrides) {
		GM_setValue(PROMPT_OVERRIDES_KEY, overrides);
	}
	function getPrompt(promptKey) {
		const override = getPromptOverrides()[promptKey];
		return typeof override === "string" && override.trim() ? override.trim() : DEFAULT_PROMPTS[promptKey];
	}
	function isPromptDefault(promptKey) {
		return !Object.prototype.hasOwnProperty.call(getPromptOverrides(), promptKey);
	}
	function restorePromptDefault(promptKey) {
		const overrides = getPromptOverrides();
		delete overrides[promptKey];
		savePromptOverrides(overrides);
		renderPromptRows();
	}
	function restoreAllDefaults() {
		savePromptOverrides({});
		renderPromptRows();
	}
	function getTaskLogs() {
		const logs = GM_getValue(TASK_LOGS_KEY, []);
		return Array.isArray(logs) ? logs : [];
	}
	function saveTaskLogs(logs) {
		GM_setValue(TASK_LOGS_KEY, logs.slice(0, loadSettings().taskLogLimit));
	}
	function pushTaskLog(entry) {
		saveTaskLogs([{
			...entry,
			createdAt: Date.now()
		}, ...getTaskLogs()]);
		renderTaskLog();
	}
	function getConversationSuggestionsStore() {
		const store = GM_getValue(CONVERSATION_SUGGESTIONS_KEY, {});
		return store && typeof store === "object" && !Array.isArray(store) ? store : {};
	}
	function setConversationSuggestions(profileId, record) {
		const store = getConversationSuggestionsStore();
		store[profileId] = record;
		GM_setValue(CONVERSATION_SUGGESTIONS_KEY, store);
	}
	function getPartnerSummaries() {
		const summaries = GM_getValue(PARTNER_SUMMARIES_KEY, {});
		return summaries && typeof summaries === "object" && !Array.isArray(summaries) ? summaries : {};
	}
	function getPartnerSummary(profileId) {
		const record = getPartnerSummaries()[profileId];
		return record && typeof record.summary === "string" ? record : null;
	}
	function setPartnerSummary(profileId, record) {
		const summaries = getPartnerSummaries();
		summaries[profileId] = record;
		GM_setValue(PARTNER_SUMMARIES_KEY, summaries);
	}
	function getPartnerSummarySeen() {
		const seen = GM_getValue(PARTNER_SUMMARY_SEEN_KEY, {});
		return seen && typeof seen === "object" && !Array.isArray(seen) ? seen : {};
	}
	function hasSeenPartnerSummaryMessage(profileId, messageId) {
		const seen = getPartnerSummarySeen();
		return Array.isArray(seen[profileId]) && seen[profileId].includes(messageId);
	}
	function markPartnerSummaryMessageSeen(profileId, messageId) {
		const seen = getPartnerSummarySeen();
		const current = Array.isArray(seen[profileId]) ? seen[profileId] : [];
		seen[profileId] = [...new Set([messageId, ...current])].slice(0, 600);
		GM_setValue(PARTNER_SUMMARY_SEEN_KEY, seen);
	}
	function getPartnerProfileBatches() {
		const batches = GM_getValue(PARTNER_PROFILE_BATCHES_KEY, {});
		return batches && typeof batches === "object" && !Array.isArray(batches) ? batches : {};
	}
	function getPartnerProfileBatch(profileId) {
		const batch = getPartnerProfileBatches()[profileId];
		return Array.isArray(batch) ? batch : [];
	}
	function setPartnerProfileBatch(profileId, batch) {
		const batches = getPartnerProfileBatches();
		batches[profileId] = batch;
		GM_setValue(PARTNER_PROFILE_BATCHES_KEY, batches);
	}
	function appendPartnerProfileBatchMessage(profileId, message) {
		const batch = getPartnerProfileBatch(profileId);
		if (batch.some((item) => item.messageId === message.messageId)) return batch;
		const nextBatch = [...batch, message].slice(-30);
		setPartnerProfileBatch(profileId, nextBatch);
		return nextBatch;
	}
	function getPartnerProfiles() {
		const profiles = GM_getValue(PARTNER_PROFILES_KEY, {});
		return profiles && typeof profiles === "object" && !Array.isArray(profiles) ? profiles : {};
	}
	function getPartnerProfileForId(profileId) {
		const profiles = getPartnerProfiles();
		if (Object.prototype.hasOwnProperty.call(profiles, profileId)) return profiles[profileId];
		return loadSettings().partnerProfile || "";
	}
	function setPartnerProfiles(nextProfiles) {
		GM_setValue(PARTNER_PROFILES_KEY, nextProfiles);
	}
	function schedulePartnerProfileBatch(profileId, latestMessage = null) {
		const batch = getPartnerProfileBatch(profileId);
		if (batch.length < 10 || state.profilePending.has(profileId) || state.profileUpdating.has(profileId)) return;
		if ((state.profileRetryAt.get(profileId) || 0) > Date.now()) return;
		const lastMessage = latestMessage || batch[batch.length - 1];
		state.profilePending.set(profileId, {
			profileId,
			messageId: lastMessage.messageId,
			messages: batch.slice(-10),
			latestMessage: {
				speaker: "them",
				text: lastMessage.text
			},
			existingSummary: getPartnerSummary(profileId)?.summary || "",
			context: buildPromptContext({
				speaker: "them",
				text: lastMessage.text
			}),
			conversationId: getConversationId(),
			conversationName: getConversationName()
		});
		runPartnerSummaryQueue();
	}
	function getApiKey() {
		const settings = loadSettings();
		const windowKey = typeof unsafeWindow !== "undefined" ? unsafeWindow.OPENROUTER_API_KEY : "";
		return settings.openRouterApiKey || windowKey || "";
	}
	function getConversationId() {
		const match = location.pathname.match(/\/i\/chat\/([^/?#]+)/);
		return match ? decodeURIComponent(match[1]) : "";
	}
	function getConversationName() {
		return document.querySelector("[data-testid=\"dm-conversation-username\"]")?.textContent?.trim() || "";
	}
	function normalizeId(value) {
		return String(value || "").trim().replace(/^@/, "").toLowerCase();
	}
	function isTweetDetailPage() {
		return /^\/[^/]+\/status\/\d+/.test(location.pathname);
	}
	function getTweetStatusId() {
		const match = location.pathname.match(/\/status\/(\d+)/);
		return match ? match[1] : "";
	}
	function getArticleStatusId(article) {
		if (!article) return "";
		const link = article.querySelector("a[href*=\"/status/\"]");
		if (!link) return "";
		const match = (link.getAttribute("href") || "").match(/\/status\/(\d+)/);
		return match ? match[1] : "";
	}
	function getMainTweetArticle() {
		const primaryColumn = document.querySelector("[data-testid=\"primaryColumn\"]");
		if (!primaryColumn) return null;
		return primaryColumn.querySelector("article[data-testid=\"tweet\"]");
	}
	function getTweetAuthorFromArticle(article) {
		const match = ((article?.querySelector("a[role=\"link\"][href^=\"/\"]"))?.getAttribute("href") || "").match(/^\/([^/]+)/);
		return match ? match[1] : "";
	}
	function getMainTweetAuthor() {
		return getTweetAuthorFromArticle(getMainTweetArticle());
	}
	function getTweetTextNode(article) {
		return article?.querySelector("[data-testid=\"tweetText\"]");
	}
	function findMatchingTarget() {
		const { targetXIds } = loadSettings();
		const conversationId = normalizeId(getConversationId());
		const conversationName = normalizeId(getConversationName());
		const tweetAuthor = normalizeId(getMainTweetAuthor());
		return targetXIds.map(normalizeId).filter(Boolean).find((target) => {
			if (target === "*") return true;
			if (conversationId) return conversationId === target || conversationId.includes(target) || conversationName.includes(target);
			if (tweetAuthor) return tweetAuthor === target || tweetAuthor.includes(target);
			return false;
		});
	}
	function isTargetConversation() {
		return Boolean(findMatchingTarget());
	}
	function getPartnerProfileId() {
		return findMatchingTarget() || normalizeId(getConversationId()) || normalizeId(getMainTweetAuthor()) || "";
	}
	function getMessageId(textNode) {
		return (textNode.getAttribute("data-testid") || "").replace(/^message-text-/, "");
	}
	function getMessageShell(textNode) {
		const id = getMessageId(textNode);
		return id ? document.querySelector(`[data-testid="message-${CSS.escape(id)}"]`) : null;
	}
	function isIncomingMessage(textNode) {
		const shell = getMessageShell(textNode);
		return shell ? shell.className.includes("justify-start") : false;
	}
	function cleanMessageText(text) {
		return text.split("\n").map((line) => line.trim()).filter((line) => line && !/^\d{1,2}:\d{2}$/.test(line) && line !== "Today" && line !== "New").join("\n").trim();
	}
	function hasJapaneseText(text) {
		return /[ぁ-んァ-ンー]/.test(text);
	}
	function getConversationMessages(limit = 10, includeId = false) {
		return [...document.querySelectorAll("[data-testid^=\"message-text-\"]")].map((node) => {
			const text = cleanMessageText(node.innerText || "");
			if (!text) return null;
			const base = {
				speaker: isIncomingMessage(node) ? "them" : "me",
				text
			};
			return includeId ? {
				...base,
				messageId: getMessageId(node)
			} : base;
		}).filter(Boolean).slice(-limit);
	}
	function getVisibleConversationMessagesForProfile(limit = 10) {
		return getConversationMessages(limit, true);
	}
	function buildPromptContext(latestMessage = null) {
		const settings = loadSettings();
		const profileId = getPartnerProfileId();
		const summary = getPartnerSummary(profileId);
		return {
			conversation: getConversationName(),
			model: MODEL,
			participants: {
				me: { profile: settings.myProfile },
				them: {
					profileId,
					displayName: getConversationName(),
					xProfile: getPartnerProfileForId(profileId),
					summary: summary?.summary || ""
				}
			},
			messages: getConversationMessages().map((message) => `${message.speaker === "me" ? "【我】" : "【对方】"}${message.text}`),
			latestMessage
		};
	}
	function buildTweetPromptContext(author, tweetText) {
		const settings = loadSettings();
		const profileId = normalizeId(author) || getPartnerProfileId();
		const summary = getPartnerSummary(profileId);
		return {
			conversation: `@${author}`,
			model: MODEL,
			participants: {
				me: { profile: settings.myProfile },
				them: {
					profileId,
					displayName: author,
					xProfile: getPartnerProfileForId(profileId),
					summary: summary?.summary || ""
				}
			},
			messages: [],
			latestMessage: {
				speaker: "them",
				text: tweetText
			}
		};
	}
	function hashText(text) {
		let hash = 2166136261;
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return (hash >>> 0).toString(36);
	}
	function getTranslationCacheKey(messageId, text) {
		return `translation:v2:${MODEL}:${getPartnerProfileId() || getConversationId()}:${messageId}:${hashText(text)}`;
	}
	function getTweetTranslationCacheKey(statusId, author, text) {
		return `translation:v2:${MODEL}:tweet:${normalizeId(author) || "unknown"}:${statusId}:${hashText(text)}`;
	}
	function startTask(kind, label) {
		state.totalTasks += 1;
		state.activeTasks += 1;
		const taskId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		pushTaskLog({
			id: taskId,
			kind,
			label,
			status: "running"
		});
		updateProgressBar();
		return {
			id: taskId,
			finish(detail = "") {
				state.finishedTasks += 1;
				state.activeTasks -= 1;
				pushTaskLog({
					id: taskId,
					kind,
					label,
					detail,
					status: "done"
				});
				updateProgressBar();
			},
			fail(error) {
				state.finishedTasks += 1;
				state.activeTasks -= 1;
				pushTaskLog({
					id: taskId,
					kind,
					label,
					detail: error.message,
					status: "error"
				});
				updateProgressBar();
			}
		};
	}
	function requestOpenRouter(messages, options = {}) {
		const apiKey = getApiKey();
		if (!apiKey) throw new Error("缺少 OpenRouter API key");
		const task = startTask(options.taskType || "llm", options.taskLabel || "OpenRouter");
		const payload = {
			model: MODEL,
			provider: { only: ["cloudflare"] },
			messages,
			reasoning: {
				effort: "medium",
				exclude: true
			},
			temperature: options.temperature ?? .2,
			max_completion_tokens: options.maxCompletionTokens ?? 8192
		};
		if (options.responseFormat) payload.response_format = options.responseFormat;
		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "POST",
				url: OPENROUTER_URL,
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"HTTP-Referer": location.origin,
					"X-OpenRouter-Title": "X DM Translator"
				},
				data: JSON.stringify(payload),
				timeout: 6e4,
				onload: (response) => {
					let body;
					try {
						body = JSON.parse(response.responseText);
					} catch (error) {
						reject(new Error(`OpenRouter 返回异常：${response.status}`));
						return;
					}
					if (response.status < 200 || response.status >= 300) {
						reject(new Error(body?.error?.message || `OpenRouter ${response.status}`));
						return;
					}
					const content = body?.choices?.[0]?.message?.content;
					if (!content) {
						reject(new Error("OpenRouter 返回为空"));
						return;
					}
					if (options.responseFormat?.type === "json_schema") {
						try {
							resolve(JSON.parse(content));
						} catch (error) {
							reject(new Error("OpenRouter JSON 解析失败"));
						}
						return;
					}
					resolve(content.trim());
				},
				onerror: () => reject(new Error("OpenRouter 请求失败")),
				ontimeout: () => reject(new Error("OpenRouter 请求超时"))
			});
		}).then((result) => {
			task.finish();
			return result;
		}).catch((error) => {
			task.fail(error);
			throw error;
		});
	}
	function translateIncomingMessage(text, context) {
		return requestOpenRouter([{
			role: "system",
			content: getPrompt("incomingTranslation")
		}, {
			role: "user",
			content: JSON.stringify({
				context,
				targetMessage: text
			})
		}], {
			temperature: .1,
			maxCompletionTokens: MAX_COMPLETION_TOKENS,
			responseFormat: INCOMING_TRANSLATION_FORMAT,
			taskType: "translation",
			taskLabel: "翻译私信"
		}).then((data) => data.translation.trim());
	}
	function translateReply(text) {
		const context = buildPromptContext({
			speaker: "me",
			text
		});
		return requestOpenRouter([{
			role: "system",
			content: getPrompt("replyTranslation")
		}, {
			role: "user",
			content: JSON.stringify({
				context,
				chineseDraft: text
			})
		}], {
			temperature: .45,
			maxCompletionTokens: MAX_COMPLETION_TOKENS,
			responseFormat: REPLY_OPTIONS_FORMAT,
			taskType: "reply",
			taskLabel: "生成日语候选"
		}).then((data) => data.options);
	}
	function updatePartnerSummary(task) {
		return requestOpenRouter([{
			role: "system",
			content: getPrompt("partnerSummary")
		}, {
			role: "user",
			content: JSON.stringify({
				existingSummary: task.existingSummary,
				context: task.context,
				newIncomingMessages: task.messages,
				latestMessage: task.latestMessage
			})
		}], {
			temperature: .2,
			maxCompletionTokens: MAX_COMPLETION_TOKENS,
			responseFormat: PARTNER_SUMMARY_FORMAT,
			taskType: "profile",
			taskLabel: "更新画像"
		}).then((data) => data.summary.trim());
	}
	function generateConversationSuggestions(latestText, context) {
		return requestOpenRouter([{
			role: "system",
			content: getPrompt("conversationSuggestions")
		}, {
			role: "user",
			content: JSON.stringify({
				context,
				latestIncomingMessage: latestText
			})
		}], {
			temperature: .55,
			maxCompletionTokens: MAX_COMPLETION_TOKENS,
			responseFormat: CONVERSATION_SUGGESTIONS_FORMAT,
			taskType: "suggestion",
			taskLabel: "生成建议"
		}).then((data) => data.suggestions);
	}
	function buildTranslationNode(text) {
		const row = document.createElement("div");
		row.className = `xct-translation-row`;
		const node = document.createElement("div");
		node.className = `xct-translation`;
		node.textContent = text;
		row.appendChild(node);
		return row;
	}
	function ensureTranslationSlot(textNode) {
		const messageId = getMessageId(textNode);
		const shell = getMessageShell(textNode);
		const existing = shell?.nextElementSibling?.classList.contains(`xct-translation-row`) ? shell.nextElementSibling : null;
		if (existing) return existing.querySelector(`.xct-translation`);
		document.querySelectorAll(`.xct-translation-row[data-message-id="${messageId}"]`).forEach((row) => row.remove());
		const isIncoming = isIncomingMessage(textNode);
		const row = buildTranslationNode("…");
		row.dataset.messageId = messageId;
		row.classList.toggle("is-incoming", isIncoming);
		row.classList.toggle("is-outgoing", !isIncoming);
		(shell || textNode).insertAdjacentElement("afterend", row);
		return row.querySelector(`.xct-translation`);
	}
	function renderTranslation(textNode, text) {
		const slot = ensureTranslationSlot(textNode);
		slot.textContent = text;
		slot.classList.remove(`xct-error`);
	}
	function markTranslationError(textNode, error) {
		const slot = ensureTranslationSlot(textNode);
		slot.textContent = error.message;
		slot.classList.add(`xct-error`);
	}
	function enqueueTranslation(textNode, text) {
		const messageId = getMessageId(textNode);
		const cacheKey = getTranslationCacheKey(messageId, text);
		const cached = getCachedTranslation(cacheKey);
		if (cached) {
			renderTranslation(textNode, cached.translation);
			return;
		}
		if (state.translating.has(cacheKey)) return;
		state.translating.add(cacheKey);
		const slot = ensureTranslationSlot(textNode);
		slot.textContent = "…";
		slot.classList.remove(`xct-error`);
		state.pending.set(cacheKey, {
			cacheKey,
			conversationId: getConversationId(),
			conversationName: getConversationName(),
			messageId,
			text,
			textNode,
			context: buildPromptContext({
				speaker: isIncomingMessage(textNode) ? "them" : "me",
				text
			})
		});
		runTranslationQueue();
	}
	function runTranslationQueue() {
		const settings = loadSettings();
		while (state.activeTranslations < settings.maxConcurrentTranslations && state.pending.size) {
			const [cacheKey, task] = state.pending.entries().next().value;
			state.pending.delete(cacheKey);
			if (!task.textNode.isConnected) {
				state.translating.delete(cacheKey);
				continue;
			}
			state.activeTranslations += 1;
			translateIncomingMessage(task.text, task.context).then((translated) => {
				setCachedTranslation(cacheKey, {
					conversationId: task.conversationId,
					conversationName: task.conversationName,
					profileId: getPartnerProfileId(),
					messageId: task.messageId,
					source: task.text,
					translation: translated,
					createdAt: Date.now()
				});
				renderTranslation(task.textNode, translated);
			}).catch((error) => markTranslationError(task.textNode, error)).finally(() => {
				state.activeTranslations -= 1;
				state.translating.delete(cacheKey);
				runTranslationQueue();
			});
		}
	}
	function enqueuePartnerSummaryUpdate(textNode, text) {
		if (!isIncomingMessage(textNode)) return;
		const profileId = getPartnerProfileId();
		const messageId = getMessageId(textNode);
		if (!profileId || !messageId || hasSeenPartnerSummaryMessage(profileId, messageId)) return;
		markPartnerSummaryMessageSeen(profileId, messageId);
		appendPartnerProfileBatchMessage(profileId, {
			messageId,
			speaker: "them",
			text,
			createdAt: Date.now()
		});
		schedulePartnerProfileBatch(profileId, {
			messageId,
			text
		});
	}
	function runPartnerSummaryQueue() {
		for (const [taskId, task] of state.profilePending) {
			if (state.profileUpdating.has(task.profileId)) continue;
			state.profilePending.delete(taskId);
			state.profileUpdating.add(task.profileId);
			task.existingSummary = getPartnerSummary(task.profileId)?.summary || task.existingSummary;
			updatePartnerSummary(task).then((summary) => {
				state.profileRetryAt.delete(task.profileId);
				const batch = getPartnerProfileBatch(task.profileId);
				const summarizedIds = new Set(task.messages.map((message) => message.messageId));
				setPartnerProfileBatch(task.profileId, batch.filter((message) => !summarizedIds.has(message.messageId)));
				setPartnerSummary(task.profileId, {
					summary,
					profileId: task.profileId,
					conversationId: task.conversationId,
					conversationName: task.conversationName,
					updatedAt: Date.now(),
					lastMessageId: task.messageId
				});
			}).catch((error) => {
				state.profileRetryAt.set(task.profileId, Date.now() + 18e4);
				console.warn("[X DM OpenRouter Translator] 画像更新失败", error);
			}).finally(() => {
				state.profileUpdating.delete(task.profileId);
				schedulePartnerProfileBatch(task.profileId);
				runPartnerSummaryQueue();
			});
		}
	}
	function getLatestConversationMessage() {
		const messages = getVisibleConversationMessagesForProfile();
		return messages[messages.length - 1] || null;
	}
	function clearConversationSuggestions(profileId) {
		const store = getConversationSuggestionsStore();
		if (store[profileId]) {
			delete store[profileId];
			GM_setValue(CONVERSATION_SUGGESTIONS_KEY, store);
		}
		const panel = document.getElementById(`xct-suggestions`);
		if (panel) panel.replaceChildren();
	}
	function generateAndRenderConversationSuggestions(profileId, latestMessage) {
		return generateConversationSuggestions(latestMessage.text, buildPromptContext(latestMessage)).then((items) => {
			state.suggestionRetryAt.delete(profileId);
			setConversationSuggestions(profileId, {
				profileId,
				lastMessageId: latestMessage.messageId,
				suggestions: items,
				updatedAt: Date.now()
			});
			renderSuggestionChoices(items);
			return items;
		}).catch((error) => {
			state.suggestionRetryAt.set(profileId, Date.now() + 18e4);
			console.warn("[X DM OpenRouter Translator] 建议生成失败", error);
			throw error;
		});
	}
	function maybeGenerateConversationSuggestions(profileId, latestMessage) {
		if (!profileId || !latestMessage) return Promise.resolve();
		if (state.suggestionUpdating.has(profileId) || (state.suggestionRetryAt.get(profileId) || 0) > Date.now()) return Promise.resolve();
		state.suggestionUpdating.add(profileId);
		return generateAndRenderConversationSuggestions(profileId, latestMessage).finally(() => state.suggestionUpdating.delete(profileId));
	}
	function refreshConversationSuggestions() {
		const profileId = getPartnerProfileId();
		const latestMessage = getLatestConversationMessage();
		if (!profileId || !latestMessage) return Promise.resolve();
		state.suggestionRetryAt.delete(profileId);
		clearConversationSuggestions(profileId);
		return maybeGenerateConversationSuggestions(profileId, latestMessage);
	}
	function handleSuggestButtonClick() {
		const button = document.getElementById(`xct-suggest-button`);
		const profileId = getPartnerProfileId();
		const latestMessage = getLatestConversationMessage();
		if (!profileId || !latestMessage) return;
		if (state.suggestionUpdating.has(profileId)) return;
		state.suggestionRetryAt.delete(profileId);
		clearConversationSuggestions(profileId);
		if (button) button.textContent = "⏳";
		maybeGenerateConversationSuggestions(profileId, latestMessage).finally(() => {
			if (button) button.textContent = "🤔";
		});
	}
	function handleLatestMessageChange() {
		const latestMessage = getLatestConversationMessage();
		if (!latestMessage) return;
		const latestKey = `${latestMessage.messageId}:${hashText(latestMessage.text)}`;
		if (state.lastSeenLatestMessageKey === latestKey) return;
		state.lastSeenLatestMessageKey = latestKey;
		if (!getPartnerProfileId()) return;
	}
	function scanMessages() {
		const settings = loadSettings();
		if (!isTargetConversation() || !getApiKey()) return;
		state.scannedMessageKeys.clear();
		const nodes = [...document.querySelectorAll("[data-testid^=\"message-text-\"]")].slice(-settings.maxMessagesPerScan);
		for (const textNode of nodes) {
			const text = cleanMessageText(textNode.innerText || "");
			if (!text) continue;
			enqueuePartnerSummaryUpdate(textNode, text);
			if (!settings.autoTranslate) continue;
			if (!hasJapaneseText(text)) continue;
			const messageId = getMessageId(textNode);
			const scanKey = `${messageId}:${hashText(text)}`;
			if (state.scannedMessageKeys.has(scanKey)) continue;
			state.scannedMessageKeys.add(scanKey);
			const existing = document.querySelector(`.xct-translation-row[data-message-id="${messageId}"] .xct-translation`);
			if (existing && !existing.classList.contains(`xct-error`)) continue;
			enqueueTranslation(textNode, text);
		}
		handleLatestMessageChange();
	}
	function removeLegacyTranslationNodes() {
		document.querySelectorAll(`.xct-translation`).forEach((node) => {
			if (!node.closest(`.xct-translation-row`)) node.remove();
		});
	}
	function findComposerForm() {
		return document.querySelector("[data-testid=\"dm-composer-form\"]") || findTweetComposerContainer();
	}
	function findTweetComposerContainer() {
		const textarea = document.querySelector("[data-testid=\"tweetTextarea_0\"]");
		const button = document.querySelector("[data-testid=\"tweetButton\"], [data-testid=\"tweetButtonInline\"], [data-testid=\"tweetButtonDisabled\"]");
		if (!textarea || !button) return null;
		const textareaAncestors = new Set();
		let element = textarea;
		while (element) {
			textareaAncestors.add(element);
			element = element.parentElement;
		}
		element = button;
		while (element) {
			if (textareaAncestors.has(element)) return element;
			element = element.parentElement;
		}
		return null;
	}
	function createProgressBar() {
		const wrap = document.createElement("div");
		wrap.id = `xct-progress`;
		wrap.innerHTML = `<span></span>`;
		return wrap;
	}
	function ensureProgressBar() {
		const form = findComposerForm();
		if (!form) return null;
		let progress = document.getElementById(`xct-progress`);
		if (!progress) progress = createProgressBar();
		if (progress.parentElement !== form) form.prepend(progress);
		if (form.dataset.testid === "tweetTextarea_0_label" || form.querySelector("[data-testid=\"tweetTextarea_0\"]")) form.classList.add(`xct-tweet-composer`);
		return progress;
	}
	function updateProgressBar() {
		const progress = ensureProgressBar();
		if (!progress) return;
		const bar = progress.querySelector("span");
		const total = Math.max(state.totalTasks, 1);
		const done = Math.min(state.finishedTasks, total);
		const percent = state.activeTasks ? Math.max(6, Math.round(done / total * 100)) : 100;
		bar.style.width = `${percent}%`;
		progress.classList.toggle("is-active", state.activeTasks > 0);
		progress.title = state.activeTasks ? `${done}/${total}` : "";
		if (!state.activeTasks && state.totalTasks) window.setTimeout(() => {
			if (!state.activeTasks) {
				state.totalTasks = 0;
				state.finishedTasks = 0;
				bar.style.width = "0";
				progress.classList.remove("is-active");
			}
		}, 1200);
	}
	function ensureSuggestionsPanel() {
		if (!findComposerForm()) return null;
		let panel = document.getElementById(`xct-suggestions`);
		if (!panel) {
			panel = document.createElement("div");
			panel.id = `xct-suggestions`;
			panel.addEventListener("click", (event) => {
				const button = event.target.closest(`.xct-suggestion`);
				if (button?.dataset.draft) setReplyDraftAndTranslate(button.dataset.draft);
				if (event.target.closest(`.xct-suggestion-refresh`)) refreshConversationSuggestions();
			});
		}
		if (panel.parentElement !== document.body) document.body.appendChild(panel);
		positionSuggestionsPanel();
		return panel;
	}
	function positionSuggestionsPanel() {
		const panel = document.getElementById(`xct-suggestions`);
		const form = findComposerForm();
		if (!panel || !form) return;
		const primaryColumn = document.querySelector("[data-testid=\"primaryColumn\"]");
		const viewportWidth = window.innerWidth;
		if (primaryColumn && viewportWidth > 1024) {
			const rect = primaryColumn.getBoundingClientRect();
			const gap = 12;
			const width = Math.min(320, Math.max(220, viewportWidth - rect.right - gap * 2));
			panel.style.position = "fixed";
			panel.style.left = `${Math.round(rect.right + gap)}px`;
			panel.style.right = "auto";
			panel.style.width = `${Math.round(width)}px`;
			panel.style.top = `${Math.round(rect.top + gap)}px`;
			panel.style.bottom = "auto";
			panel.style.maxHeight = `${Math.round(rect.height - gap * 2)}px`;
			panel.classList.add("is-right");
		} else {
			const formRect = form.getBoundingClientRect();
			const right = (document.getElementById(`xct-reply-button`)?.getBoundingClientRect())?.right || formRect.right;
			panel.style.position = "fixed";
			panel.style.left = `${Math.round(formRect.left)}px`;
			panel.style.right = "auto";
			panel.style.width = `${Math.round(right - formRect.left)}px`;
			panel.style.top = "auto";
			panel.style.bottom = `${Math.round(window.innerHeight - formRect.top + 8)}px`;
			panel.style.maxHeight = "";
			panel.classList.remove("is-right");
		}
	}
	function setReplyDraftAndTranslate(text) {
		ensureReplyButton();
		const panel = getReplyPanel();
		panel.classList.add("is-open");
		panel.querySelector(`.xct-reply-input`).value = text;
		placeReplyPanel();
		handleReplyTranslate();
	}
	function renderSuggestionChoices(suggestions) {
		const panel = ensureSuggestionsPanel();
		if (!panel) return;
		const refreshButton = document.createElement("button");
		refreshButton.type = "button";
		refreshButton.className = `xct-suggestion-refresh`;
		refreshButton.title = "刷新建议";
		refreshButton.textContent = "↻";
		panel.replaceChildren(refreshButton, ...suggestions.slice(0, 3).map((suggestion) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `xct-suggestion`;
			button.dataset.draft = suggestion.draft;
			button.innerHTML = `<strong></strong><span></span>`;
			button.querySelector("strong").textContent = suggestion.label;
			button.querySelector("span").textContent = suggestion.draft || suggestion.note;
			button.title = suggestion.note;
			return button;
		}));
	}
	function renderStoredSuggestionChoices() {
		const record = getConversationSuggestionsStore()[getPartnerProfileId()];
		const panel = document.getElementById(`xct-suggestions`);
		if (!panel) return;
		if (record?.suggestions?.length) renderSuggestionChoices(record.suggestions);
		else panel.replaceChildren();
	}
	function copyTextToClipboard(text) {
		if (navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(text).then(() => showToast("已复制到剪贴板"), () => fallbackCopy(text));
			return;
		}
		fallbackCopy(text);
	}
	function fallbackCopy(text) {
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.setAttribute("readonly", "");
		ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0;pointer-events:none;";
		document.body.appendChild(ta);
		ta.select();
		let ok = false;
		try {
			ok = document.execCommand("copy");
		} catch (e) {
			ok = false;
		}
		document.body.removeChild(ta);
		showToast(ok ? "已复制到剪贴板" : "复制失败，请手动复制");
	}
	function showToast(message, duration = 1800) {
		let toast = document.getElementById(`xct-toast`);
		if (!toast) {
			toast = document.createElement("div");
			toast.id = `xct-toast`;
			toast.addEventListener("transitionend", () => {
				if (!toast.classList.contains("is-visible") && toast._hideTimer) {
					clearTimeout(toast._hideTimer);
					toast._hideTimer = null;
				}
			});
			document.body.appendChild(toast);
		}
		toast.textContent = message;
		toast.classList.add("is-visible");
		if (toast._hideTimer) clearTimeout(toast._hideTimer);
		toast._hideTimer = window.setTimeout(() => {
			toast.classList.remove("is-visible");
		}, duration);
	}
	function ensureReplyButton() {
		const form = findComposerForm();
		if (!form) return;
		let button = document.getElementById(`xct-reply-button`);
		if (!button) {
			button = document.createElement("button");
			button.id = `xct-reply-button`;
			button.type = "button";
			button.textContent = "译";
			button.title = "翻译";
			button.addEventListener("click", toggleReplyPanel);
		}
		if (button.parentElement !== form.parentElement) form.insertAdjacentElement("afterend", button);
		let suggestButton = document.getElementById(`xct-suggest-button`);
		if (!suggestButton) {
			suggestButton = document.createElement("button");
			suggestButton.id = `xct-suggest-button`;
			suggestButton.type = "button";
			suggestButton.textContent = "🤔";
			suggestButton.title = "建议对话";
			suggestButton.addEventListener("click", handleSuggestButtonClick);
		}
		if (suggestButton.parentElement !== form.parentElement) button.insertAdjacentElement("afterend", suggestButton);
	}
	function getReplyPanel() {
		let panel = document.getElementById(`xct-reply-panel`);
		if (panel) return panel;
		panel = document.createElement("div");
		panel.id = `xct-reply-panel`;
		panel.innerHTML = `
      <textarea class="xct-reply-input" rows="4" placeholder="中文"></textarea>
      <div class="xct-reply-actions">
        <button type="button" class="xct-reply-submit">翻译</button>
        <button type="button" class="xct-reply-close">关闭</button>
      </div>
      <div class="xct-reply-status"></div>
      <div class="xct-tone-list"></div>
    `;
		panel.querySelector(`.xct-reply-submit`).addEventListener("click", handleReplyTranslate);
		panel.querySelector(`.xct-reply-close`).addEventListener("click", () => panel.classList.remove("is-open"));
		panel.querySelector(`.xct-tone-list`).addEventListener("click", (event) => {
			const button = event.target.closest(`.xct-tone`);
			if (button?.dataset.text) {
				copyTextToClipboard(button.dataset.text);
				panel.classList.remove("is-open");
			}
		});
		document.body.appendChild(panel);
		return panel;
	}
	function placeReplyPanel() {
		const button = document.getElementById(`xct-reply-button`);
		const panel = document.getElementById(`xct-reply-panel`);
		if (!button || !panel?.classList.contains("is-open")) return;
		const rect = button.getBoundingClientRect();
		const panelWidth = panel.offsetWidth || 380;
		const panelHeight = panel.offsetHeight || 520;
		const left = Math.min(window.innerWidth - panelWidth - 12, Math.max(12, rect.right - panelWidth));
		const preferredTop = rect.top - panelHeight - 12;
		const top = Math.min(window.innerHeight - panelHeight - 12, Math.max(12, preferredTop));
		panel.style.left = `${left}px`;
		panel.style.top = `${top}px`;
	}
	function toggleReplyPanel() {
		const panel = getReplyPanel();
		const willOpen = !panel.classList.contains("is-open");
		panel.classList.toggle("is-open", willOpen);
		if (willOpen) {
			placeReplyPanel();
			panel.querySelector(`.xct-reply-input`).focus();
		}
	}
	function setReplyStatus(text, isError = false) {
		const status = getReplyPanel().querySelector(`.xct-reply-status`);
		status.textContent = text;
		status.classList.toggle(`xct-error`, isError);
	}
	function renderToneChoices(options) {
		getReplyPanel().querySelector(`.xct-tone-list`).replaceChildren(...options.map((option) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `xct-tone`;
			button.dataset.text = option.text;
			button.innerHTML = `<span></span><em></em><strong></strong>`;
			button.querySelector("span").textContent = option.label;
			button.querySelector("em").textContent = option.note;
			button.querySelector("strong").textContent = option.text;
			return button;
		}));
		placeReplyPanel();
	}
	async function handleReplyTranslate() {
		const panel = getReplyPanel();
		const text = panel.querySelector(`.xct-reply-input`).value.trim();
		if (!text) {
			setReplyStatus("先写中文", true);
			return;
		}
		setReplyStatus("翻译中");
		panel.querySelector(`.xct-tone-list`).replaceChildren();
		try {
			const options = await translateReply(text);
			setReplyStatus("");
			renderToneChoices(options);
		} catch (error) {
			setReplyStatus(error.message, true);
		}
	}
	function openSettingsPanel() {
		const panel = getSettingsPanel();
		const settings = loadSettings();
		const fields = {
			openRouterApiKey: settings.openRouterApiKey,
			targetXIds: settings.targetXIds.join(", "),
			myProfile: settings.myProfile,
			autoTranslate: settings.autoTranslate,
			maxMessagesPerScan: settings.maxMessagesPerScan,
			maxConcurrentTranslations: settings.maxConcurrentTranslations,
			cacheLimit: settings.cacheLimit,
			taskLogLimit: settings.taskLogLimit
		};
		for (const [name, value] of Object.entries(fields)) {
			const element = panel.querySelector(`[name="${name}"]`);
			if (!element) continue;
			if (typeof value === "boolean") element.checked = value;
			else element.value = value;
		}
		panel.querySelector(`.xct-current-summary`).textContent = getPartnerSummary(getPartnerProfileId())?.summary || "暂无";
		renderPromptRows();
		renderTaskLog();
		renderSettingStates();
		renderTargetChips();
		renderTargetProfileRows();
		setSettingsStatus("");
		panel.classList.add("is-open");
	}
	function getSettingsPanel() {
		let panel = document.getElementById(`xct-settings-panel`);
		if (panel) return panel;
		panel = document.createElement("div");
		panel.id = `xct-settings-panel`;
		panel.className = `xct-modal`;
		panel.innerHTML = `
      <div class="xct-modal-head">
        <strong>翻译设置</strong>
        <button type="button" data-action="close">关闭</button>
      </div>
      <section class="xct-settings-section">
        <h3>基础</h3>
        <label>OpenRouter Key<span class="xct-setting-state" data-setting-state="openRouterApiKey"></span><input name="openRouterApiKey" type="password" autocomplete="off"></label>
        <div class="xct-target-section">
          <label>目标会话 / 推文作者 X ID<span class="xct-setting-state" data-setting-state="targetXIds"></span></label>
          <div class="xct-target-chips" id="xct-target-chips"></div>
          <div class="xct-target-add">
            <input type="text" data-target-input placeholder="输入 X ID 或 *">
            <button type="button" data-action="add-target">添加</button>
            <button type="button" data-action="use-current-target">当前目标</button>
          </div>
          <input type="hidden" name="targetXIds">
        </div>
        <div class="xct-target-profiles" id="xct-target-profiles"></div>
        <label>我的资料<span class="xct-setting-state" data-setting-state="myProfile"></span><textarea name="myProfile" rows="4" placeholder="性别、称呼、自称、关系"></textarea></label>
      </section>
      <section class="xct-settings-section">
        <div class="xct-section-head">
          <h3>行为</h3>
          <button type="button" data-action="restore-behavior">恢复行为</button>
        </div>
        <div class="xct-check-grid">
          <label class="xct-check"><input name="autoTranslate" type="checkbox">自动翻译<span class="xct-setting-state" data-setting-state="autoTranslate"></span></label>
        </div>
        <div class="xct-settings-grid">
          <label>扫描条数<span class="xct-setting-state" data-setting-state="maxMessagesPerScan"></span><input name="maxMessagesPerScan" type="number" min="5" max="80"></label>
          <label>并发数<span class="xct-setting-state" data-setting-state="maxConcurrentTranslations"></span><input name="maxConcurrentTranslations" type="number" min="1" max="6"></label>
          <label>缓存上限<span class="xct-setting-state" data-setting-state="cacheLimit"></span><input name="cacheLimit" type="number" min="50" max="3000"></label>
          <label>日志上限<span class="xct-setting-state" data-setting-state="taskLogLimit"></span><input name="taskLogLimit" type="number" min="20" max="1000"></label>
        </div>
      </section>
      <section class="xct-settings-section">
        <div class="xct-section-head">
          <h3>提示词</h3>
          <button type="button" data-action="restore-prompts">全部恢复</button>
        </div>
        <div class="xct-prompt-list"></div>
      </section>
      <section class="xct-settings-section">
        <h3>当前画像</h3>
        <div class="xct-current-summary">暂无</div>
      </section>
      <section class="xct-settings-section">
        <h3>日志</h3>
        <div class="xct-task-log"></div>
      </section>
      <div class="xct-settings-actions">
        <button type="button" data-action="save" class="xct-primary">保存</button>
        <button type="button" data-action="use-current">当前目标</button>
        <button type="button" data-action="cache">查看缓存</button>
        <button type="button" data-action="clear-cache">清空缓存</button>
      </div>
      <div class="xct-settings-status"></div>
    `;
		panel.addEventListener("click", (event) => {
			const trigger = event.target.closest("[data-action]");
			if (!trigger) return;
			const action = trigger.dataset.action;
			const promptKey = trigger.dataset.prompt;
			if (action === "close") panel.classList.remove("is-open");
			if (action === "save") saveSettingsFromPanel();
			if (action === "use-current" || action === "use-current-target") useCurrentConversationAsTarget();
			if (action === "add-target") addTargetFromPanelInput();
			if (action === "remove-target") removeTargetFromPanel(trigger.dataset.targetId);
			if (action === "cache") openCachePanel();
			if (action === "clear-cache") clearCacheWithConfirm();
			if (action === "restore-prompts") restoreAllDefaults();
			if (action === "restore-behavior") restoreBehaviorDefaults();
			if (action === "edit-prompt") openPromptEditor(promptKey);
			if (action === "restore-prompt") restorePromptDefault(promptKey);
		});
		document.body.appendChild(panel);
		panel.querySelector("[data-target-input]")?.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				addTargetFromPanelInput();
			}
		});
		return panel;
	}
	function saveSettingsFromPanel() {
		const panel = getSettingsPanel();
		const partnerProfiles = getPartnerProfiles();
		panel.querySelectorAll("[data-partner-profile]").forEach((textarea) => {
			const id = textarea.dataset.partnerProfile;
			if (id) partnerProfiles[id] = textarea.value.trim();
		});
		setPartnerProfiles(partnerProfiles);
		saveSettings({
			openRouterApiKey: panel.querySelector("[name=\"openRouterApiKey\"]").value.trim(),
			targetXIds: panel.querySelector("[name=\"targetXIds\"]").value.split(",").map((item) => item.trim()).filter(Boolean),
			autoTranslate: panel.querySelector("[name=\"autoTranslate\"]").checked,
			myProfile: panel.querySelector("[name=\"myProfile\"]").value.trim(),
			maxMessagesPerScan: panel.querySelector("[name=\"maxMessagesPerScan\"]").value,
			maxConcurrentTranslations: panel.querySelector("[name=\"maxConcurrentTranslations\"]").value,
			cacheLimit: panel.querySelector("[name=\"cacheLimit\"]").value,
			taskLogLimit: panel.querySelector("[name=\"taskLogLimit\"]").value
		});
		setSettingsStatus("已保存");
		renderSettingStates();
		scanMessages();
		runTranslationQueue();
	}
	function setSettingsStatus(text, isError = false) {
		const status = getSettingsPanel().querySelector(`.xct-settings-status`);
		status.textContent = text;
		status.classList.toggle(`xct-error`, isError);
	}
	var PROMPT_LABELS = {
		incomingTranslation: "私信翻译",
		replyTranslation: "回复翻译",
		conversationSuggestions: "建议对话",
		partnerSummary: "画像总结"
	};
	var BEHAVIOR_SETTING_KEYS = [
		"autoTranslate",
		"maxMessagesPerScan",
		"maxConcurrentTranslations",
		"cacheLimit",
		"taskLogLimit"
	];
	function normalizeSettingValue(value) {
		return Array.isArray(value) ? value.join(", ") : String(value ?? "");
	}
	function renderSettingStates() {
		const panel = document.getElementById(`xct-settings-panel`);
		if (!panel) return;
		const settings = loadSettings();
		panel.querySelectorAll("[data-setting-state]").forEach((node) => {
			const key = node.dataset.settingState;
			const isDefault = normalizeSettingValue(settings[key]) === normalizeSettingValue(DEFAULT_SETTINGS[key]);
			node.textContent = isDefault ? "默认" : "已修改";
			node.classList.toggle("is-dirty", !isDefault);
		});
	}
	function restoreBehaviorDefaults() {
		const nextSettings = {};
		for (const key of BEHAVIOR_SETTING_KEYS) nextSettings[key] = DEFAULT_SETTINGS[key];
		saveSettings(nextSettings);
		openSettingsPanel();
		setSettingsStatus("已恢复");
	}
	function renderPromptRows() {
		const list = document.getElementById(`xct-settings-panel`)?.querySelector(`.xct-prompt-list`);
		if (!list) return;
		list.replaceChildren(...Object.keys(DEFAULT_PROMPTS).map((promptKey) => {
			const isDefault = isPromptDefault(promptKey);
			const status = isDefault ? "默认" : "已修改";
			const row = document.createElement("div");
			row.className = `xct-prompt-row`;
			row.innerHTML = `
          <strong></strong>
          <span class="xct-prompt-state ${isDefault ? "" : "is-dirty"}">${status}</span>
          <button type="button" data-action="edit-prompt" data-prompt="${promptKey}">编辑</button>
          <button type="button" data-action="restore-prompt" data-prompt="${promptKey}">恢复</button>
        `;
			row.querySelector("strong").textContent = PROMPT_LABELS[promptKey];
			return row;
		}));
	}
	function getPromptEditor() {
		let panel = document.getElementById(`xct-prompt-editor`);
		if (panel) return panel;
		panel = document.createElement("div");
		panel.id = `xct-prompt-editor`;
		panel.className = `xct-modal xct-prompt-editor`;
		panel.innerHTML = `
      <div class="xct-modal-head">
        <strong></strong>
        <button type="button" data-action="close">关闭</button>
      </div>
      <textarea rows="12"></textarea>
      <div class="xct-settings-actions">
        <button type="button" data-action="save" class="xct-primary">保存</button>
        <button type="button" data-action="restore">恢复默认</button>
      </div>
      <div class="xct-settings-status"></div>
    `;
		panel.addEventListener("click", (event) => {
			const trigger = event.target.closest("[data-action]");
			if (!trigger) return;
			const action = trigger.dataset.action;
			const promptKey = panel.dataset.prompt;
			if (action === "close") panel.classList.remove("is-open");
			if (action === "save") {
				const overrides = getPromptOverrides();
				overrides[promptKey] = panel.querySelector("textarea").value.trim();
				savePromptOverrides(overrides);
				panel.querySelector(`.xct-settings-status`).textContent = "已保存";
				renderPromptRows();
			}
			if (action === "restore") {
				restorePromptDefault(promptKey);
				panel.querySelector("textarea").value = DEFAULT_PROMPTS[promptKey];
				panel.querySelector(`.xct-settings-status`).textContent = "已恢复";
			}
		});
		document.body.appendChild(panel);
		return panel;
	}
	function openPromptEditor(promptKey) {
		const panel = getPromptEditor();
		panel.dataset.prompt = promptKey;
		panel.querySelector(`.xct-modal-head strong`).textContent = PROMPT_LABELS[promptKey];
		panel.querySelector("textarea").value = getPrompt(promptKey);
		panel.querySelector(`.xct-settings-status`).textContent = isPromptDefault(promptKey) ? "默认" : "已修改";
		panel.classList.add("is-open");
	}
	function renderTaskLog() {
		const list = document.getElementById(`xct-settings-panel`)?.querySelector(`.xct-task-log`);
		if (!list) return;
		const logs = getTaskLogs().slice(0, 80);
		list.replaceChildren(...logs.map((log) => {
			const row = document.createElement("div");
			row.className = `xct-log-row ${log.status === "error" ? "is-error" : ""}`;
			row.innerHTML = `<span></span><strong></strong><em></em><p></p>`;
			row.querySelector("span").textContent = new Date(log.createdAt).toLocaleTimeString();
			row.querySelector("strong").textContent = log.label || log.kind;
			row.querySelector("em").textContent = log.status;
			row.querySelector("p").textContent = log.detail || "";
			return row;
		}));
	}
	function renderTargetProfileRows() {
		const container = document.getElementById(`xct-target-profiles`);
		if (!container) return;
		const settings = loadSettings();
		const profiles = getPartnerProfiles();
		const input = document.getElementById(`xct-settings-panel`)?.querySelector("[name=\"targetXIds\"]");
		const targets = (input ? input.value : settings.targetXIds.join(", ")).split(",").map(normalizeId).filter(Boolean);
		if (!targets.length) {
			container.replaceChildren();
			return;
		}
		container.replaceChildren(...targets.map((id) => {
			const label = document.createElement("label");
			label.innerHTML = `对方资料 <code>@${id}</code><textarea rows="4" placeholder="昵称、自介、@id、称呼偏好"></textarea>`;
			const textarea = label.querySelector("textarea");
			textarea.dataset.partnerProfile = id;
			textarea.value = Object.prototype.hasOwnProperty.call(profiles, id) ? profiles[id] : "";
			return label;
		}));
	}
	function getPanelTargetIds() {
		return (document.getElementById(`xct-settings-panel`)?.querySelector("[name=\"targetXIds\"]")?.value || "").split(",").map(normalizeId).filter(Boolean);
	}
	function setPanelTargetIds(ids) {
		const input = document.getElementById(`xct-settings-panel`)?.querySelector("[name=\"targetXIds\"]");
		if (!input) return;
		input.value = [...new Set(ids)].filter(Boolean).join(", ");
		renderTargetChips();
		renderTargetProfileRows();
	}
	function renderTargetChips() {
		const container = document.getElementById(`xct-target-chips`);
		if (!container) return;
		const targets = getPanelTargetIds();
		if (!targets.length) {
			container.replaceChildren();
			return;
		}
		container.replaceChildren(...targets.map((id) => {
			const chip = document.createElement("span");
			chip.className = `xct-target-chip`;
			chip.innerHTML = `<code>@${id}</code><button type="button" data-action="remove-target" data-target-id="${id}" title="移除">×</button>`;
			return chip;
		}));
	}
	function addTargetFromPanelInput() {
		const input = document.getElementById(`xct-settings-panel`)?.querySelector("[data-target-input]");
		if (!input) return;
		const raw = input.value.trim();
		if (!raw) return;
		const ids = raw.split(",").map(normalizeId).filter(Boolean);
		if (!ids.length) return;
		setPanelTargetIds([...getPanelTargetIds(), ...ids]);
		input.value = "";
	}
	function removeTargetFromPanel(targetId) {
		setPanelTargetIds(getPanelTargetIds().filter((id) => id !== targetId));
	}
	function useCurrentConversationAsTarget() {
		const currentId = getConversationId() || getMainTweetAuthor();
		if (!currentId) {
			setSettingsStatus("当前不是私信会话或推文页面", true);
			return;
		}
		const current = getPanelTargetIds();
		if (current.includes(currentId)) {
			setSettingsStatus("当前目标已在列表中");
			return;
		}
		setPanelTargetIds([...current, currentId]);
		setSettingsStatus("已添加当前目标");
	}
	function clearCacheWithConfirm() {
		if (!confirm("清空翻译缓存？")) return;
		clearTranslationCache();
		document.querySelectorAll(`.xct-translation, .xct-translation-row, .xct-tweet-translation-row`).forEach((node) => node.remove());
		setSettingsStatus("缓存已清空");
		if (document.getElementById(`xct-cache-panel`)?.classList.contains("is-open")) renderCacheList();
		scanMessages();
	}
	function getCachePanel() {
		let panel = document.getElementById(`xct-cache-panel`);
		if (panel) return panel;
		panel = document.createElement("div");
		panel.id = `xct-cache-panel`;
		panel.className = `xct-modal xct-cache-modal`;
		panel.innerHTML = `
      <div class="xct-modal-head">
        <strong>翻译缓存</strong>
        <button type="button" data-action="close">关闭</button>
      </div>
      <input class="xct-cache-search" placeholder="搜索">
      <div class="xct-cache-count"></div>
      <div class="xct-cache-list"></div>
    `;
		panel.querySelector("[data-action=\"close\"]").addEventListener("click", () => panel.classList.remove("is-open"));
		panel.querySelector(`.xct-cache-search`).addEventListener("input", renderCacheList);
		document.body.appendChild(panel);
		return panel;
	}
	function openCachePanel() {
		getCachePanel().classList.add("is-open");
		renderCacheList();
	}
	function renderCacheList() {
		const panel = getCachePanel();
		const query = panel.querySelector(`.xct-cache-search`).value.trim().toLowerCase();
		const entries = getCacheIndex().filter((entry) => {
			const haystack = `${entry.conversationName || ""}\n${entry.source || ""}\n${entry.translation || ""}`.toLowerCase();
			return !query || haystack.includes(query);
		});
		panel.querySelector(`.xct-cache-count`).textContent = `${entries.length} 条`;
		panel.querySelector(`.xct-cache-list`).replaceChildren(...entries.slice(0, 120).map((entry) => {
			const item = document.createElement("article");
			item.className = `xct-cache-item`;
			const title = document.createElement("span");
			const source = document.createElement("p");
			const translation = document.createElement("strong");
			title.textContent = `${entry.conversationName || entry.conversationId || "私信"} · ${new Date(entry.createdAt).toLocaleString()}`;
			source.textContent = entry.source;
			translation.textContent = entry.translation;
			item.append(title, source, translation);
			return item;
		}));
	}
	function ensureTweetTranslationRow(article) {
		let row = article.querySelector(`.xct-tweet-translation-row`);
		if (row) return row.querySelector(`.xct-tweet-translation`);
		row = document.createElement("div");
		row.className = `xct-tweet-translation-row`;
		const node = document.createElement("div");
		node.className = `xct-tweet-translation`;
		node.textContent = "…";
		const button = document.createElement("button");
		button.type = "button";
		button.className = `xct-tweet-translate-btn`;
		button.textContent = "译";
		button.title = "翻译";
		button.addEventListener("click", () => {
			const text = cleanMessageText(getTweetTextNode(article)?.innerText || "");
			if (!text) return;
			enqueueTweetTranslation(article, text, true);
		});
		row.appendChild(node);
		row.appendChild(button);
		const textNode = getTweetTextNode(article);
		if (textNode) textNode.insertAdjacentElement("afterend", row);
		else article.appendChild(row);
		return node;
	}
	function renderTweetTranslation(article, text) {
		const slot = ensureTweetTranslationRow(article);
		slot.textContent = text;
		slot.classList.remove(`xct-error`);
	}
	function markTweetTranslationError(article, error) {
		const slot = ensureTweetTranslationRow(article);
		slot.textContent = error.message;
		slot.classList.add(`xct-error`);
	}
	function enqueueTweetTranslation(article, text, force = false) {
		const statusId = getArticleStatusId(article) || getTweetStatusId();
		const author = getTweetAuthorFromArticle(article);
		const cacheKey = getTweetTranslationCacheKey(statusId, author, text);
		const cached = getCachedTranslation(cacheKey);
		if (cached) {
			renderTweetTranslation(article, cached.translation);
			return;
		}
		if (state.translating.has(cacheKey)) return;
		if (!loadSettings().autoTranslate && !force) return;
		if (!hasJapaneseText(text)) {
			if (force) markTweetTranslationError(article, new Error("未检测到日语内容，跳过翻译"));
			return;
		}
		state.translating.add(cacheKey);
		const slot = ensureTweetTranslationRow(article);
		slot.textContent = "…";
		slot.classList.remove(`xct-error`);
		translateIncomingMessage(text, buildTweetPromptContext(author, text)).then((translated) => {
			setCachedTranslation(cacheKey, {
				conversationId: `tweet:${statusId}`,
				conversationName: `@${author}`,
				profileId: getPartnerProfileId(),
				messageId: statusId,
				source: text,
				translation: translated,
				createdAt: Date.now()
			});
			renderTweetTranslation(article, translated);
		}).catch((error) => markTweetTranslationError(article, error)).finally(() => {
			state.translating.delete(cacheKey);
		});
	}
	function scanTweetArticles() {
		const articles = [...document.querySelectorAll("article[data-testid=\"tweet\"]")];
		for (const article of articles) {
			if (article.querySelector(`.xct-tweet-translation-row`)) continue;
			const text = cleanMessageText(getTweetTextNode(article)?.innerText || "");
			if (!text) continue;
			const cacheKey = getTweetTranslationCacheKey(getArticleStatusId(article) || getTweetStatusId(), getTweetAuthorFromArticle(article), text);
			if (state.scannedTweetKeys.has(cacheKey)) continue;
			state.scannedTweetKeys.add(cacheKey);
			ensureTweetTranslationRow(article);
			const cached = getCachedTranslation(cacheKey);
			if (cached) renderTweetTranslation(article, cached.translation);
		}
	}
	function getMainTweetText() {
		const textNode = getTweetTextNode(getMainTweetArticle());
		return textNode ? cleanMessageText(textNode.innerText) : "";
	}
	function generateTweetReplySuggestions(tweetText, author) {
		return requestOpenRouter([{
			role: "system",
			content: getPrompt("tweetReplySuggestions")
		}, {
			role: "user",
			content: JSON.stringify({
				context: buildTweetPromptContext(author, tweetText),
				tweetText
			})
		}], {
			temperature: .55,
			maxCompletionTokens: MAX_COMPLETION_TOKENS,
			responseFormat: CONVERSATION_SUGGESTIONS_FORMAT,
			taskType: "suggestion",
			taskLabel: "生成回复建议"
		}).then((data) => data.suggestions);
	}
	function getTweetSuggestionsStore() {
		const store = GM_getValue(TWEET_SUGGESTIONS_KEY, {});
		return store && typeof store === "object" && !Array.isArray(store) ? store : {};
	}
	function setTweetSuggestions(profileId, record) {
		const store = getTweetSuggestionsStore();
		store[profileId] = record;
		GM_setValue(TWEET_SUGGESTIONS_KEY, store);
	}
	function clearTweetReplySuggestions(profileId) {
		const store = getTweetSuggestionsStore();
		if (store[profileId]) {
			delete store[profileId];
			GM_setValue(TWEET_SUGGESTIONS_KEY, store);
		}
		const panel = document.getElementById(`xct-suggestions`);
		if (panel) panel.replaceChildren();
	}
	function generateAndRenderTweetReplySuggestions(profileId, tweetText) {
		return generateTweetReplySuggestions(tweetText, getMainTweetAuthor()).then((items) => {
			state.suggestionRetryAt.delete(profileId);
			setTweetSuggestions(profileId, {
				profileId,
				lastTweetId: getTweetStatusId(),
				suggestions: items,
				updatedAt: Date.now()
			});
			renderSuggestionChoices(items);
			return items;
		}).catch((error) => {
			state.suggestionRetryAt.set(profileId, Date.now() + 18e4);
			console.warn("[X DM OpenRouter Translator] 推文回复建议生成失败", error);
			throw error;
		});
	}
	function maybeGenerateTweetReplySuggestions(profileId, tweetText) {
		if (!profileId || !tweetText) return Promise.resolve();
		if (state.suggestionUpdating.has(profileId) || (state.suggestionRetryAt.get(profileId) || 0) > Date.now()) return Promise.resolve();
		state.suggestionUpdating.add(profileId);
		return generateAndRenderTweetReplySuggestions(profileId, tweetText).finally(() => state.suggestionUpdating.delete(profileId));
	}
	function handleTweetSuggestButtonClick() {
		const button = document.getElementById(`xct-suggest-button`);
		const profileId = getPartnerProfileId();
		const tweetText = getMainTweetText();
		if (!profileId || !tweetText) return;
		if (state.suggestionUpdating.has(profileId)) return;
		state.suggestionRetryAt.delete(profileId);
		clearTweetReplySuggestions(profileId);
		if (button) button.textContent = "⏳";
		maybeGenerateTweetReplySuggestions(profileId, tweetText).finally(() => {
			if (button) button.textContent = "🤔";
		});
	}
	function renderStoredTweetSuggestionChoices() {
		const record = getTweetSuggestionsStore()[getPartnerProfileId()];
		const panel = document.getElementById(`xct-suggestions`);
		if (!panel) return;
		if (record?.suggestions?.length && record?.lastTweetId === getTweetStatusId()) renderSuggestionChoices(record.suggestions);
		else panel.replaceChildren();
	}
	function ensureTweetReplyButtons() {
		const form = findComposerForm();
		if (!form) return;
		const tweetButton = !document.querySelector("[data-testid=\"dm-composer-form\"]") ? document.querySelector("[data-testid=\"tweetButton\"], [data-testid=\"tweetButtonInline\"], [data-testid=\"tweetButtonDisabled\"]") : null;
		let button = document.getElementById(`xct-reply-button`);
		if (!button) {
			button = document.createElement("button");
			button.id = `xct-reply-button`;
			button.type = "button";
			button.textContent = "译";
			button.title = "翻译";
			button.addEventListener("click", toggleReplyPanel);
		}
		let suggestButton = document.getElementById(`xct-suggest-button`);
		if (!suggestButton) {
			suggestButton = document.createElement("button");
			suggestButton.id = `xct-suggest-button`;
			suggestButton.type = "button";
			suggestButton.textContent = "🤔";
			suggestButton.title = "建议回复";
			suggestButton.addEventListener("click", handleTweetSuggestButtonClick);
		}
		if (!tweetButton) {
			if (button.parentElement !== form.parentElement) form.insertAdjacentElement("afterend", button);
			if (suggestButton.parentElement !== button.parentElement) button.insertAdjacentElement("afterend", suggestButton);
			return;
		}
		let host = document.querySelector("[data-testid=\"toolBar\"]");
		if (!host) {
			host = tweetButton.parentElement;
			while (host && host.parentElement !== form) host = host.parentElement;
			if (host) {
				host.style.flexDirection = "row";
				host.style.gap = "8px";
				host.style.alignItems = "center";
				host.style.justifyContent = "flex-end";
			}
		}
		if (!host) {
			host = document.getElementById(`xct-reply-button-row`);
			if (!host) {
				host = document.createElement("div");
				host.id = `xct-reply-button-row`;
				host.style.cssText = "display:flex;flex-direction:row;gap:8px;align-items:center;justify-content:flex-end;width:100%;padding:4px 12px;box-sizing:border-box;";
				form.appendChild(host);
			}
		}
		if (button.parentElement !== host || button.nextSibling !== tweetButton) host.insertBefore(button, tweetButton);
		if (suggestButton.parentElement !== host || suggestButton.previousSibling !== button || suggestButton.nextSibling !== tweetButton) host.insertBefore(suggestButton, tweetButton);
	}
	function registerMenuCommands() {
		GM_registerMenuCommand("翻译设置", openSettingsPanel);
		GM_registerMenuCommand("查看翻译缓存", openCachePanel);
		GM_registerMenuCommand("清空翻译缓存", clearCacheWithConfirm);
		GM_registerMenuCommand("使用当前目标", useCurrentConversationAsTarget);
		GM_registerMenuCommand("开关自动翻译", () => {
			saveSettings({ autoTranslate: !loadSettings().autoTranslate });
			scanMessages();
		});
		GM_registerMenuCommand("重扫当前会话", scanMessages);
	}
	function debounce(fn, wait) {
		let timeout;
		return (...args) => {
			window.clearTimeout(timeout);
			timeout = window.setTimeout(() => fn.apply(this, args), wait);
		};
	}
	function tick() {
		injectStyles();
		removeLegacyTranslationNodes();
		const conversationId = getConversationId();
		const isNewConversation = conversationId !== state.seenConversationId;
		const isNewPath = location.pathname !== state.seenPathname;
		if (isNewConversation || isNewPath) {
			state.seenConversationId = conversationId;
			state.seenPathname = location.pathname;
			state.lastSeenLatestMessageKey = "";
			state.scannedMessageKeys.clear();
			state.scannedTweetKeys.clear();
			document.getElementById(`xct-reply-panel`)?.classList.remove("is-open");
			document.getElementById(`xct-settings-panel`)?.classList.remove("is-open");
			document.getElementById(`xct-cache-panel`)?.classList.remove("is-open");
			document.getElementById(`xct-prompt-editor`)?.classList.remove("is-open");
			if (isTweetDetailPage()) renderStoredTweetSuggestionChoices();
			else renderStoredSuggestionChoices();
			state.profilePending.clear();
			state.profileUpdating.clear();
			const currentProfileId = getPartnerProfileId();
			for (const map of [state.profileRetryAt, state.suggestionRetryAt]) for (const key of map.keys()) if (key !== currentProfileId) map.delete(key);
		}
		scanTweetArticles();
		if (isTweetDetailPage()) ensureTweetReplyButtons();
		if (isTargetConversation()) if (isTweetDetailPage()) {
			ensureProgressBar();
			ensureSuggestionsPanel();
			positionSuggestionsPanel();
		} else {
			ensureReplyButton();
			ensureProgressBar();
			ensureSuggestionsPanel();
			positionSuggestionsPanel();
			scanMessages();
		}
	}
	function start() {
		registerMenuCommands();
		tick();
		const debouncedTick = debounce(tick, 120);
		new MutationObserver(debouncedTick).observe(document.body, {
			childList: true,
			subtree: true
		});
		window.addEventListener("resize", placeReplyPanel);
		window.addEventListener("resize", positionSuggestionsPanel);
		window.addEventListener("scroll", positionSuggestionsPanel, true);
		setInterval(tick, 5e3);
	}
	start();
})();
