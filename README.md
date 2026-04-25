# AI Relay

<p align="center">
  <img src="icons/icon128.png" width="80" alt="AI Relay" />
</p>

**AI Relay** is a Chrome extension that lets you seamlessly continue a conversation across different AI platforms. When you hit the free usage limit on ChatGPT, switch to Claude or Grok with one click — your full context comes along.

**AI Relay** 是一个 Chrome 扩展，让你在不同 AI 平台之间无缝接力对话。当 ChatGPT 免费额度用完，一键切换到 Claude 或 Grok — 完整上下文自动带过去。

> All data stays in your browser. Nothing is uploaded. | 所有数据仅存储在本地，不上传任何内容。

## The Problem

Free-tier users constantly rotate between ChatGPT, Claude, and Grok to dodge usage limits. Each time you switch, you lose all conversation context and have to re-explain everything. That's tedious, especially for multi-turn coding or research sessions.

## How It Works

1. **Capture** — The extension silently captures your conversation via network interception (all processing happens locally)
2. **Snapshot** — One click generates a structured Markdown "relay snapshot" with your conversation context
3. **Continue** — Paste the snapshot into a new AI's chat, and it picks up exactly where the last one left off

## Supported Platforms

| Platform | Capture | Relay To |
|----------|---------|----------|
| ChatGPT (chatgpt.com) | ✅ | ✅ |
| Claude (claude.ai) | ✅ | ✅ |
| Grok (grok.com) | ✅ | ✅ |
| Gemini (gemini.google.com) | ✅ | ✅ |

## Installation

Since this extension is not yet on the Chrome Web Store, install it manually:

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this directory
5. Pin the AI Relay icon to your toolbar

## Usage

1. Enable the **Capture toggle** in the extension's side panel (off by default)
2. Chat on any supported AI platform — the extension captures in the background
3. When you need to switch platforms, click **"Generate Snapshot & Copy"**
4. Click a target platform link to open it
5. Paste (`Cmd/Ctrl+V`) in the new AI's chat and send
6. The new AI confirms it understands the context and answers your latest question

## Features

- **Automatic capture**: Intercepts AI conversations via fetch proxy — no manual copying
- **i18n**: Auto-detects browser language, supports English and Chinese
- **Two compression modes**:
  - **Verbatim**: Keeps recent N turns in full (default, no API needed)
  - **AI Summary**: Uses a cheap LLM (e.g. GPT-4.1-mini) to intelligently compress long conversations while preserving code and key context
- **Session history**: Browse, preview, and manage past conversations
- **Capture toggle**: Disabled by default — you control when capturing is active
- **Side panel UI**: Persistent sidebar that doesn't interrupt your workflow
- **Privacy-first**: All data stored in local browser storage only

## AI Summary Mode (Optional)

For long conversations, you can configure an OpenAI-compatible API to enable intelligent compression:

1. Go to the **Settings** tab
2. Enter your API endpoint, key, and model (supports any OpenAI-compatible API: DeepSeek, OpenRouter, etc.)
3. Click **Save** and **Test Connection**

The AI will summarize older parts of the conversation while keeping recent messages and all code blocks intact.

## Privacy

- **No data leaves your browser** unless you explicitly configure an AI summary API
- **No analytics, no tracking, no external servers**
- All conversation data is stored in `chrome.storage.local` (your browser profile)
- The capture toggle is **off by default** — nothing is captured until you enable it
- Full source code is open for audit

## Project Structure

```
├── manifest.json         Extension manifest (MV3)
├── background.js         Service worker (side panel setup)
├── _locales/             Chrome i18n (en, zh_CN)
├── icons/                Extension icons
├── content/
│   ├── content.js        Content script (isolated world)
│   └── page-inject.js    Fetch interceptor (page world)
├── lib/
│   ├── i18n.js           Lightweight i18n layer
│   ├── storage.js        chrome.storage wrapper
│   ├── compress.js       Snapshot generation (LLM + fallback)
│   ├── parsers.js        Platform-specific parsers (testable)
│   └── session-store.js  Session state logic (testable)
└── popup/
    ├── popup.html        Side panel UI
    ├── popup.css         Styles
    └── popup.js          UI logic
```

## Development

### Debug Logging

Enable debug logging in the extension's **Settings** tab, then check the browser's DevTools Console on any supported AI platform page.

### Run Tests

Tests live in a separate `test/` directory (not included in this repo). See the development repository for test fixtures and recording tools.

## Roadmap

- [x] **v0.2**: ChatGPT + Claude + Grok capture & relay, AI summary, i18n, side panel UI
- [x] **v0.3** (current): Gemini support (Google BatchExecute RPC), recording infrastructure
- [ ] **v0.4**: Chrome Web Store listing, auto-detect usage limits, one-click relay trigger
- [ ] **v1.0**: Polish, landing page, more platforms

## Contributing

Issues and PRs are welcome! Please open an issue first for feature discussions.

## License

MIT
