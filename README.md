<p align="center">
  <img src="client/public/assets/logo.svg" height="256">
  <h1 align="center">Cybernetics · Agentic Centre</h1>
</p>

<p align="center">
  <strong>Centralized Agentic Platform of Cybernetics</strong>
</p>

<p align="center">
  <strong>English</strong> ·
  <a href="README.zh.md">中文</a>
</p>

> Built on [LibreChat](https://github.com/danny-avila/LibreChat). See
> [Upstream](#-upstream) for what that means and where the underlying
> documentation lives.

## 🚀 What's New in v0.8.8-rc1

- **Agent run control:** Interrupt or steer an Agent mid-run, queue follow-up messages, and reclaim, edit, or escalate pending steers.
- **Human-in-the-loop Agents:** Agents stream question progress, ask up to four related questions in one form, pause for input or tool approval, and resume.
- **Unified Agent Builder:** A redesigned Tools marketplace brings together Skills, MCP, Code Interpreter, orchestration, Programmatic Tool Calling, model-spec controls, and per-tool background and intent settings.
- **Readable Agent activity:** Generated activity-group headers, parent phase summaries, and live tool intent labels make long reasoning and tool runs easier to scan.
- **Code Interpreter workflows:** Code and shell tools can run in the background, sandbox images return as viewable artifacts, and highly experimental stateful sessions can reuse prewarmed conversation workspaces.
- **Agent extensibility:** Experimental Agent Plugins can bundle deployment Skills, MCP servers, and opt-in command hooks, while explicit subagents initialize only when selected.
- **Memory, context, and identity:** Agents can manage memory with optional per-agent isolation, expose support contacts safely, and show a more faithful Context Usage gauge.
- **Sharing and files:** Shared conversations show a badge and update at a stable URL, while signed-in viewers can continue them as personal copies.
- **Artifact workflows:** Open previews fullscreen, work with PowerPoint `.potx` templates across upload, search, and code execution, upload shell scripts across common MIME variants, export Mermaid diagrams as SVG or PNG, and download original Office files from the artifact panel.
- **Models and reasoning:** Added GPT-5.6 with Responses API reasoning controls, Claude Opus 5 and Sonnet 5, Gemini 3.7 and 3.6 Flash, and Gemini 3.5 Flash-Lite.
- **Langfuse observability:** Configure encrypted Langfuse connections in-app, let authorized admins open sampled sessions directly, optionally fan out traces by tenant, and suppress central export per run.
- **Administration and security:** Delegate config sections, encrypt registered secrets, enforce SSRF checks for speech, OCR, and web tools, and generate unique temporary credentials when secrets are blank.
- **Messages and navigation:** Right-aligned user turns, unified multi-part editing, full-message copy, a dock-style message rail, virtualized search, smooth streaming, and faster Agent startup.
- **Streaming and tool reliability:** Adaptive provider smoothing, Redis delta batching, dynamic MCP tool refresh, parsed MCP response media types, runtime OAuth recovery, and Agent stream circuit breakers improve long-running workflows.
- **Deployment and reliability:** Added configurable HTTP timeouts, Amazon DocumentDB 5.0+ support, low-noise Redis and browser observability, and a rolling-upgrade-safe generation protocol.

Read the [full upstream v0.8.8-rc1 changelog](https://www.librechat.ai/changelog/v0.8.8-rc1).

# ✨ Features

- 🖥️ **UI & Experience** inspired by ChatGPT with enhanced design and features

- 🤖 **AI Model Selection**:  
  - Anthropic (Claude), AWS Bedrock, OpenAI, Azure OpenAI, Google, Vertex AI, OpenAI Responses API (incl. Azure)
  - [Custom Endpoints](https://www.librechat.ai/docs/quick_start/custom_endpoints): Use any OpenAI-compatible API with Cybernetics, no proxy required
  - Compatible with [Local & Remote AI Providers](https://www.librechat.ai/docs/configuration/librechat_yaml/ai_endpoints):
    - Ollama, groq, Cohere, Mistral AI, Apple MLX, koboldcpp, together.ai,
    - OpenRouter, Helicone, Perplexity, ShuttleAI, Deepseek, Qwen, and more

- 🔧 **[Code Interpreter API](https://www.librechat.ai/docs/features/code_interpreter)**: 
  - Secure, Sandboxed Execution in Python, Node.js (JS/TS), Go, C/C++, Java, PHP, Rust, and Fortran
  - Seamless File Handling: Upload, process, and download files directly
  - No Privacy Concerns: Fully isolated and secure execution
  - Open-Source & Self-Hostable: powered by [ClickHouse/code-interpreter](https://github.com/ClickHouse/code-interpreter)

- 🔦 **Agents & Tools Integration**:  
  - **[Agents](https://www.librechat.ai/docs/features/agents)**:
    - No-Code Custom Assistants: Build specialized, AI-driven helpers
    - Agent Marketplace: Discover and deploy community-built agents
    - Collaborative Sharing: Share agents with specific users and groups
    - Flexible & Extensible: Use MCP Servers, tools, file search, code execution, and more
    - [Skills](https://www.librechat.ai/docs/features/skills): Create reusable `SKILL.md` instruction bundles for manual, automatic, or always-on agent workflows
    - [Agent Plugins](https://www.librechat.ai/docs/features/agent_plugins): Experimentally bundle deployment Skills and MCP servers into startup-loaded packages
    - [Subagents](https://www.librechat.ai/docs/features/subagents): Delegate focused work to isolated child agent runs with their own context windows
    - Compatible with Custom Endpoints, OpenAI, Azure, Anthropic, AWS Bedrock, Google, Vertex AI, Responses API, and more
    - [Model Context Protocol (MCP) Support](https://modelcontextprotocol.io/clients#librechat) for Tools

- 🔍 **Web Search**:  
  - Search the internet and retrieve relevant information to enhance your AI context
  - Combines search providers, content scrapers, and result rerankers for optimal results
  - **Customizable Jina Reranking**: Configure custom Jina API URLs for reranking services
  - **[Learn More →](https://www.librechat.ai/docs/features/web_search)**

- 🪄 **Generative UI with Code Artifacts**:  
  - [Code Artifacts](https://youtu.be/GfTj7O4gmd0?si=WJbdnemZpJzBrJo3) create React, HTML, and Mermaid content directly in chat
  - Open previews fullscreen and export Mermaid diagrams as SVG or PNG

- 🎨 **Image Generation & Editing**
  - Text-to-image and image-to-image with [GPT-Image-1](https://www.librechat.ai/docs/features/image_gen#1--openai-image-tools-recommended)
  - Text-to-image with [DALL-E (3/2)](https://www.librechat.ai/docs/features/image_gen#2--dalle-legacy), [Stable Diffusion](https://www.librechat.ai/docs/features/image_gen#3--stable-diffusion-local), [Flux](https://www.librechat.ai/docs/features/image_gen#4--flux), or any [MCP server](https://www.librechat.ai/docs/features/image_gen#5--model-context-protocol-mcp)
  - Produce stunning visuals from prompts or refine existing images with a single instruction

- 💾 **Presets & Context Management**:  
  - Create, Save, & Share Custom Presets  
  - Switch between AI Endpoints and Presets mid-chat
  - Edit, Resubmit, and Continue Messages with Conversation branching  
  - Create and share prompts with specific users and groups
  - [Fork Messages & Conversations](https://www.librechat.ai/docs/features/fork) for Advanced Context control

- 💬 **Multimodal & File Interactions**:  
  - Upload and analyze images with Claude 3, GPT-4.5, GPT-4o, o1, Llama-Vision, and Gemini 📸  
  - Chat with Files using Custom Endpoints, OpenAI, Azure, Anthropic, AWS Bedrock, & Google 🗃️

- 🌎 **Multilingual UI**:
  - English, 中文 (简体), 中文 (繁體), العربية, Deutsch, Español, Français, Italiano
  - Polski, Português (PT), Português (BR), Русский, 日本語, Svenska, 한국어, Tiếng Việt
  - Türkçe, Nederlands, עברית, Català, Čeština, Dansk, Eesti, فارسی
  - Suomi, Magyar, Հայերեն, Bahasa Indonesia, ქართული, Latviešu, ไทย, ئۇيغۇرچە

- 🧠 **Reasoning UI**:  
  - Dynamic Reasoning UI for Chain-of-Thought/Reasoning AI models like DeepSeek-R1

- 🎨 **Customizable Interface**:  
  - Customizable Dropdown & Interface that adapts to both power users and newcomers

- 🌊 **[Resumable Streams](https://www.librechat.ai/docs/features/resumable_streams)**:  
  - Never lose a response: AI responses automatically reconnect and resume if your connection drops
  - Multi-Tab & Multi-Device Sync: Open the same chat in multiple tabs or pick up on another device
  - Production-Ready: Works from single-server setups to horizontally scaled deployments with Redis

- 🗣️ **Speech & Audio**:  
  - Chat hands-free with Speech-to-Text and Text-to-Speech  
  - Automatically send and play Audio  
  - Supports OpenAI, Azure OpenAI, and Elevenlabs

- 📥 **Import & Export Conversations**:  
  - Import Conversations from LibreChat, ChatGPT, Chatbot UI  
  - Export conversations as screenshots, markdown, text, json

- 🔍 **Search & Discovery**:  
  - Search all messages/conversations

- 👥 **Multi-User & Secure Access**:
  - Multi-User, Secure Authentication with OAuth2, LDAP, & Email Login Support
  - Built-in Moderation, and Token spend tools

- 🎛️ **[Admin Panel](https://www.librechat.ai/docs/features/admin_panel)**:
  - Browser-based UI to manage users, groups, roles, and configuration overrides
  - Edit settings and per-role/group permissions live, without redeploying
  - Bundled with the Docker Compose stacks for one-command setup

- ⚙️ **Configuration & Deployment**:  
  - Configure Proxy, Reverse Proxy, Docker, & many Deployment options  
  - Use [S3 with CloudFront](https://www.librechat.ai/docs/configuration/cdn/cloudfront) for stable media links, edge delivery, signed cookies, and secured downloads
  - Use completely local or deploy on the cloud

- 📖 **Open-Source & Community**:  
  - Completely Open-Source & Built in Public  
  - Community-driven development, support, and feedback

[For a thorough review of these features, see the upstream docs](https://docs.librechat.ai/) 📚

## 🪶 All-In-One AI Conversations with Cybernetics

Agentic Centre is the centralized application of the Cybernetics ecosystem — a self-hosted AI chat platform that unifies all major AI providers in a single, privacy-focused interface.

Beyond chat, it provides AI Agents, Model Context Protocol (MCP) support, Artifacts, Code Interpreter, custom actions, conversation search, and enterprise-ready multi-user authentication.

Self-hosted and built for anyone who values control over their AI infrastructure.

---

## 🌐 Upstream

Agentic Centre is a fork of LibreChat. The feature documentation linked above is
maintained upstream and applies to this codebase.

**Upstream project:**
  - **Repository:** [github.com/danny-avila/LibreChat](https://github.com/danny-avila/LibreChat)
  - **Documentation:** [librechat.ai/docs](https://librechat.ai/docs)
  - **Releases:** [github.com/danny-avila/LibreChat/releases](https://github.com/danny-avila/LibreChat/releases)
  - **Changelog:** [librechat.ai/changelog](https://www.librechat.ai/changelog)
  - **RAG API:** [github.com/danny-avila/rag_api](https://github.com/danny-avila/rag_api)

**⚠️ Please consult the upstream [changelog](https://www.librechat.ai/changelog) for breaking changes before updating.**

Agentic Centre exists in its current state thanks to everyone who contributes to
LibreChat:

<a href="https://github.com/danny-avila/LibreChat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=danny-avila/LibreChat" />
</a>

---

## ✨ Contributions

Contributions, suggestions, bug reports and fixes are welcome!

For new features, components, or extensions, please open an issue and discuss before sending a PR.

If you'd like to help translate Agentic Centre into your language, we'd love your contribution! Improving translations not only makes the platform more accessible to users around the world but also enhances the overall user experience. Please check out the upstream [Translation Guide](https://www.librechat.ai/docs/translation).

---

## 🎉 Special Thanks

We thank [Locize](https://locize.com) for their translation management tools that support multiple languages in this project.

<p align="center">
  <a href="https://locize.com" target="_blank" rel="noopener noreferrer">
    <img src="https://github.com/user-attachments/assets/d6b70894-6064-475e-bb65-92a9e23e0077" alt="Locize Logo" height="50">
  </a>
</p>
