# Bleam Chat

Bleam Chat adds a built-in chat participant that connects to an OpenAI-compatible API so you can use the editor like Cursor or Claude Code without installing extra extensions.

## Setup

1. Configure your API key in settings:
   - `bleamChat.apiKey`: API key for your provider
   - or set the `BLEAM_CHAT_API_KEY` environment variable
2. Optionally point to a custom endpoint:
   - `bleamChat.baseUrl`: for example `http://localhost:11434/v1` (Ollama) or any OpenAI-compatible gateway
3. Choose a model:
   - `bleamChat.model`: defaults to `gpt-4o-mini`

## Tips

- Use `bleamChat.systemPrompt` to tailor the assistant to your workflow.
- Set `bleamChat.includeHistory` to `false` if you want single-turn responses only.
- Use `bleamChat.maxTokens` and `bleamChat.temperature` to control response size and creativity.
