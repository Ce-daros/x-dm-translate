import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'X DM OpenRouter Translator',
        namespace: 'https://github.com/ame/x-chat-translate',
        version: '0.2.4',
        description: 'Translate selected X DMs to Chinese and draft Japanese replies.',
        match: ['https://x.com/i/chat*', 'https://twitter.com/i/chat*'],
        'run-at': 'document-idle',
        grant: [
          'GM_xmlhttpRequest',
          'GM_getValue',
          'GM_setValue',
          'GM_deleteValue',
          'GM_listValues',
          'GM_registerMenuCommand',
          'unsafeWindow',
        ],
        connect: ['openrouter.ai'],
      },
      build: {
        fileName: 'x-dm-openrouter-translate.user.js',
      },
    }),
  ],
  build: {
    emptyOutDir: true,
    minify: false,
  },
});
