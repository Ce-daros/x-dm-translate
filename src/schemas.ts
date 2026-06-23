function jsonSchemaFormat(name, schema) {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema,
    },
  };
}

export const INCOMING_TRANSLATION_FORMAT = jsonSchemaFormat('dm_translation', {
  type: 'object',
  properties: {
    translation: {
      type: 'string',
      description: 'Natural Simplified Chinese translation.',
    },
  },
  required: ['translation'],
  additionalProperties: false,
});

export const REPLY_OPTIONS_FORMAT = jsonSchemaFormat('dm_reply_options', {
  type: 'object',
  properties: {
    options: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'Short style name.',
          },
          note: {
            type: 'string',
            description: 'Brief Chinese explanation of the tone.',
          },
          text: {
            type: 'string',
            description: 'Japanese DM candidate.',
          },
        },
        required: ['label', 'note', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['options'],
  additionalProperties: false,
});

export const PARTNER_SUMMARY_FORMAT = jsonSchemaFormat('partner_profile_summary', {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Updated concise Chinese profile summary for the DM partner.',
    },
  },
  required: ['summary'],
  additionalProperties: false,
});

export const CONVERSATION_SUGGESTIONS_FORMAT = jsonSchemaFormat('conversation_suggestions', {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          note: { type: 'string' },
          draft: { type: 'string' },
        },
        required: ['label', 'note', 'draft'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
});
