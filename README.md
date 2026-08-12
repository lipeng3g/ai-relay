# AICarry

[English](README.md) | [简体中文](README.zh-CN.md)

Continue a conversation on another AI without explaining everything again.

AICarry is a Chrome extension that helps you carry an ongoing conversation between ChatGPT, Claude, Gemini, and Grok. It is designed for everyday writing, learning, research, coding, and problem-solving: review what will be carried, copy it, and continue on another AI.

> Simple, user-controlled, and privacy-first: capture is off by default, and conversation data is processed locally in your Chrome browser.

## What AICarry does

- Continues the same task across supported AI platforms;
- Preserves questions, answers, code, and recent context;
- Offers a concise relay for long conversations and a full relay for short ones;
- Lets you preview the relay text before copying it;
- Keeps local conversation history manageable from the side panel;
- Provides English and Simplified Chinese interfaces.

## How it works

1. Open ChatGPT, Claude, Gemini, or Grok.
2. Open the AICarry side panel and turn on capture when you need it.
3. Continue your conversation normally.
4. Choose **Concise Relay** or **Full Relay**.
5. Preview the result, then copy it.
6. Open another AI platform and paste the relay text into a new conversation.

AICarry never sends a message for you. You remain in control and can inspect the text before copying and pasting it.

## Supported platforms

| Platform | Conversation capture | Relay generation |
| --- | --- | --- |
| ChatGPT (`chatgpt.com`) | Supported | Supported |
| Claude (`claude.ai`) | Supported | Supported |
| Gemini (`gemini.google.com`) | Supported | Supported |
| Grok (`grok.com`) | Supported | Supported |

Each platform remains responsible for its own login, account limits, availability, and content policies. AICarry only provides local capture, organization, preview, and copy tools.

## Privacy in plain English

- **Capture is off by default.** AICarry observes conversation responses on supported websites only after you turn capture on.
- **Conversation data is processed locally.** AICarry v0.3.3 has no account system, billing backend, advertising, analytics, telemetry, or developer-operated conversation server.
- **Data stays in your Chrome profile.** Conversations and settings are stored with `chrome.storage.local` and are not synchronized to an AICarry server.
- **Copying is your decision.** Relay text reaches the system clipboard only after you click copy. You decide where to paste it.
- **Site access is limited.** The extension requests access only to the four supported AI domains and does not run its capture bridge on other websites.

Chrome local storage and the system clipboard are not encrypted vaults. Do not retain sensitive conversations on an untrusted device or paste information that should not be shared with the destination AI.

Read the complete [Privacy Policy](PRIVACY.md).

## Installation

The Chrome Web Store listing is currently under review. Once it is available, installing from the store will be the recommended option. Until then, you can install AICarry manually:

1. Download and extract this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the extracted repository root. If you are working from the development repository, select its `extension/` directory instead.
5. Pin AICarry to the Chrome toolbar.

## Current version

Current version: **v0.3.3**

This is a free, local-first initial release. Future versions may use a different distribution or commercial model. Any such change will be disclosed in the relevant store listing, release notes, and privacy policy. Code already published in this repository remains subject to the included MIT License.

## Support and security

For help, open a [GitHub issue](https://github.com/lipeng3g/ai-relay/issues) and include:

- The AI platform and page you were using;
- The status shown in the AICarry side panel;
- Whether capture was enabled;
- Steps that reproduce the problem.

Do not include real conversations, email addresses, API keys, cookies, or other private information. Use redacted screenshots or sanitized examples.

If a report may expose user data or create a security risk, do not post sensitive details in a public issue. Start with a minimal, redacted report so a private follow-up channel can be arranged.

## License

The currently published extension code is licensed under the [MIT License](LICENSE).
