import { SCRIPT_ID } from './constants';

export function injectStyles() {
  if (document.getElementById(`${SCRIPT_ID}-style`)) {
    return;
  }

  const style = document.createElement('style');
  style.id = `${SCRIPT_ID}-style`;
  style.textContent = `

    [class^="${SCRIPT_ID}-"],
    [id^="${SCRIPT_ID}-"] {
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

    @keyframes ${SCRIPT_ID}-fade-in-up {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes ${SCRIPT_ID}-shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-3px); }
      40%, 80% { transform: translateX(3px); }
    }

    .${SCRIPT_ID}-translation-row {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      width: 100%;
      padding: 4px 16px 8px;
      pointer-events: none;
      animation: ${SCRIPT_ID}-fade-in-up 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .${SCRIPT_ID}-translation-row.is-incoming {
      align-items: flex-start;
    }

    .${SCRIPT_ID}-translation-row.is-outgoing {
      align-items: flex-end;
    }

    .${SCRIPT_ID}-translation {
      max-width: min(70%, 520px);
      color: var(--xct-text-secondary);
      font-size: 13px;
      line-height: 1.33;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .${SCRIPT_ID}-error {
      color: var(--xct-text) !important;
      font-weight: 500;
      animation: ${SCRIPT_ID}-shake 320ms ease-in-out;
    }

    #${SCRIPT_ID}-progress {
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

    #${SCRIPT_ID}-progress span {
      display: block;
      width: 0;
      height: 100%;
      border-radius: inherit;
      background: var(--xct-accent);
      opacity: 0;
      transition: width 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
    }

    #${SCRIPT_ID}-progress.is-active span {
      opacity: 1;
    }

    #${SCRIPT_ID}-suggestions {
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

    #${SCRIPT_ID}-suggestions:not(:empty) {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    #${SCRIPT_ID}-suggestions.is-right {
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

    .${SCRIPT_ID}-suggestion-refresh {
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

    #${SCRIPT_ID}-suggestions.is-right .${SCRIPT_ID}-suggestion-refresh {
      grid-row: auto;
      margin: 0 0 4px;
    }

    .${SCRIPT_ID}-suggestion-refresh:hover {
      background: var(--xct-surface-hover);
      border-color: var(--xct-accent);
      color: var(--xct-accent);
    }

    .${SCRIPT_ID}-suggestion {
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

    .${SCRIPT_ID}-suggestion:hover {
      background: var(--xct-surface-hover);
      border-color: var(--xct-accent);
    }

    .${SCRIPT_ID}-suggestion strong,
    .${SCRIPT_ID}-suggestion span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .${SCRIPT_ID}-suggestion strong {
      margin-bottom: 4px;
      color: var(--xct-text);
      font-weight: 700;
      font-size: 13px;
    }

    .${SCRIPT_ID}-suggestion span {
      color: var(--xct-text-secondary);
      font-size: 12px;
    }

    #${SCRIPT_ID}-reply-button,
    #${SCRIPT_ID}-suggest-button {
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

    #${SCRIPT_ID}-reply-button:hover,
    #${SCRIPT_ID}-suggest-button:hover {
      background: var(--xct-accent-hover);
    }

    #${SCRIPT_ID}-reply-panel {
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

    #${SCRIPT_ID}-reply-panel.is-open {
      opacity: 1;
      visibility: visible;
      transform: scale(1);
    }

    .${SCRIPT_ID}-reply-input {
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

    .${SCRIPT_ID}-reply-input:focus {
      border-color: var(--xct-accent);
      box-shadow: rgba(0, 0, 0, 0.03) 0px 0px 2px 0px inset;
    }

    .${SCRIPT_ID}-reply-actions {
      flex: 0 0 auto;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    .${SCRIPT_ID}-reply-actions button,
    .${SCRIPT_ID}-tone {
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

    .${SCRIPT_ID}-reply-actions button:hover,
    .${SCRIPT_ID}-tone:hover {
      background: var(--xct-surface-hover);
    }

    .${SCRIPT_ID}-reply-submit {
      border-color: var(--xct-accent) !important;
      background: var(--xct-accent) !important;
      color: var(--xct-on-accent) !important;
      font-weight: 700 !important;
    }

    .${SCRIPT_ID}-reply-submit:hover {
      background: var(--xct-accent-hover) !important;
      border-color: var(--xct-accent-hover) !important;
    }

    .${SCRIPT_ID}-reply-status {
      flex: 0 0 auto;
      min-height: 20px;
      margin-top: 8px;
      color: var(--xct-text-secondary);
      font-size: 13px;
      line-height: 1.33;
      transition: color 150ms ease;
    }

    .${SCRIPT_ID}-reply-status.${SCRIPT_ID}-error {
      color: var(--xct-text);
      font-weight: 500;
      animation: ${SCRIPT_ID}-shake 320ms ease-in-out;
    }

    .${SCRIPT_ID}-tone-list {
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

    .${SCRIPT_ID}-tone {
      display: grid;
      gap: 4px;
      width: 100%;
      padding: 10px 12px;
      text-align: left;
      border-radius: 12px;
    }

    .${SCRIPT_ID}-tone span,
    .${SCRIPT_ID}-tone em {
      color: var(--xct-text-secondary);
      font-size: 12px;
      line-height: 1.22;
      font-style: normal;
    }

    .${SCRIPT_ID}-tone strong {
      color: var(--xct-text);
      font-weight: 500;
      white-space: pre-wrap;
      font-size: 15px;
      line-height: 1.33;
    }

    .${SCRIPT_ID}-modal {
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

    .${SCRIPT_ID}-modal.is-open {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) scale(1);
    }

    .${SCRIPT_ID}-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .${SCRIPT_ID}-modal-head strong {
      font-size: 20px;
      font-weight: 800;
      line-height: 1.2;
      color: var(--xct-text);
    }

    .${SCRIPT_ID}-modal-head button,
    .${SCRIPT_ID}-section-head button {
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

    .${SCRIPT_ID}-modal-head button:hover,
    .${SCRIPT_ID}-section-head button:hover {
      background: var(--xct-surface-hover);
    }

    .${SCRIPT_ID}-settings-section {
      display: grid;
      gap: 12px;
      padding: 16px 0;
      border-top: 1px solid var(--xct-border-light);
    }

    .${SCRIPT_ID}-settings-section:first-of-type {
      border-top: 0;
      padding-top: 0;
    }

    .${SCRIPT_ID}-settings-section h3 {
      margin: 0;
      color: var(--xct-text);
      font-size: 15px;
      font-weight: 700;
      line-height: 1.2;
    }

    .${SCRIPT_ID}-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .${SCRIPT_ID}-modal label {
      display: grid;
      gap: 6px;
      margin: 0;
      color: var(--xct-text-secondary);
      font-size: 13px;
      line-height: 1.22;
    }

    .${SCRIPT_ID}-setting-state {
      justify-self: start;
      color: var(--xct-text-tertiary);
      font-size: 12px;
      line-height: 1;
    }

    .${SCRIPT_ID}-setting-state.is-dirty {
      color: var(--xct-accent);
    }

    .${SCRIPT_ID}-modal input,
    .${SCRIPT_ID}-modal textarea {
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

    .${SCRIPT_ID}-modal input {
      height: 40px;
    }

    .${SCRIPT_ID}-modal textarea {
      min-height: 88px;
      max-height: 180px;
      padding-top: 10px;
      padding-bottom: 10px;
      resize: vertical;
      line-height: 1.45;
    }

    .${SCRIPT_ID}-modal input:focus,
    .${SCRIPT_ID}-modal textarea:focus {
      border-color: var(--xct-accent);
      box-shadow: rgba(0, 0, 0, 0.03) 0px 0px 2px 0px inset;
    }

    .${SCRIPT_ID}-check {
      display: flex !important;
      grid-template-columns: none !important;
      align-items: center;
      gap: 8px !important;
      color: var(--xct-text) !important;
      font-size: 15px;
    }

    .${SCRIPT_ID}-check input {
      width: 18px;
      height: 18px;
      accent-color: var(--xct-accent);
    }

    .${SCRIPT_ID}-check-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
    }

    .${SCRIPT_ID}-settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .${SCRIPT_ID}-prompt-list,
    .${SCRIPT_ID}-task-log {
      display: grid;
      gap: 8px;
    }

    .${SCRIPT_ID}-task-log {
      max-height: 240px;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 4px;
    }

    .${SCRIPT_ID}-prompt-row {
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

    .${SCRIPT_ID}-prompt-row:hover {
      background: var(--xct-surface-hover);
    }

    .${SCRIPT_ID}-prompt-row strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
      font-size: 15px;
      color: var(--xct-text);
    }

    .${SCRIPT_ID}-prompt-row button {
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

    .${SCRIPT_ID}-prompt-row button:hover {
      background: var(--xct-surface-hover);
    }

    .${SCRIPT_ID}-prompt-state {
      color: var(--xct-text-tertiary);
      font-size: 12px;
    }

    .${SCRIPT_ID}-prompt-state.is-dirty {
      color: var(--xct-accent);
    }

    .${SCRIPT_ID}-prompt-editor {
      width: min(760px, calc(100vw - 32px));
    }

    .${SCRIPT_ID}-prompt-editor textarea {
      min-height: 280px;
      max-height: calc(100vh - 260px);
    }

    .${SCRIPT_ID}-log-row {
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

    .${SCRIPT_ID}-log-row:hover {
      background: var(--xct-surface-hover);
    }

    .${SCRIPT_ID}-log-row span,
    .${SCRIPT_ID}-log-row em,
    .${SCRIPT_ID}-log-row p {
      color: var(--xct-text-tertiary);
      font-size: 12px;
      line-height: 1.22;
      font-style: normal;
    }

    .${SCRIPT_ID}-log-row strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 500;
      color: var(--xct-text);
    }

    .${SCRIPT_ID}-log-row p {
      grid-column: 1 / -1;
      margin: 0;
      overflow-wrap: anywhere;
    }

    .${SCRIPT_ID}-log-row.is-error em,
    .${SCRIPT_ID}-log-row.is-error p {
      color: var(--xct-text);
      font-weight: 500;
    }

    .${SCRIPT_ID}-settings-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }

    .${SCRIPT_ID}-modal button {
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

    .${SCRIPT_ID}-modal button:hover {
      background: var(--xct-surface-hover);
    }

    .${SCRIPT_ID}-primary {
      border-color: var(--xct-accent) !important;
      background: var(--xct-accent) !important;
      color: var(--xct-on-accent) !important;
    }

    .${SCRIPT_ID}-primary:hover {
      background: var(--xct-accent-hover) !important;
      border-color: var(--xct-accent-hover) !important;
    }

    .${SCRIPT_ID}-settings-status,
    .${SCRIPT_ID}-cache-count {
      min-height: 20px;
      margin-top: 12px;
      color: var(--xct-text-secondary);
      font-size: 13px;
      line-height: 1.33;
    }

    .${SCRIPT_ID}-current-summary {
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

    .${SCRIPT_ID}-cache-modal {
      width: min(720px, calc(100vw - 32px));
    }

    .${SCRIPT_ID}-cache-list {
      display: grid;
      gap: 12px;
      margin-top: 12px;
    }

    .${SCRIPT_ID}-cache-search {
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

    .${SCRIPT_ID}-cache-search:focus {
      border-color: var(--xct-accent);
      box-shadow: rgba(0, 0, 0, 0.03) 0px 0px 2px 0px inset;
    }

    .${SCRIPT_ID}-cache-item {
      display: grid;
      gap: 6px;
      padding: 12px;
      border: 1px solid var(--xct-border-light);
      border-radius: 12px;
      background: var(--xct-surface);
      transition: background-color 150ms ease;
    }

    .${SCRIPT_ID}-cache-item:hover {
      background: var(--xct-surface-hover);
    }

    .${SCRIPT_ID}-cache-item span {
      color: var(--xct-text-tertiary);
      font-size: 12px;
      line-height: 1.22;
    }

    .${SCRIPT_ID}-cache-item p,
    .${SCRIPT_ID}-cache-item strong {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 15px;
      line-height: 1.33;
    }

    .${SCRIPT_ID}-cache-item p {
      color: var(--xct-text-secondary);
    }

    .${SCRIPT_ID}-cache-item strong {
      color: var(--xct-text);
      font-weight: 500;
    }

    @media (max-width: 720px) {
      #${SCRIPT_ID}-suggestions:not(.is-right) {
        grid-template-columns: auto 1fr;
      }

      #${SCRIPT_ID}-suggestions:not(.is-right) .${SCRIPT_ID}-suggestion-refresh {
        grid-row: 1 / -1;
      }

      .${SCRIPT_ID}-settings-grid,
      .${SCRIPT_ID}-check-grid {
        grid-template-columns: 1fr;
      }

      .${SCRIPT_ID}-prompt-row {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .${SCRIPT_ID}-prompt-row button {
        width: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .${SCRIPT_ID}-translation-row,
      #${SCRIPT_ID}-progress span,
      #${SCRIPT_ID}-suggestions,
      .${SCRIPT_ID}-suggestion,
      #${SCRIPT_ID}-reply-button,
      #${SCRIPT_ID}-suggest-button,
      #${SCRIPT_ID}-reply-panel,
      .${SCRIPT_ID}-reply-input,
      .${SCRIPT_ID}-reply-actions button,
      .${SCRIPT_ID}-tone,
      .${SCRIPT_ID}-modal,
      .${SCRIPT_ID}-modal-head button,
      .${SCRIPT_ID}-section-head button,
      .${SCRIPT_ID}-modal input,
      .${SCRIPT_ID}-modal textarea,
      .${SCRIPT_ID}-prompt-row,
      .${SCRIPT_ID}-prompt-row button,
      .${SCRIPT_ID}-log-row,
      .${SCRIPT_ID}-modal button,
      .${SCRIPT_ID}-primary,
      .${SCRIPT_ID}-cache-search,
      .${SCRIPT_ID}-cache-item {
        transition: none !important;
        animation: none !important;
      }
    }

  `;
  document.head.appendChild(style);
}
