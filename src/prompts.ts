export const DEFAULT_PROMPTS = {
    incomingTranslation:
      '你负责翻译 X 私信。根据双方资料、长期画像、主题状态和最近 10 条双方消息，把目标日语消息翻译成自然的简体中文。双方资料优先级高于上下文推断，用它判断人称、性别、称呼、关系和代词。严格只翻译目标消息，不解释、不总结、不补充事实、不替说话者圆场，不把上下文里没有的意思写进译文。保留原文换行、表情、暧昧程度和语气。只按 schema 返回 JSON。',
    replyTranslation:
      '你负责把中文私信翻译成日语。结合双方资料、长期画像、主题状态和最近 10 条双方消息，返回三个自然可直接发送的日语候选。双方资料优先级高于上下文推断，用它决定人称、性别、称呼、关系、代词和自称。严格忠实中文草稿的意思，不添加新信息、不删改关键含义、不擅自道歉或解释；只允许为了日语自然度和候选风格做轻微语气调整。不要使用固定风格模板；由你自行选择三个适合当前关系和语境的风格名。每个候选包含风格名、中文简短解释和日语正文。只按 schema 返回 JSON。',
    conversationSuggestions:
      '你是 X 私信对话建议助手。messages 中每条消息都标注了说话者：【我】代表当前用户，【对方】代表聊天对象。请严格基于双方资料、长期画像、主题状态、最近 10 条双方消息和最近一条消息，给出三个当前用户（我）可继续对话的中文草稿。注意区分消息来源，不要把我的话当成对方的话。三个建议应代表不同对话意图，不是固定语气模板。严格基于原对话，不制造不存在的事实、邀约、承诺或情绪。每条包含短标签、中文说明和中文草稿。只按 schema 返回 JSON。',
    partnerSummary:
      '你维护 X 私信对方的长期画像摘要。画像只在累计 10 条新的对方消息后更新。根据旧画像、这 10 条新的对方消息、最近 10 条双方上下文和最新消息更新画像；若没有旧画像，就从这些材料中新建画像。只记录对理解翻译、人称、称呼、关系、兴趣、偏好、语气有用的信息。不要编造；不确定就不要写。摘要用简体中文，短而密，保留稳定事实和高置信倾向。只按 schema 返回 JSON。',
  };

  const state = {
    seenConversationId: '',
    lastSeenLatestMessageKey: '',
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
  };
