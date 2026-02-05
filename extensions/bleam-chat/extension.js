const http = require('http');
const https = require('https');
const { URL } = require('url');
const vscode = require('vscode');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

function activate(context) {
  const participant = vscode.chat.createChatParticipant('bleam.chat', async (request, chatContext, response, token) => {
    const settings = getSettings();

    if (!settings.apiKey) {
      response.markdown('Bleam Chat needs an API key. Set `bleamChat.apiKey` or the `BLEAM_CHAT_API_KEY` environment variable.');
      return;
    }

    response.progress('Contacting the model...');

    try {
      const messages = buildMessages(request, chatContext, settings);
      const reply = await requestChatCompletion({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        messages,
        token
      });

      if (!reply) {
        response.markdown('No response received from the model.');
        return;
      }

      response.markdown(reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.markdown(`Bleam Chat ran into an error: ${message}`);
    }
  });

  context.subscriptions.push(participant);
}

function deactivate() {}

function getSettings() {
  const config = vscode.workspace.getConfiguration('bleamChat');
  return {
    apiKey: config.get('apiKey') || process.env.BLEAM_CHAT_API_KEY || '',
    baseUrl: config.get('baseUrl') || process.env.BLEAM_CHAT_BASE_URL || DEFAULT_BASE_URL,
    model: config.get('model') || process.env.BLEAM_CHAT_MODEL || 'gpt-4o-mini',
    temperature: normalizeNumber(config.get('temperature'), Number(process.env.BLEAM_CHAT_TEMPERATURE) || 0.2),
    maxTokens: normalizeNumber(config.get('maxTokens'), Number(process.env.BLEAM_CHAT_MAX_TOKENS) || 1024),
    systemPrompt: config.get('systemPrompt') || 'You are Bleam, a helpful coding assistant.',
    includeHistory: config.get('includeHistory') !== false
  };
}

function normalizeNumber(value, fallback) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
}

function buildMessages(request, chatContext, settings) {
  const messages = [];

  if (settings.systemPrompt) {
    messages.push({ role: 'system', content: settings.systemPrompt });
  }

  if (settings.includeHistory) {
    for (const turn of chatContext.history) {
      if (typeof turn.prompt === 'string') {
        messages.push({ role: 'user', content: turn.prompt });
        continue;
      }

      if (Array.isArray(turn.response)) {
        const assistantText = collectAssistantText(turn.response);
        if (assistantText) {
          messages.push({ role: 'assistant', content: assistantText });
        }
      }
    }
  }

  messages.push({ role: 'user', content: request.prompt });
  return messages;
}

function collectAssistantText(parts) {
  const chunks = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      continue;
    }

    if ('value' in part) {
      const value = part.value;
      if (typeof value === 'string') {
        chunks.push(value);
        continue;
      }

      if (value && typeof value.value === 'string') {
        chunks.push(value.value);
      }
    }
  }

  return chunks.join('\n').trim();
}

function requestChatCompletion({ apiKey, baseUrl, model, temperature, maxTokens, messages, token }) {
  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  };

  const url = buildChatCompletionUrl(baseUrl);
  const headers = {
    Authorization: `Bearer ${apiKey}`
  };

  return requestJson(url, headers, payload, token).then((data) => {
    if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error('The model returned an empty response.');
    }

    const message = data.choices[0]?.message?.content;
    if (!message) {
      throw new Error('The model response did not contain message content.');
    }

    return message.trim();
  });
}

function buildChatCompletionUrl(baseUrl) {
  const url = new URL(baseUrl || DEFAULT_BASE_URL);
  const trimmed = url.pathname.replace(/\/$/, '');
  url.pathname = `${trimmed}/chat/completions`;
  return url;
}

function requestJson(url, headers, body, token) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'http:' ? http : https;
    const bodyText = JSON.stringify(body);

    const req = client.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyText),
          ...headers
        }
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Request failed (${res.statusCode}): ${data}`));
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error('Failed to parse model response.'));
          }
        });
      }
    );

    req.on('error', reject);

    if (token) {
      token.onCancellationRequested(() => {
        req.destroy(new Error('Request cancelled.'));
      });
    }

    req.write(bodyText);
    req.end();
  });
}

module.exports = {
  activate,
  deactivate
};
