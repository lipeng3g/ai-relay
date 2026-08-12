# Privacy Policy · AICarry

Last updated: August 12, 2026
Applies to: AICarry v0.3.3

## English

### Summary

AICarry processes supported AI-chat conversations locally in your browser. Conversation content is not sent to AICarry, its developer, analytics providers, advertising providers, or any developer-operated server.

AICarry v0.3.3 has no account system, billing backend, analytics, telemetry, advertising, or remote error-reporting service.

### What the extension processes

AICarry runs only on these supported websites:

- `chatgpt.com`
- `claude.ai`
- `grok.com`
- `gemini.google.com`

When capture is enabled, the extension observes conversation responses on those sites so it can build relay text for the user. It processes:

- user and assistant message text;
- conversation identifiers and page URLs used to associate messages with the correct conversation;
- conversation titles and timestamps;
- local extension settings, including capture state, relay preferences, ignored conversations, and debug preference.

### Storage and sharing

Captured conversations and settings are stored in `chrome.storage.local` inside the user's Chrome profile. They are not synced to or stored on any AICarry server.

Relay text is written to the system clipboard only after the user chooses a relay mode and clicks a copy action. Clipboard contents are then visible to the user and to any application into which the user pastes them.

AICarry does not sell, rent, license, share, or use conversation content for advertising, profiling, credit decisions, or model training.

### Network behavior

AICarry observes selected network responses made by the four supported AI websites. It does not initiate requests containing conversation content to the developer or to unrelated third parties.

Opening a destination platform happens only after the user clicks that platform. The destination website then operates under its own privacy policy.

### User control

Conversation capture is off by default. The user can turn it on or off from the side panel.

The **Settings → Clear All Data** action deletes locally stored conversation records. Settings may remain so the extension can preserve the user's preferences. Visiting a supported conversation again while capture is enabled may capture that conversation again.

Uninstalling AICarry removes the extension's local storage through Chrome.

### Permissions

- `storage`: stores conversations and settings locally.
- `clipboardWrite`: copies relay text after a user action.
- `activeTab` and `tabs`: identify the active supported site and update the side panel when the user changes tabs.
- `sidePanel`: provides the extension interface.
- Host access to the four listed domains: runs the capture bridge only on supported AI-chat sites.

### Future paid features

If a future version introduces an optional account, license, or billing service, this policy and the Chrome Web Store disclosure will be updated before that feature is released. Conversation content will remain outside any licensing or billing service unless the user is separately informed and explicitly opts in.

### Contact and source code

Source code: <https://github.com/lipeng3g/ai-relay>
Questions or privacy requests: <https://github.com/lipeng3g/ai-relay/issues>

## 中文

### 摘要

AICarry 只在用户浏览器本地处理受支持 AI 网站中的对话。对话内容不会发送给 AICarry、开发者、统计服务、广告服务或任何由开发者运营的服务器。

AICarry v0.3.3 不包含账号系统、计费后台、统计、遥测、广告或远程错误上报服务。

### 扩展处理哪些数据

AICarry 只在以下网站运行：

- `chatgpt.com`
- `claude.ai`
- `grok.com`
- `gemini.google.com`

开启抓取后，扩展会观察这些网站返回的对话响应，以便为用户生成接力文本。处理内容包括：

- 用户和助手的消息文本；
- 用于把消息关联到正确对话的会话标识和页面 URL；
- 会话标题和时间；
- 抓取状态、接力偏好、忽略的对话和调试偏好等本地设置。

### 存储与共享

抓取的对话和设置存储在用户 Chrome 配置目录中的 `chrome.storage.local`，不会同步或保存到 AICarry 服务器。

只有当用户选择接力模式并点击复制操作后，接力文本才会写入系统剪贴板。此后，剪贴板内容可由用户以及用户主动粘贴到的应用读取。

AICarry 不会出售、出租、授权、共享对话内容，也不会把它用于广告、画像、信贷决策或模型训练。

### 网络行为

AICarry 会观察四个受支持 AI 网站发起的部分网络响应，但不会把对话内容发送给开发者或无关第三方。

只有用户点击目标平台后，扩展才会打开该网站；目标网站后续的数据处理受其自身隐私政策约束。

### 用户控制

对话抓取默认关闭，用户可以在侧边栏随时开启或关闭。

**设置 → 清除所有记录** 会删除本地保存的会话记录。为保留用户偏好，部分设置可能继续保留。开启抓取后重新访问受支持的对话页面，相关会话可能再次被抓取。

卸载 AICarry 后，Chrome 会删除该扩展的本地存储。

### 权限说明

- `storage`：在本地保存对话和设置。
- `clipboardWrite`：在用户主动操作后复制接力文本。
- `activeTab` 和 `tabs`：识别当前受支持的网站，并在用户切换标签页时更新侧边栏。
- `sidePanel`：提供扩展界面。
- 四个受支持域名的访问权限：只在这些 AI 对话网站运行抓取桥接代码。

### 未来的付费功能

如果未来版本加入可选账号、授权或计费服务，我们会在该功能发布前更新本政策和 Chrome Web Store 数据披露。除非另行明确说明并取得用户主动同意，对话内容不会进入授权或计费服务。

### 联系方式与源代码

源代码：<https://github.com/lipeng3g/ai-relay>
问题或隐私请求：<https://github.com/lipeng3g/ai-relay/issues>
