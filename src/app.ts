import {
  CACHE_INDEX_KEY,
  CHAT_CONTEXT_SIZE,
  CONVERSATION_SUGGESTIONS_KEY,
  ENV_OPENROUTER_API_KEY,
  TWEET_SUGGESTIONS_KEY,
  MAX_COMPLETION_TOKENS,
  MODEL,
  OPENROUTER_URL,
  PARTNER_PROFILES_KEY,
  PARTNER_PROFILE_BATCHES_KEY,
  PARTNER_SUMMARIES_KEY,
  PARTNER_SUMMARY_SEEN_KEY,
  PROFILE_BATCH_SIZE,
  PROMPT_OVERRIDES_KEY,
  SCRIPT_ID,
  TASK_LOGS_KEY,
} from './constants';
import { DEFAULT_PROMPTS } from './prompts';
import {
  CONVERSATION_SUGGESTIONS_FORMAT,
  INCOMING_TRANSLATION_FORMAT,
  PARTNER_SUMMARY_FORMAT,
  REPLY_OPTIONS_FORMAT,
} from './schemas';
import { state } from './state';
import { injectStyles } from './styles';

  const DEFAULT_SETTINGS = {
    targetXIds: [],
    openRouterApiKey: '',
    userProfile: '',
    myProfile: '',
    partnerProfile: '',
    autoTranslate: true,
    maxMessagesPerScan: 30,
    maxConcurrentTranslations: 6,
    cacheLimit: 800,
    taskLogLimit: 200,
  };

  function loadSettings() {
    const saved = GM_getValue('settings', {});
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    settings.targetXIds = Array.isArray(settings.targetXIds) ? settings.targetXIds : [];
    settings.userProfile = String(settings.userProfile || '').trim();
    settings.myProfile = String(settings.myProfile || settings.userProfile || '').trim();
    settings.partnerProfile = String(settings.partnerProfile || '').trim();
    settings.maxMessagesPerScan = clampNumber(settings.maxMessagesPerScan, 5, 80);
    settings.maxConcurrentTranslations = clampNumber(settings.maxConcurrentTranslations, 1, 6);
    settings.cacheLimit = clampNumber(settings.cacheLimit, 50, 3000);
    settings.taskLogLimit = clampNumber(settings.taskLogLimit, 20, 1000);
    return settings;
  }

  function saveSettings(nextSettings) {
    GM_setValue('settings', { ...loadSettings(), ...nextSettings });
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function getCacheIndex() {
    const index = GM_getValue(CACHE_INDEX_KEY, []);
    return Array.isArray(index) ? index : [];
  }

  function saveCacheIndex(index) {
    const limit = loadSettings().cacheLimit;
    const trimmed = index
      .filter((entry) => entry?.key)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit);

    const kept = new Set(trimmed.map((entry) => entry.key));
    for (const entry of index) {
      if (entry?.key && !kept.has(entry.key)) {
        GM_deleteValue(entry.key);
      }
    }

    GM_setValue(CACHE_INDEX_KEY, trimmed);
    return trimmed;
  }

  function getCachedTranslation(cacheKey) {
    const cached = GM_getValue(cacheKey, null);
    return cached && typeof cached.translation === 'string' ? cached : null;
  }

  function setCachedTranslation(cacheKey, record) {
    GM_setValue(cacheKey, record);
    const index = getCacheIndex().filter((entry) => entry.key !== cacheKey);
    saveCacheIndex([{ ...record, key: cacheKey }, ...index]);
  }

  function clearTranslationCache() {
    for (const entry of getCacheIndex()) {
      GM_deleteValue(entry.key);
    }
    for (const key of GM_listValues()) {
      if (key.startsWith('translation:')) {
        GM_deleteValue(key);
      }
    }
    GM_setValue(CACHE_INDEX_KEY, []);
  }

  function getPromptOverrides() {
    const overrides = GM_getValue(PROMPT_OVERRIDES_KEY, {});
    return overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
  }

  function savePromptOverrides(overrides) {
    GM_setValue(PROMPT_OVERRIDES_KEY, overrides);
  }

  function getPrompt(promptKey) {
    const override = getPromptOverrides()[promptKey];
    return typeof override === 'string' && override.trim() ? override.trim() : DEFAULT_PROMPTS[promptKey];
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
    saveTaskLogs([{ ...entry, createdAt: Date.now() }, ...getTaskLogs()]);
    renderTaskLog();
  }

  function getConversationSuggestionsStore() {
    const store = GM_getValue(CONVERSATION_SUGGESTIONS_KEY, {});
    return store && typeof store === 'object' && !Array.isArray(store) ? store : {};
  }

  function setConversationSuggestions(profileId, record) {
    const store = getConversationSuggestionsStore();
    store[profileId] = record;
    GM_setValue(CONVERSATION_SUGGESTIONS_KEY, store);
  }

  function getPartnerSummaries() {
    const summaries = GM_getValue(PARTNER_SUMMARIES_KEY, {});
    return summaries && typeof summaries === 'object' && !Array.isArray(summaries) ? summaries : {};
  }

  function getPartnerSummary(profileId) {
    const record = getPartnerSummaries()[profileId];
    return record && typeof record.summary === 'string' ? record : null;
  }

  function setPartnerSummary(profileId, record) {
    const summaries = getPartnerSummaries();
    summaries[profileId] = record;
    GM_setValue(PARTNER_SUMMARIES_KEY, summaries);
  }

  function getPartnerSummarySeen() {
    const seen = GM_getValue(PARTNER_SUMMARY_SEEN_KEY, {});
    return seen && typeof seen === 'object' && !Array.isArray(seen) ? seen : {};
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
    return batches && typeof batches === 'object' && !Array.isArray(batches) ? batches : {};
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
    if (batch.some((item) => item.messageId === message.messageId)) {
      return batch;
    }
    const nextBatch = [...batch, message].slice(-PROFILE_BATCH_SIZE * 3);
    setPartnerProfileBatch(profileId, nextBatch);
    return nextBatch;
  }

  function getPartnerProfiles() {
    const profiles = GM_getValue(PARTNER_PROFILES_KEY, {});
    return profiles && typeof profiles === 'object' && !Array.isArray(profiles) ? profiles : {};
  }

  function getPartnerProfileForId(profileId) {
    const profiles = getPartnerProfiles();
    if (Object.prototype.hasOwnProperty.call(profiles, profileId)) {
      return profiles[profileId];
    }
    return loadSettings().partnerProfile || '';
  }

  function setPartnerProfiles(nextProfiles) {
    GM_setValue(PARTNER_PROFILES_KEY, nextProfiles);
  }

  function schedulePartnerProfileBatch(profileId, latestMessage = null) {
    const batch = getPartnerProfileBatch(profileId);
    if (batch.length < PROFILE_BATCH_SIZE || state.profilePending.has(profileId) || state.profileUpdating.has(profileId)) {
      return;
    }
    if ((state.profileRetryAt.get(profileId) || 0) > Date.now()) {
      return;
    }

    const lastMessage = latestMessage || batch[batch.length - 1];
    state.profilePending.set(profileId, {
      profileId,
      messageId: lastMessage.messageId,
      messages: batch.slice(-PROFILE_BATCH_SIZE),
      latestMessage: { speaker: 'them', text: lastMessage.text },
      existingSummary: getPartnerSummary(profileId)?.summary || '',
      context: buildPromptContext({ speaker: 'them', text: lastMessage.text }),
      conversationId: getConversationId(),
      conversationName: getConversationName(),
    });
    runPartnerSummaryQueue();
  }

  function getApiKey() {
    const settings = loadSettings();
    const windowKey = typeof unsafeWindow !== 'undefined' ? unsafeWindow.OPENROUTER_API_KEY : '';
    return settings.openRouterApiKey || ENV_OPENROUTER_API_KEY || windowKey || '';
  }

  function getConversationId() {
    const match = location.pathname.match(/\/i\/chat\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function getConversationName() {
    return document.querySelector('[data-testid="dm-conversation-username"]')?.textContent?.trim() || '';
  }

  function normalizeId(value) {
    return String(value || '').trim().replace(/^@/, '').toLowerCase();
  }

  function isTweetDetailPage() {
    return /^\/[^/]+\/status\/\d+/.test(location.pathname);
  }

  function getTweetStatusId() {
    const match = location.pathname.match(/\/status\/(\d+)/);
    return match ? match[1] : '';
  }

  function getArticleStatusId(article) {
    if (!article) return '';
    const link = article.querySelector('a[href*="/status/"]');
    if (!link) return '';
    const href = link.getAttribute('href') || '';
    const match = href.match(/\/status\/(\d+)/);
    return match ? match[1] : '';
  }

  function getMainTweetArticle() {
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryColumn) {
      return null;
    }
    return primaryColumn.querySelector('article[data-testid="tweet"]');
  }

  function getTweetAuthorFromArticle(article) {
    const link = article?.querySelector('a[role="link"][href^="/"]');
    const href = link?.getAttribute('href') || '';
    const match = href.match(/^\/([^/]+)/);
    return match ? match[1] : '';
  }

  function getMainTweetAuthor() {
    return getTweetAuthorFromArticle(getMainTweetArticle());
  }

  function getTweetTextNode(article) {
    return article?.querySelector('[data-testid="tweetText"]');
  }

  function findMatchingTarget() {
    const { targetXIds } = loadSettings();
    const conversationId = normalizeId(getConversationId());
    const conversationName = normalizeId(getConversationName());
    const tweetAuthor = normalizeId(getMainTweetAuthor());

    return targetXIds
      .map(normalizeId)
      .filter(Boolean)
      .find((target) => {
        if (target === '*') {
          return true;
        }
        if (conversationId) {
          return conversationId === target || conversationId.includes(target) || conversationName.includes(target);
        }
        if (tweetAuthor) {
          return tweetAuthor === target || tweetAuthor.includes(target);
        }
        return false;
      });
  }

  function isTargetConversation() {
    return Boolean(findMatchingTarget());
  }

  function getPartnerProfileId() {
    return (
      findMatchingTarget() || normalizeId(getConversationId()) || normalizeId(getMainTweetAuthor()) || ''
    );
  }

  function getMessageId(textNode) {
    const testId = textNode.getAttribute('data-testid') || '';
    return testId.replace(/^message-text-/, '');
  }

  function getMessageShell(textNode) {
    const id = getMessageId(textNode);
    return id ? document.querySelector(`[data-testid="message-${CSS.escape(id)}"]`) : null;
  }

  function isIncomingMessage(textNode) {
    const shell = getMessageShell(textNode);
    return shell ? shell.className.includes('justify-start') : false;
  }

  function cleanMessageText(text) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^\d{1,2}:\d{2}$/.test(line) && line !== 'Today' && line !== 'New')
      .join('\n')
      .trim();
  }

  function hasJapaneseText(text) {
    return /[ぁ-んァ-ンー]/.test(text);
  }

  function getConversationMessages(limit = CHAT_CONTEXT_SIZE, includeId = false) {
    return [...document.querySelectorAll('[data-testid^="message-text-"]')]
      .map((node) => {
        const text = cleanMessageText(node.innerText || '');
        if (!text) {
          return null;
        }
        const base = {
          speaker: isIncomingMessage(node) ? 'them' : 'me',
          text,
        };
        return includeId ? { ...base, messageId: getMessageId(node) } : base;
      })
      .filter(Boolean)
      .slice(-limit);
  }

  function getVisibleConversationMessagesForProfile(limit = CHAT_CONTEXT_SIZE) {
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
        me: {
          profile: settings.myProfile,
        },
        them: {
          profileId,
          displayName: getConversationName(),
          xProfile: getPartnerProfileForId(profileId),
          summary: summary?.summary || '',
        },
      },
      messages: getConversationMessages().map((message) =>
        `${message.speaker === 'me' ? '【我】' : '【对方】'}${message.text}`,
      ),
      latestMessage,
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
        me: {
          profile: settings.myProfile,
        },
        them: {
          profileId,
          displayName: author,
          xProfile: getPartnerProfileForId(profileId),
          summary: summary?.summary || '',
        },
      },
      messages: [],
      latestMessage: { speaker: 'them', text: tweetText },
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
    return `translation:v2:${MODEL}:tweet:${normalizeId(author) || 'unknown'}:${statusId}:${hashText(text)}`;
  }

  function startTask(kind, label) {
    state.totalTasks += 1;
    state.activeTasks += 1;
    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pushTaskLog({
      id: taskId,
      kind,
      label,
      status: 'running',
    });
    updateProgressBar();
    return {
      id: taskId,
      finish(detail = '') {
        state.finishedTasks += 1;
        state.activeTasks -= 1;
        pushTaskLog({
          id: taskId,
          kind,
          label,
          detail,
          status: 'done',
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
          status: 'error',
        });
        updateProgressBar();
      },
    };
  }

  function requestOpenRouter(messages, options = {}) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('缺少 OpenRouter API key');
    }

    const task = startTask(options.taskType || 'llm', options.taskLabel || 'OpenRouter');
    const payload = {
      model: MODEL,
      provider: {
        only: ['cloudflare'],
      },
      messages,
      reasoning: {
        effort: 'medium',
        exclude: true,
      },
      temperature: options.temperature ?? 0.2,
      max_completion_tokens: options.maxCompletionTokens ?? MAX_COMPLETION_TOKENS,
    };
    if (options.responseFormat) {
      payload.response_format = options.responseFormat;
    }

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: OPENROUTER_URL,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': location.origin,
          'X-OpenRouter-Title': 'X DM Translator',
        },
        data: JSON.stringify(payload),
        timeout: 60000,
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
            reject(new Error('OpenRouter 返回为空'));
            return;
          }
          if (options.responseFormat?.type === 'json_schema') {
            try {
              resolve(JSON.parse(content));
            } catch (error) {
              reject(new Error('OpenRouter JSON 解析失败'));
            }
            return;
          }
          resolve(content.trim());
        },
        onerror: () => reject(new Error('OpenRouter 请求失败')),
        ontimeout: () => reject(new Error('OpenRouter 请求超时')),
      });
    })
      .then((result) => {
        task.finish();
        return result;
      })
      .catch((error) => {
        task.fail(error);
        throw error;
      });
  }

  function translateIncomingMessage(text, context) {
    return requestOpenRouter(
      [
        {
          role: 'system',
          content: getPrompt('incomingTranslation'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            context,
            targetMessage: text,
          }),
        },
      ],
      {
        temperature: 0.1,
        maxCompletionTokens: MAX_COMPLETION_TOKENS,
        responseFormat: INCOMING_TRANSLATION_FORMAT,
        taskType: 'translation',
        taskLabel: '翻译私信',
      },
    ).then((data) => data.translation.trim());
  }

  function translateReply(text) {
    const context = buildPromptContext({ speaker: 'me', text });
    return requestOpenRouter(
      [
        {
          role: 'system',
          content: getPrompt('replyTranslation'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            context,
            chineseDraft: text,
          }),
        },
      ],
      {
        temperature: 0.45,
        maxCompletionTokens: MAX_COMPLETION_TOKENS,
        responseFormat: REPLY_OPTIONS_FORMAT,
        taskType: 'reply',
        taskLabel: '生成日语候选',
      },
    ).then((data) => data.options);
  }

  function updatePartnerSummary(task) {
    return requestOpenRouter(
      [
        {
          role: 'system',
          content: getPrompt('partnerSummary'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            existingSummary: task.existingSummary,
            context: task.context,
            newIncomingMessages: task.messages,
            latestMessage: task.latestMessage,
          }),
        },
      ],
      {
        temperature: 0.2,
        maxCompletionTokens: MAX_COMPLETION_TOKENS,
        responseFormat: PARTNER_SUMMARY_FORMAT,
        taskType: 'profile',
        taskLabel: '更新画像',
      },
    ).then((data) => data.summary.trim());
  }

  function generateConversationSuggestions(latestText, context) {
    return requestOpenRouter(
      [
        { role: 'system', content: getPrompt('conversationSuggestions') },
        {
          role: 'user',
          content: JSON.stringify({
            context,
            latestIncomingMessage: latestText,
          }),
        },
      ],
      {
        temperature: 0.55,
        maxCompletionTokens: MAX_COMPLETION_TOKENS,
        responseFormat: CONVERSATION_SUGGESTIONS_FORMAT,
        taskType: 'suggestion',
        taskLabel: '生成建议',
      },
    ).then((data) => data.suggestions);
  }

  function buildTranslationNode(text) {
    const row = document.createElement('div');
    row.className = `${SCRIPT_ID}-translation-row`;
    const node = document.createElement('div');
    node.className = `${SCRIPT_ID}-translation`;
    node.textContent = text;
    row.appendChild(node);
    return row;
  }

  function ensureTranslationSlot(textNode) {
    const messageId = getMessageId(textNode);
    const shell = getMessageShell(textNode);
    const existing = shell?.nextElementSibling?.classList.contains(`${SCRIPT_ID}-translation-row`)
      ? shell.nextElementSibling
      : null;
    if (existing) {
      return existing.querySelector(`.${SCRIPT_ID}-translation`);
    }

    document
      .querySelectorAll(`.${SCRIPT_ID}-translation-row[data-message-id="${messageId}"]`)
      .forEach((row) => row.remove());

    const isIncoming = isIncomingMessage(textNode);
    const row = buildTranslationNode('…');
    row.dataset.messageId = messageId;
    row.classList.toggle('is-incoming', isIncoming);
    row.classList.toggle('is-outgoing', !isIncoming);
    (shell || textNode).insertAdjacentElement('afterend', row);
    return row.querySelector(`.${SCRIPT_ID}-translation`);
  }

  function renderTranslation(textNode, text) {
    const slot = ensureTranslationSlot(textNode);
    slot.textContent = text;
    slot.classList.remove(`${SCRIPT_ID}-error`);
  }

  function markTranslationError(textNode, error) {
    const slot = ensureTranslationSlot(textNode);
    slot.textContent = error.message;
    slot.classList.add(`${SCRIPT_ID}-error`);
  }

  function enqueueTranslation(textNode, text) {
    const messageId = getMessageId(textNode);
    const cacheKey = getTranslationCacheKey(messageId, text);
    const cached = getCachedTranslation(cacheKey);
    if (cached) {
      renderTranslation(textNode, cached.translation);
      return;
    }

    if (state.translating.has(cacheKey)) {
      return;
    }

    state.translating.add(cacheKey);
    const slot = ensureTranslationSlot(textNode);
    slot.textContent = '…';
    slot.classList.remove(`${SCRIPT_ID}-error`);

    state.pending.set(cacheKey, {
      cacheKey,
      conversationId: getConversationId(),
      conversationName: getConversationName(),
      messageId,
      text,
      textNode,
      context: buildPromptContext({ speaker: isIncomingMessage(textNode) ? 'them' : 'me', text }),
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
      translateIncomingMessage(task.text, task.context)
        .then((translated) => {
          setCachedTranslation(cacheKey, {
            conversationId: task.conversationId,
            conversationName: task.conversationName,
            profileId: getPartnerProfileId(),
            messageId: task.messageId,
            source: task.text,
            translation: translated,
            createdAt: Date.now(),
          });
          renderTranslation(task.textNode, translated);
        })
        .catch((error) => markTranslationError(task.textNode, error))
        .finally(() => {
          state.activeTranslations -= 1;
          state.translating.delete(cacheKey);
          runTranslationQueue();
        });
    }
  }

  function enqueuePartnerSummaryUpdate(textNode, text) {
    if (!isIncomingMessage(textNode)) {
      return;
    }

    const profileId = getPartnerProfileId();
    const messageId = getMessageId(textNode);
    if (!profileId || !messageId || hasSeenPartnerSummaryMessage(profileId, messageId)) {
      return;
    }

    markPartnerSummaryMessageSeen(profileId, messageId);
    appendPartnerProfileBatchMessage(profileId, {
      messageId,
      speaker: 'them',
      text,
      createdAt: Date.now(),
    });
    schedulePartnerProfileBatch(profileId, { messageId, text });
  }

  function runPartnerSummaryQueue() {
    for (const [taskId, task] of state.profilePending) {
      if (state.profileUpdating.has(task.profileId)) {
        continue;
      }

      state.profilePending.delete(taskId);

      state.profileUpdating.add(task.profileId);
      task.existingSummary = getPartnerSummary(task.profileId)?.summary || task.existingSummary;

      updatePartnerSummary(task)
        .then((summary) => {
          state.profileRetryAt.delete(task.profileId);
          const batch = getPartnerProfileBatch(task.profileId);
          const summarizedIds = new Set(task.messages.map((message) => message.messageId));
          setPartnerProfileBatch(
            task.profileId,
            batch.filter((message) => !summarizedIds.has(message.messageId)),
          );
          setPartnerSummary(task.profileId, {
            summary,
            profileId: task.profileId,
            conversationId: task.conversationId,
            conversationName: task.conversationName,
            updatedAt: Date.now(),
            lastMessageId: task.messageId,
          });
        })
        .catch((error) => {
          state.profileRetryAt.set(task.profileId, Date.now() + 180000);
          console.warn('[X DM OpenRouter Translator] 画像更新失败', error);
        })
        .finally(() => {
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
    const panel = document.getElementById(`${SCRIPT_ID}-suggestions`);
    if (panel) {
      panel.replaceChildren();
    }
  }

  function generateAndRenderConversationSuggestions(profileId, latestMessage) {
    return generateConversationSuggestions(latestMessage.text, buildPromptContext(latestMessage))
      .then((items) => {
        state.suggestionRetryAt.delete(profileId);
        setConversationSuggestions(profileId, {
          profileId,
          lastMessageId: latestMessage.messageId,
          suggestions: items,
          updatedAt: Date.now(),
        });
        renderSuggestionChoices(items);
        return items;
      })
      .catch((error) => {
        state.suggestionRetryAt.set(profileId, Date.now() + 180000);
        console.warn('[X DM OpenRouter Translator] 建议生成失败', error);
        throw error;
      });
  }

  function maybeGenerateConversationSuggestions(profileId, latestMessage) {
    if (!profileId || !latestMessage) {
      return Promise.resolve();
    }

    if (
      state.suggestionUpdating.has(profileId) ||
      (state.suggestionRetryAt.get(profileId) || 0) > Date.now()
    ) {
      return Promise.resolve();
    }

    state.suggestionUpdating.add(profileId);
    return generateAndRenderConversationSuggestions(profileId, latestMessage).finally(() =>
      state.suggestionUpdating.delete(profileId),
    );
  }

  function refreshConversationSuggestions() {
    const profileId = getPartnerProfileId();
    const latestMessage = getLatestConversationMessage();
    if (!profileId || !latestMessage) {
      return Promise.resolve();
    }
    state.suggestionRetryAt.delete(profileId);
    clearConversationSuggestions(profileId);
    return maybeGenerateConversationSuggestions(profileId, latestMessage);
  }

  function handleSuggestButtonClick() {
    const button = document.getElementById(`${SCRIPT_ID}-suggest-button`);
    const profileId = getPartnerProfileId();
    const latestMessage = getLatestConversationMessage();
    if (!profileId || !latestMessage) {
      return;
    }

    if (state.suggestionUpdating.has(profileId)) {
      return;
    }

    state.suggestionRetryAt.delete(profileId);
    clearConversationSuggestions(profileId);
    if (button) {
      button.textContent = '⏳';
    }
    maybeGenerateConversationSuggestions(profileId, latestMessage).finally(() => {
      if (button) {
        button.textContent = '🤔';
      }
    });
  }

  function handleLatestMessageChange() {
    const latestMessage = getLatestConversationMessage();
    if (!latestMessage) {
      return;
    }

    const latestKey = `${latestMessage.messageId}:${hashText(latestMessage.text)}`;
    if (state.lastSeenLatestMessageKey === latestKey) {
      return;
    }
    state.lastSeenLatestMessageKey = latestKey;

    const profileId = getPartnerProfileId();
    if (!profileId) {
      return;
    }

    // Suggestions are now triggered manually via the 🤔 button.
  }

  function scanMessages() {
    const settings = loadSettings();
    if (!isTargetConversation() || !getApiKey()) {
      return;
    }

    state.scannedMessageKeys.clear();
    const nodes = [...document.querySelectorAll('[data-testid^="message-text-"]')].slice(-settings.maxMessagesPerScan);
    for (const textNode of nodes) {
      const text = cleanMessageText(textNode.innerText || '');
      if (!text) {
        continue;
      }

      enqueuePartnerSummaryUpdate(textNode, text);

      if (!settings.autoTranslate) {
        continue;
      }

      if (!hasJapaneseText(text)) {
        continue;
      }

      const messageId = getMessageId(textNode);
      const scanKey = `${messageId}:${hashText(text)}`;
      if (state.scannedMessageKeys.has(scanKey)) {
        continue;
      }
      state.scannedMessageKeys.add(scanKey);

      const existing = document.querySelector(`.${SCRIPT_ID}-translation-row[data-message-id="${messageId}"] .${SCRIPT_ID}-translation`);
      if (existing && !existing.classList.contains(`${SCRIPT_ID}-error`)) {
        continue;
      }

      enqueueTranslation(textNode, text);
    }

    handleLatestMessageChange();
  }

  function removeLegacyTranslationNodes() {
    document.querySelectorAll(`.${SCRIPT_ID}-translation`).forEach((node) => {
      if (!node.closest(`.${SCRIPT_ID}-translation-row`)) {
        node.remove();
      }
    });
  }

  function findComposerForm() {
    return (
      document.querySelector('[data-testid="dm-composer-form"]') || findTweetComposerContainer()
    );
  }

  function findComposerTextarea() {
    return (
      document.querySelector('[data-testid="dm-composer-textarea"]') ||
      document.querySelector('[data-testid="tweetTextarea_0"]')
    );
  }

  function findTweetComposerContainer() {
    const textarea = document.querySelector('[data-testid="tweetTextarea_0"]');
    const button = document.querySelector(
      '[data-testid="tweetButton"], [data-testid="tweetButtonInline"], [data-testid="tweetButtonDisabled"]',
    );
    if (!textarea || !button) {
      return null;
    }

    const textareaAncestors = new Set();
    let element = textarea;
    while (element) {
      textareaAncestors.add(element);
      element = element.parentElement;
    }

    element = button;
    while (element) {
      if (textareaAncestors.has(element)) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  function createProgressBar() {
    const wrap = document.createElement('div');
    wrap.id = `${SCRIPT_ID}-progress`;
    wrap.innerHTML = `<span></span>`;
    return wrap;
  }

  function ensureProgressBar() {
    const form = findComposerForm();
    if (!form) {
      return null;
    }

    let progress = document.getElementById(`${SCRIPT_ID}-progress`);
    if (!progress) {
      progress = createProgressBar();
    }

    if (progress.parentElement !== form) {
      form.prepend(progress);
    }
    if (form.dataset.testid === 'tweetTextarea_0_label' || form.querySelector('[data-testid="tweetTextarea_0"]')) {
      form.classList.add(`${SCRIPT_ID}-tweet-composer`);
    }
    return progress;
  }

  function updateProgressBar() {
    const progress = ensureProgressBar();
    if (!progress) {
      return;
    }

    const bar = progress.querySelector('span');
    const total = Math.max(state.totalTasks, 1);
    const done = Math.min(state.finishedTasks, total);
    const percent = state.activeTasks ? Math.max(6, Math.round((done / total) * 100)) : 100;
    bar.style.width = `${percent}%`;
    progress.classList.toggle('is-active', state.activeTasks > 0);
    progress.title = state.activeTasks ? `${done}/${total}` : '';
    if (!state.activeTasks && state.totalTasks) {
      window.setTimeout(() => {
        if (!state.activeTasks) {
          state.totalTasks = 0;
          state.finishedTasks = 0;
          bar.style.width = '0';
          progress.classList.remove('is-active');
        }
      }, 1200);
    }
  }

  function ensureSuggestionsPanel() {
    const form = findComposerForm();
    if (!form) {
      return null;
    }

    let panel = document.getElementById(`${SCRIPT_ID}-suggestions`);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = `${SCRIPT_ID}-suggestions`;
      panel.addEventListener('click', (event) => {
        const button = event.target.closest(`.${SCRIPT_ID}-suggestion`);
        if (button?.dataset.draft) {
          setReplyDraftAndTranslate(button.dataset.draft);
        }
        if (event.target.closest(`.${SCRIPT_ID}-suggestion-refresh`)) {
          refreshConversationSuggestions();
        }
      });
    }

    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    positionSuggestionsPanel();
    return panel;
  }

  function positionSuggestionsPanel() {
    const panel = document.getElementById(`${SCRIPT_ID}-suggestions`);
    const form = findComposerForm();
    if (!panel || !form) {
      return;
    }

    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    const viewportWidth = window.innerWidth;
    const canDockRight = primaryColumn && viewportWidth > 1024;

    if (canDockRight) {
      const rect = primaryColumn.getBoundingClientRect();
      const gap = 12;
      const width = Math.min(320, Math.max(220, viewportWidth - rect.right - gap * 2));
      panel.style.position = 'fixed';
      panel.style.left = `${Math.round(rect.right + gap)}px`;
      panel.style.right = 'auto';
      panel.style.width = `${Math.round(width)}px`;
      panel.style.top = `${Math.round(rect.top + gap)}px`;
      panel.style.bottom = 'auto';
      panel.style.maxHeight = `${Math.round(rect.height - gap * 2)}px`;
      panel.classList.add('is-right');
    } else {
      const formRect = form.getBoundingClientRect();
      const replyButtonRect = document.getElementById(`${SCRIPT_ID}-reply-button`)?.getBoundingClientRect();
      const right = replyButtonRect?.right || formRect.right;
      panel.style.position = 'fixed';
      panel.style.left = `${Math.round(formRect.left)}px`;
      panel.style.right = 'auto';
      panel.style.width = `${Math.round(right - formRect.left)}px`;
      panel.style.top = 'auto';
      panel.style.bottom = `${Math.round(window.innerHeight - formRect.top + 8)}px`;
      panel.style.maxHeight = '';
      panel.classList.remove('is-right');
    }
  }

  function setReplyDraftAndTranslate(text) {
    ensureReplyButton();
    const panel = getReplyPanel();
    panel.classList.add('is-open');
    panel.querySelector(`.${SCRIPT_ID}-reply-input`).value = text;
    placeReplyPanel();
    handleReplyTranslate();
  }

  function renderSuggestionChoices(suggestions) {
    const panel = ensureSuggestionsPanel();
    if (!panel) {
      return;
    }

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = `${SCRIPT_ID}-suggestion-refresh`;
    refreshButton.title = '刷新建议';
    refreshButton.textContent = '↻';

    panel.replaceChildren(
      refreshButton,
      ...suggestions.slice(0, 3).map((suggestion) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${SCRIPT_ID}-suggestion`;
        button.dataset.draft = suggestion.draft;
        button.innerHTML = `<strong></strong><span></span>`;
        button.querySelector('strong').textContent = suggestion.label;
        button.querySelector('span').textContent = suggestion.draft || suggestion.note;
        button.title = suggestion.note;
        return button;
      }),
    );
  }

  function renderStoredSuggestionChoices() {
    const record = getConversationSuggestionsStore()[getPartnerProfileId()];
    const panel = document.getElementById(`${SCRIPT_ID}-suggestions`);
    if (!panel) {
      return;
    }
    if (record?.suggestions?.length) {
      renderSuggestionChoices(record.suggestions);
    } else {
      panel.replaceChildren();
    }
  }

  function setComposerValue(value) {
    const textarea = findComposerTextarea();
    if (!textarea) {
      throw new Error('找不到输入框');
    }

    if (textarea.getAttribute('contenteditable') === 'true' || textarea.isContentEditable) {
      setContentEditableValue(textarea, value);
      return;
    }

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, value);
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.focus();
  }

  function setContentEditableValue(element, value) {
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.deleteContents();
    const textNode = document.createTextNode(value);
    range.insertNode(textNode);
    range.selectNodeContents(textNode);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.focus();
  }

  function ensureReplyButton() {
    const form = findComposerForm();
    if (!form) {
      return;
    }

    let button = document.getElementById(`${SCRIPT_ID}-reply-button`);
    if (!button) {
      button = document.createElement('button');
      button.id = `${SCRIPT_ID}-reply-button`;
      button.type = 'button';
      button.textContent = '译';
      button.title = '翻译';
      button.addEventListener('click', toggleReplyPanel);
    }

    if (button.parentElement !== form.parentElement) {
      form.insertAdjacentElement('afterend', button);
    }

    let suggestButton = document.getElementById(`${SCRIPT_ID}-suggest-button`);
    if (!suggestButton) {
      suggestButton = document.createElement('button');
      suggestButton.id = `${SCRIPT_ID}-suggest-button`;
      suggestButton.type = 'button';
      suggestButton.textContent = '🤔';
      suggestButton.title = '建议对话';
      suggestButton.addEventListener('click', handleSuggestButtonClick);
    }

    if (suggestButton.parentElement !== form.parentElement) {
      button.insertAdjacentElement('afterend', suggestButton);
    }
  }

  function getReplyPanel() {
    let panel = document.getElementById(`${SCRIPT_ID}-reply-panel`);
    if (panel) {
      return panel;
    }

    panel = document.createElement('div');
    panel.id = `${SCRIPT_ID}-reply-panel`;
    panel.innerHTML = `
      <textarea class="${SCRIPT_ID}-reply-input" rows="4" placeholder="中文"></textarea>
      <div class="${SCRIPT_ID}-reply-actions">
        <button type="button" class="${SCRIPT_ID}-reply-submit">翻译</button>
        <button type="button" class="${SCRIPT_ID}-reply-close">关闭</button>
      </div>
      <div class="${SCRIPT_ID}-reply-status"></div>
      <div class="${SCRIPT_ID}-tone-list"></div>
    `;

    panel.querySelector(`.${SCRIPT_ID}-reply-submit`).addEventListener('click', handleReplyTranslate);
    panel.querySelector(`.${SCRIPT_ID}-reply-close`).addEventListener('click', () => panel.classList.remove('is-open'));
    panel.querySelector(`.${SCRIPT_ID}-tone-list`).addEventListener('click', (event) => {
      const button = event.target.closest(`.${SCRIPT_ID}-tone`);
      if (button?.dataset.text) {
        setComposerValue(button.dataset.text);
        panel.classList.remove('is-open');
      }
    });
    document.body.appendChild(panel);
    return panel;
  }

  function placeReplyPanel() {
    const button = document.getElementById(`${SCRIPT_ID}-reply-button`);
    const panel = document.getElementById(`${SCRIPT_ID}-reply-panel`);
    if (!button || !panel?.classList.contains('is-open')) {
      return;
    }

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
    const willOpen = !panel.classList.contains('is-open');
    panel.classList.toggle('is-open', willOpen);
    if (willOpen) {
      placeReplyPanel();
      panel.querySelector(`.${SCRIPT_ID}-reply-input`).focus();
    }
  }

  function setReplyStatus(text, isError = false) {
    const status = getReplyPanel().querySelector(`.${SCRIPT_ID}-reply-status`);
    status.textContent = text;
    status.classList.toggle(`${SCRIPT_ID}-error`, isError);
  }

  function renderToneChoices(options) {
    const list = getReplyPanel().querySelector(`.${SCRIPT_ID}-tone-list`);
    list.replaceChildren(
      ...options.map((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${SCRIPT_ID}-tone`;
        button.dataset.text = option.text;
        button.innerHTML = `<span></span><em></em><strong></strong>`;
        button.querySelector('span').textContent = option.label;
        button.querySelector('em').textContent = option.note;
        button.querySelector('strong').textContent = option.text;
        return button;
      }),
    );
    placeReplyPanel();
  }

  async function handleReplyTranslate() {
    const panel = getReplyPanel();
    const input = panel.querySelector(`.${SCRIPT_ID}-reply-input`);
    const text = input.value.trim();
    if (!text) {
      setReplyStatus('先写中文', true);
      return;
    }

    setReplyStatus('翻译中');
    panel.querySelector(`.${SCRIPT_ID}-tone-list`).replaceChildren();

    try {
      const options = await translateReply(text);
      setReplyStatus('');
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
      targetXIds: settings.targetXIds.join(', '),
      myProfile: settings.myProfile,
      autoTranslate: settings.autoTranslate,
      maxMessagesPerScan: settings.maxMessagesPerScan,
      maxConcurrentTranslations: settings.maxConcurrentTranslations,
      cacheLimit: settings.cacheLimit,
      taskLogLimit: settings.taskLogLimit,
    };

    for (const [name, value] of Object.entries(fields)) {
      const element = panel.querySelector(`[name="${name}"]`);
      if (!element) {
        continue;
      }
      if (typeof value === 'boolean') {
        element.checked = value;
      } else {
        element.value = value;
      }
    }

    panel.querySelector(`.${SCRIPT_ID}-current-summary`).textContent =
      getPartnerSummary(getPartnerProfileId())?.summary || '暂无';
    renderPromptRows();
    renderTaskLog();
    renderSettingStates();
    renderTargetChips();
    renderTargetProfileRows();
    setSettingsStatus('');
    panel.classList.add('is-open');
  }

  function getSettingsPanel() {
    let panel = document.getElementById(`${SCRIPT_ID}-settings-panel`);
    if (panel) {
      return panel;
    }

    panel = document.createElement('div');
    panel.id = `${SCRIPT_ID}-settings-panel`;
    panel.className = `${SCRIPT_ID}-modal`;
    panel.innerHTML = `
      <div class="${SCRIPT_ID}-modal-head">
        <strong>翻译设置</strong>
        <button type="button" data-action="close">关闭</button>
      </div>
      <section class="${SCRIPT_ID}-settings-section">
        <h3>基础</h3>
        <label>OpenRouter Key<span class="${SCRIPT_ID}-setting-state" data-setting-state="openRouterApiKey"></span><input name="openRouterApiKey" type="password" autocomplete="off"></label>
        <div class="${SCRIPT_ID}-target-section">
          <label>目标会话 / 推文作者 X ID<span class="${SCRIPT_ID}-setting-state" data-setting-state="targetXIds"></span></label>
          <div class="${SCRIPT_ID}-target-chips" id="${SCRIPT_ID}-target-chips"></div>
          <div class="${SCRIPT_ID}-target-add">
            <input type="text" data-target-input placeholder="输入 X ID 或 *">
            <button type="button" data-action="add-target">添加</button>
            <button type="button" data-action="use-current-target">当前目标</button>
          </div>
          <input type="hidden" name="targetXIds">
        </div>
        <div class="${SCRIPT_ID}-target-profiles" id="${SCRIPT_ID}-target-profiles"></div>
        <label>我的资料<span class="${SCRIPT_ID}-setting-state" data-setting-state="myProfile"></span><textarea name="myProfile" rows="4" placeholder="性别、称呼、自称、关系"></textarea></label>
      </section>
      <section class="${SCRIPT_ID}-settings-section">
        <div class="${SCRIPT_ID}-section-head">
          <h3>行为</h3>
          <button type="button" data-action="restore-behavior">恢复行为</button>
        </div>
        <div class="${SCRIPT_ID}-check-grid">
          <label class="${SCRIPT_ID}-check"><input name="autoTranslate" type="checkbox">自动翻译<span class="${SCRIPT_ID}-setting-state" data-setting-state="autoTranslate"></span></label>
        </div>
        <div class="${SCRIPT_ID}-settings-grid">
          <label>扫描条数<span class="${SCRIPT_ID}-setting-state" data-setting-state="maxMessagesPerScan"></span><input name="maxMessagesPerScan" type="number" min="5" max="80"></label>
          <label>并发数<span class="${SCRIPT_ID}-setting-state" data-setting-state="maxConcurrentTranslations"></span><input name="maxConcurrentTranslations" type="number" min="1" max="6"></label>
          <label>缓存上限<span class="${SCRIPT_ID}-setting-state" data-setting-state="cacheLimit"></span><input name="cacheLimit" type="number" min="50" max="3000"></label>
          <label>日志上限<span class="${SCRIPT_ID}-setting-state" data-setting-state="taskLogLimit"></span><input name="taskLogLimit" type="number" min="20" max="1000"></label>
        </div>
      </section>
      <section class="${SCRIPT_ID}-settings-section">
        <div class="${SCRIPT_ID}-section-head">
          <h3>提示词</h3>
          <button type="button" data-action="restore-prompts">全部恢复</button>
        </div>
        <div class="${SCRIPT_ID}-prompt-list"></div>
      </section>
      <section class="${SCRIPT_ID}-settings-section">
        <h3>当前画像</h3>
        <div class="${SCRIPT_ID}-current-summary">暂无</div>
      </section>
      <section class="${SCRIPT_ID}-settings-section">
        <h3>日志</h3>
        <div class="${SCRIPT_ID}-task-log"></div>
      </section>
      <div class="${SCRIPT_ID}-settings-actions">
        <button type="button" data-action="save" class="${SCRIPT_ID}-primary">保存</button>
        <button type="button" data-action="use-current">当前目标</button>
        <button type="button" data-action="cache">查看缓存</button>
        <button type="button" data-action="clear-cache">清空缓存</button>
      </div>
      <div class="${SCRIPT_ID}-settings-status"></div>
    `;

    panel.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-action]');
      if (!trigger) {
        return;
      }
      const action = trigger.dataset.action;
      const promptKey = trigger.dataset.prompt;
      if (action === 'close') {
        panel.classList.remove('is-open');
      }
      if (action === 'save') {
        saveSettingsFromPanel();
      }
      if (action === 'use-current' || action === 'use-current-target') {
        useCurrentConversationAsTarget();
      }
      if (action === 'add-target') {
        addTargetFromPanelInput();
      }
      if (action === 'remove-target') {
        removeTargetFromPanel(trigger.dataset.targetId);
      }
      if (action === 'cache') {
        openCachePanel();
      }
      if (action === 'clear-cache') {
        clearCacheWithConfirm();
      }
      if (action === 'restore-prompts') {
        restoreAllDefaults();
      }
      if (action === 'restore-behavior') {
        restoreBehaviorDefaults();
      }
      if (action === 'edit-prompt') {
        openPromptEditor(promptKey);
      }
      if (action === 'restore-prompt') {
        restorePromptDefault(promptKey);
      }
    });

    document.body.appendChild(panel);
    panel.querySelector('[data-target-input]')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addTargetFromPanelInput();
      }
    });
    return panel;
  }

  function saveSettingsFromPanel() {
    const panel = getSettingsPanel();
    const partnerProfiles = getPartnerProfiles();
    panel.querySelectorAll('[data-partner-profile]').forEach((textarea) => {
      const id = textarea.dataset.partnerProfile;
      if (id) {
        partnerProfiles[id] = textarea.value.trim();
      }
    });
    setPartnerProfiles(partnerProfiles);

    saveSettings({
      openRouterApiKey: panel.querySelector('[name="openRouterApiKey"]').value.trim(),
      targetXIds: panel
        .querySelector('[name="targetXIds"]')
        .value.split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      autoTranslate: panel.querySelector('[name="autoTranslate"]').checked,
      myProfile: panel.querySelector('[name="myProfile"]').value.trim(),
      maxMessagesPerScan: panel.querySelector('[name="maxMessagesPerScan"]').value,
      maxConcurrentTranslations: panel.querySelector('[name="maxConcurrentTranslations"]').value,
      cacheLimit: panel.querySelector('[name="cacheLimit"]').value,
      taskLogLimit: panel.querySelector('[name="taskLogLimit"]').value,
    });
    setSettingsStatus('已保存');
    renderSettingStates();
    scanMessages();
    runTranslationQueue();
  }

  function setSettingsStatus(text, isError = false) {
    const status = getSettingsPanel().querySelector(`.${SCRIPT_ID}-settings-status`);
    status.textContent = text;
    status.classList.toggle(`${SCRIPT_ID}-error`, isError);
  }

  const PROMPT_LABELS = {
    incomingTranslation: '私信翻译',
    replyTranslation: '回复翻译',
    conversationSuggestions: '建议对话',
    partnerSummary: '画像总结',
  };

  const BEHAVIOR_SETTING_KEYS = [
    'autoTranslate',
    'maxMessagesPerScan',
    'maxConcurrentTranslations',
    'cacheLimit',
    'taskLogLimit',
  ];

  function normalizeSettingValue(value) {
    return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }

  function renderSettingStates() {
    const panel = document.getElementById(`${SCRIPT_ID}-settings-panel`);
    if (!panel) {
      return;
    }

    const settings = loadSettings();
    panel.querySelectorAll('[data-setting-state]').forEach((node) => {
      const key = node.dataset.settingState;
      const isDefault = normalizeSettingValue(settings[key]) === normalizeSettingValue(DEFAULT_SETTINGS[key]);
      node.textContent = isDefault ? '默认' : '已修改';
      node.classList.toggle('is-dirty', !isDefault);
    });
  }

  function restoreBehaviorDefaults() {
    const nextSettings = {};
    for (const key of BEHAVIOR_SETTING_KEYS) {
      nextSettings[key] = DEFAULT_SETTINGS[key];
    }
    saveSettings(nextSettings);
    openSettingsPanel();
    setSettingsStatus('已恢复');
  }

  function renderPromptRows() {
    const panel = document.getElementById(`${SCRIPT_ID}-settings-panel`);
    const list = panel?.querySelector(`.${SCRIPT_ID}-prompt-list`);
    if (!list) {
      return;
    }

    list.replaceChildren(
      ...Object.keys(DEFAULT_PROMPTS).map((promptKey) => {
        const isDefault = isPromptDefault(promptKey);
        const status = isDefault ? '默认' : '已修改';
        const row = document.createElement('div');
        row.className = `${SCRIPT_ID}-prompt-row`;
        row.innerHTML = `
          <strong></strong>
          <span class="${SCRIPT_ID}-prompt-state ${isDefault ? '' : 'is-dirty'}">${status}</span>
          <button type="button" data-action="edit-prompt" data-prompt="${promptKey}">编辑</button>
          <button type="button" data-action="restore-prompt" data-prompt="${promptKey}">恢复</button>
        `;
        row.querySelector('strong').textContent = PROMPT_LABELS[promptKey];
        return row;
      }),
    );
  }

  function getPromptEditor() {
    let panel = document.getElementById(`${SCRIPT_ID}-prompt-editor`);
    if (panel) {
      return panel;
    }

    panel = document.createElement('div');
    panel.id = `${SCRIPT_ID}-prompt-editor`;
    panel.className = `${SCRIPT_ID}-modal ${SCRIPT_ID}-prompt-editor`;
    panel.innerHTML = `
      <div class="${SCRIPT_ID}-modal-head">
        <strong></strong>
        <button type="button" data-action="close">关闭</button>
      </div>
      <textarea rows="12"></textarea>
      <div class="${SCRIPT_ID}-settings-actions">
        <button type="button" data-action="save" class="${SCRIPT_ID}-primary">保存</button>
        <button type="button" data-action="restore">恢复默认</button>
      </div>
      <div class="${SCRIPT_ID}-settings-status"></div>
    `;

    panel.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-action]');
      if (!trigger) {
        return;
      }
      const action = trigger.dataset.action;
      const promptKey = panel.dataset.prompt;
      if (action === 'close') {
        panel.classList.remove('is-open');
      }
      if (action === 'save') {
        const overrides = getPromptOverrides();
        overrides[promptKey] = panel.querySelector('textarea').value.trim();
        savePromptOverrides(overrides);
        panel.querySelector(`.${SCRIPT_ID}-settings-status`).textContent = '已保存';
        renderPromptRows();
      }
      if (action === 'restore') {
        restorePromptDefault(promptKey);
        panel.querySelector('textarea').value = DEFAULT_PROMPTS[promptKey];
        panel.querySelector(`.${SCRIPT_ID}-settings-status`).textContent = '已恢复';
      }
    });

    document.body.appendChild(panel);
    return panel;
  }

  function openPromptEditor(promptKey) {
    const panel = getPromptEditor();
    panel.dataset.prompt = promptKey;
    panel.querySelector(`.${SCRIPT_ID}-modal-head strong`).textContent = PROMPT_LABELS[promptKey];
    panel.querySelector('textarea').value = getPrompt(promptKey);
    panel.querySelector(`.${SCRIPT_ID}-settings-status`).textContent = isPromptDefault(promptKey) ? '默认' : '已修改';
    panel.classList.add('is-open');
  }

  function renderTaskLog() {
    const panel = document.getElementById(`${SCRIPT_ID}-settings-panel`);
    const list = panel?.querySelector(`.${SCRIPT_ID}-task-log`);
    if (!list) {
      return;
    }

    const logs = getTaskLogs().slice(0, 80);
    list.replaceChildren(
      ...logs.map((log) => {
        const row = document.createElement('div');
        row.className = `${SCRIPT_ID}-log-row ${log.status === 'error' ? 'is-error' : ''}`;
        row.innerHTML = `<span></span><strong></strong><em></em><p></p>`;
        row.querySelector('span').textContent = new Date(log.createdAt).toLocaleTimeString();
        row.querySelector('strong').textContent = log.label || log.kind;
        row.querySelector('em').textContent = log.status;
        row.querySelector('p').textContent = log.detail || '';
        return row;
      }),
    );
  }

  function renderTargetProfileRows() {
    const container = document.getElementById(`${SCRIPT_ID}-target-profiles`);
    if (!container) {
      return;
    }

    const settings = loadSettings();
    const profiles = getPartnerProfiles();
    const panel = document.getElementById(`${SCRIPT_ID}-settings-panel`);
    const input = panel?.querySelector('[name="targetXIds"]');
    const targets = (input ? input.value : settings.targetXIds.join(', '))
      .split(',')
      .map(normalizeId)
      .filter(Boolean);

    if (!targets.length) {
      container.replaceChildren();
      return;
    }

    container.replaceChildren(
      ...targets.map((id) => {
        const label = document.createElement('label');
        label.innerHTML = `对方资料 <code>@${id}</code><textarea rows="4" placeholder="昵称、自介、@id、称呼偏好"></textarea>`;
        const textarea = label.querySelector('textarea');
        textarea.dataset.partnerProfile = id;
        textarea.value = Object.prototype.hasOwnProperty.call(profiles, id) ? profiles[id] : '';
        return label;
      }),
    );
  }

  function getPanelTargetIds() {
    const panel = document.getElementById(`${SCRIPT_ID}-settings-panel`);
    const value = panel?.querySelector('[name="targetXIds"]')?.value || '';
    return value
      .split(',')
      .map(normalizeId)
      .filter(Boolean);
  }

  function setPanelTargetIds(ids) {
    const panel = document.getElementById(`${SCRIPT_ID}-settings-panel`);
    const input = panel?.querySelector('[name="targetXIds"]');
    if (!input) {
      return;
    }
    input.value = [...new Set(ids)].filter(Boolean).join(', ');
    renderTargetChips();
    renderTargetProfileRows();
  }

  function renderTargetChips() {
    const container = document.getElementById(`${SCRIPT_ID}-target-chips`);
    if (!container) {
      return;
    }
    const targets = getPanelTargetIds();
    if (!targets.length) {
      container.replaceChildren();
      return;
    }
    container.replaceChildren(
      ...targets.map((id) => {
        const chip = document.createElement('span');
        chip.className = `${SCRIPT_ID}-target-chip`;
        chip.innerHTML = `<code>@${id}</code><button type="button" data-action="remove-target" data-target-id="${id}" title="移除">×</button>`;
        return chip;
      }),
    );
  }

  function addTargetFromPanelInput() {
    const panel = document.getElementById(`${SCRIPT_ID}-settings-panel`);
    const input = panel?.querySelector('[data-target-input]');
    if (!input) {
      return;
    }
    const raw = input.value.trim();
    if (!raw) {
      return;
    }
    const ids = raw.split(',').map(normalizeId).filter(Boolean);
    if (!ids.length) {
      return;
    }
    const current = getPanelTargetIds();
    setPanelTargetIds([...current, ...ids]);
    input.value = '';
  }

  function removeTargetFromPanel(targetId) {
    const current = getPanelTargetIds().filter((id) => id !== targetId);
    setPanelTargetIds(current);
  }

  function useCurrentConversationAsTarget() {
    const currentId = getConversationId() || getMainTweetAuthor();
    if (!currentId) {
      setSettingsStatus('当前不是私信会话或推文页面', true);
      return;
    }
    const current = getPanelTargetIds();
    if (current.includes(currentId)) {
      setSettingsStatus('当前目标已在列表中');
      return;
    }
    setPanelTargetIds([...current, currentId]);
    setSettingsStatus('已添加当前目标');
  }

  function clearCacheWithConfirm() {
    if (!confirm('清空翻译缓存？')) {
      return;
    }
    clearTranslationCache();
    document
      .querySelectorAll(`.${SCRIPT_ID}-translation, .${SCRIPT_ID}-translation-row, .${SCRIPT_ID}-tweet-translation-row`)
      .forEach((node) => node.remove());
    setSettingsStatus('缓存已清空');
    const cachePanel = document.getElementById(`${SCRIPT_ID}-cache-panel`);
    if (cachePanel?.classList.contains('is-open')) {
      renderCacheList();
    }
    scanMessages();
  }

  function getCachePanel() {
    let panel = document.getElementById(`${SCRIPT_ID}-cache-panel`);
    if (panel) {
      return panel;
    }

    panel = document.createElement('div');
    panel.id = `${SCRIPT_ID}-cache-panel`;
    panel.className = `${SCRIPT_ID}-modal ${SCRIPT_ID}-cache-modal`;
    panel.innerHTML = `
      <div class="${SCRIPT_ID}-modal-head">
        <strong>翻译缓存</strong>
        <button type="button" data-action="close">关闭</button>
      </div>
      <input class="${SCRIPT_ID}-cache-search" placeholder="搜索">
      <div class="${SCRIPT_ID}-cache-count"></div>
      <div class="${SCRIPT_ID}-cache-list"></div>
    `;

    panel.querySelector('[data-action="close"]').addEventListener('click', () => panel.classList.remove('is-open'));
    panel.querySelector(`.${SCRIPT_ID}-cache-search`).addEventListener('input', renderCacheList);
    document.body.appendChild(panel);
    return panel;
  }

  function openCachePanel() {
    const panel = getCachePanel();
    panel.classList.add('is-open');
    renderCacheList();
  }

  function renderCacheList() {
    const panel = getCachePanel();
    const query = panel.querySelector(`.${SCRIPT_ID}-cache-search`).value.trim().toLowerCase();
    const entries = getCacheIndex().filter((entry) => {
      const haystack = `${entry.conversationName || ''}\n${entry.source || ''}\n${entry.translation || ''}`.toLowerCase();
      return !query || haystack.includes(query);
    });

    panel.querySelector(`.${SCRIPT_ID}-cache-count`).textContent = `${entries.length} 条`;
    const list = panel.querySelector(`.${SCRIPT_ID}-cache-list`);
    list.replaceChildren(
      ...entries.slice(0, 120).map((entry) => {
        const item = document.createElement('article');
        item.className = `${SCRIPT_ID}-cache-item`;
        const title = document.createElement('span');
        const source = document.createElement('p');
        const translation = document.createElement('strong');
        title.textContent = `${entry.conversationName || entry.conversationId || '私信'} · ${new Date(entry.createdAt).toLocaleString()}`;
        source.textContent = entry.source;
        translation.textContent = entry.translation;
        item.append(title, source, translation);
        return item;
      }),
    );
  }

  // Tweet / comment support
  function ensureTweetTranslationRow(article) {
    let row = article.querySelector(`.${SCRIPT_ID}-tweet-translation-row`);
    if (row) {
      return row.querySelector(`.${SCRIPT_ID}-tweet-translation`);
    }

    row = document.createElement('div');
    row.className = `${SCRIPT_ID}-tweet-translation-row`;
    const node = document.createElement('div');
    node.className = `${SCRIPT_ID}-tweet-translation`;
    node.textContent = '…';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${SCRIPT_ID}-tweet-translate-btn`;
    button.textContent = '译';
    button.title = '翻译';
    button.addEventListener('click', () => {
      const textNode = getTweetTextNode(article);
      const text = cleanMessageText(textNode?.innerText || '');
      if (!text) {
        return;
      }
      enqueueTweetTranslation(article, text, true);
    });
    row.appendChild(node);
    row.appendChild(button);

    const textNode = getTweetTextNode(article);
    if (textNode) {
      textNode.insertAdjacentElement('afterend', row);
    } else {
      article.appendChild(row);
    }
    return node;
  }

  function renderTweetTranslation(article, text) {
    const slot = ensureTweetTranslationRow(article);
    slot.textContent = text;
    slot.classList.remove(`${SCRIPT_ID}-error`);
  }

  function markTweetTranslationError(article, error) {
    const slot = ensureTweetTranslationRow(article);
    slot.textContent = error.message;
    slot.classList.add(`${SCRIPT_ID}-error`);
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

    if (state.translating.has(cacheKey)) {
      return;
    }

    const settings = loadSettings();
    if (!settings.autoTranslate && !force) {
      return;
    }

    if (!hasJapaneseText(text)) {
      if (force) {
        markTweetTranslationError(article, new Error('未检测到日语内容，跳过翻译'));
      }
      return;
    }

    state.translating.add(cacheKey);
    const slot = ensureTweetTranslationRow(article);
    slot.textContent = '…';
    slot.classList.remove(`${SCRIPT_ID}-error`);

    translateIncomingMessage(text, buildTweetPromptContext(author, text))
      .then((translated) => {
        setCachedTranslation(cacheKey, {
          conversationId: `tweet:${statusId}`,
          conversationName: `@${author}`,
          profileId: getPartnerProfileId(),
          messageId: statusId,
          source: text,
          translation: translated,
          createdAt: Date.now(),
        });
        renderTweetTranslation(article, translated);
      })
      .catch((error) => markTweetTranslationError(article, error))
      .finally(() => {
        state.translating.delete(cacheKey);
      });
  }

  function scanTweetArticles() {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    for (const article of articles) {
      if (article.querySelector(`.${SCRIPT_ID}-tweet-translation-row`)) {
        continue;
      }

      const textNode = getTweetTextNode(article);
      const text = cleanMessageText(textNode?.innerText || '');
      if (!text) {
        continue;
      }

      const statusId = getArticleStatusId(article) || getTweetStatusId();
      const author = getTweetAuthorFromArticle(article);
      const cacheKey = getTweetTranslationCacheKey(statusId, author, text);
      if (state.scannedTweetKeys.has(cacheKey)) {
        continue;
      }
      state.scannedTweetKeys.add(cacheKey);

      ensureTweetTranslationRow(article);

      const cached = getCachedTranslation(cacheKey);
      if (cached) {
        renderTweetTranslation(article, cached.translation);
      }
    }
  }

  function getMainTweetText() {
    const main = getMainTweetArticle();
    const textNode = getTweetTextNode(main);
    return textNode ? cleanMessageText(textNode.innerText) : '';
  }

  function generateTweetReplySuggestions(tweetText, author) {
    return requestOpenRouter(
      [
        { role: 'system', content: getPrompt('tweetReplySuggestions') },
        {
          role: 'user',
          content: JSON.stringify({
            context: buildTweetPromptContext(author, tweetText),
            tweetText,
          }),
        },
      ],
      {
        temperature: 0.55,
        maxCompletionTokens: MAX_COMPLETION_TOKENS,
        responseFormat: CONVERSATION_SUGGESTIONS_FORMAT,
        taskType: 'suggestion',
        taskLabel: '生成回复建议',
      },
    ).then((data) => data.suggestions);
  }

  function getTweetSuggestionsStore() {
    const store = GM_getValue(TWEET_SUGGESTIONS_KEY, {});
    return store && typeof store === 'object' && !Array.isArray(store) ? store : {};
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
    const panel = document.getElementById(`${SCRIPT_ID}-suggestions`);
    if (panel) {
      panel.replaceChildren();
    }
  }

  function generateAndRenderTweetReplySuggestions(profileId, tweetText) {
    const author = getMainTweetAuthor();
    return generateTweetReplySuggestions(tweetText, author)
      .then((items) => {
        state.suggestionRetryAt.delete(profileId);
        setTweetSuggestions(profileId, {
          profileId,
          lastTweetId: getTweetStatusId(),
          suggestions: items,
          updatedAt: Date.now(),
        });
        renderSuggestionChoices(items);
        return items;
      })
      .catch((error) => {
        state.suggestionRetryAt.set(profileId, Date.now() + 180000);
        console.warn('[X DM OpenRouter Translator] 推文回复建议生成失败', error);
        throw error;
      });
  }

  function maybeGenerateTweetReplySuggestions(profileId, tweetText) {
    if (!profileId || !tweetText) {
      return Promise.resolve();
    }

    if (
      state.suggestionUpdating.has(profileId) ||
      (state.suggestionRetryAt.get(profileId) || 0) > Date.now()
    ) {
      return Promise.resolve();
    }

    state.suggestionUpdating.add(profileId);
    return generateAndRenderTweetReplySuggestions(profileId, tweetText).finally(() =>
      state.suggestionUpdating.delete(profileId),
    );
  }

  function refreshTweetReplySuggestions() {
    const profileId = getPartnerProfileId();
    const tweetText = getMainTweetText();
    if (!profileId || !tweetText) {
      return Promise.resolve();
    }
    state.suggestionRetryAt.delete(profileId);
    clearTweetReplySuggestions(profileId);
    return maybeGenerateTweetReplySuggestions(profileId, tweetText);
  }

  function handleTweetSuggestButtonClick() {
    const button = document.getElementById(`${SCRIPT_ID}-suggest-button`);
    const profileId = getPartnerProfileId();
    const tweetText = getMainTweetText();
    if (!profileId || !tweetText) {
      return;
    }

    if (state.suggestionUpdating.has(profileId)) {
      return;
    }

    state.suggestionRetryAt.delete(profileId);
    clearTweetReplySuggestions(profileId);
    if (button) {
      button.textContent = '⏳';
    }
    maybeGenerateTweetReplySuggestions(profileId, tweetText).finally(() => {
      if (button) {
        button.textContent = '🤔';
      }
    });
  }

  function renderStoredTweetSuggestionChoices() {
    const record = getTweetSuggestionsStore()[getPartnerProfileId()];
    const panel = document.getElementById(`${SCRIPT_ID}-suggestions`);
    if (!panel) {
      return;
    }
    if (record?.suggestions?.length && record?.lastTweetId === getTweetStatusId()) {
      renderSuggestionChoices(record.suggestions);
    } else {
      panel.replaceChildren();
    }
  }

  function ensureTweetReplyButtons() {
    const form = findComposerForm();
    if (!form) {
      return;
    }

    let button = document.getElementById(`${SCRIPT_ID}-reply-button`);
    if (!button) {
      button = document.createElement('button');
      button.id = `${SCRIPT_ID}-reply-button`;
      button.type = 'button';
      button.textContent = '译';
      button.title = '翻译';
      button.addEventListener('click', toggleReplyPanel);
    }

    if (button.parentElement !== form.parentElement) {
      form.insertAdjacentElement('afterend', button);
    }

    let suggestButton = document.getElementById(`${SCRIPT_ID}-suggest-button`);
    if (!suggestButton) {
      suggestButton = document.createElement('button');
      suggestButton.id = `${SCRIPT_ID}-suggest-button`;
      suggestButton.type = 'button';
      suggestButton.textContent = '🤔';
      suggestButton.title = '建议回复';
      suggestButton.addEventListener('click', handleTweetSuggestButtonClick);
    }

    if (suggestButton.parentElement !== form.parentElement) {
      button.insertAdjacentElement('afterend', suggestButton);
    }
  }

  function registerMenuCommands() {
    GM_registerMenuCommand('翻译设置', openSettingsPanel);
    GM_registerMenuCommand('查看翻译缓存', openCachePanel);
    GM_registerMenuCommand('清空翻译缓存', clearCacheWithConfirm);
    GM_registerMenuCommand('使用当前目标', useCurrentConversationAsTarget);
    GM_registerMenuCommand('开关自动翻译', () => {
      saveSettings({ autoTranslate: !loadSettings().autoTranslate });
      scanMessages();
    });

    GM_registerMenuCommand('重扫当前会话', scanMessages);
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
      state.lastSeenLatestMessageKey = '';
      state.scannedMessageKeys.clear();
      state.scannedTweetKeys.clear();
      document.getElementById(`${SCRIPT_ID}-reply-panel`)?.classList.remove('is-open');
      document.getElementById(`${SCRIPT_ID}-settings-panel`)?.classList.remove('is-open');
      document.getElementById(`${SCRIPT_ID}-cache-panel`)?.classList.remove('is-open');
      document.getElementById(`${SCRIPT_ID}-prompt-editor`)?.classList.remove('is-open');

      if (isTweetDetailPage()) {
        renderStoredTweetSuggestionChoices();
      } else {
        renderStoredSuggestionChoices();
      }

      state.profilePending.clear();
      state.profileUpdating.clear();
      const currentProfileId = getPartnerProfileId();
      for (const map of [state.profileRetryAt, state.suggestionRetryAt]) {
        for (const key of map.keys()) {
          if (key !== currentProfileId) {
            map.delete(key);
          }
        }
      }
    }

    scanTweetArticles();

    if (isTargetConversation()) {
      if (isTweetDetailPage()) {
        ensureTweetReplyButtons();
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
  }

  export function start() {
    registerMenuCommands();
    tick();
    const debouncedTick = debounce(tick, 120);
    new MutationObserver(debouncedTick).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', placeReplyPanel);
    window.addEventListener('resize', positionSuggestionsPanel);
    window.addEventListener('scroll', positionSuggestionsPanel, true);
    setInterval(tick, 5000);
  }

