(function initSmartBookmarkProviders(globalScope) {
  const PROVIDERS = {
    openai: {
      label: "OpenAI",
      apiStyle: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      apiKeyOptional: false
    },
    deepseek: {
      label: "DeepSeek",
      apiStyle: "openai",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKeyOptional: false
    },
    minimax: {
      label: "MiniMax",
      apiStyle: "openai",
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M2.7",
      apiKeyOptional: false
    },
    anthropic: {
      label: "Anthropic",
      apiStyle: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-5",
      apiKeyOptional: false
    },
    gemini: {
      label: "Google Gemini",
      apiStyle: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-2.5-flash",
      apiKeyOptional: false
    },
    openrouter: {
      label: "OpenRouter",
      apiStyle: "openai",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4.1-mini",
      apiKeyOptional: false
    },
    groq: {
      label: "Groq",
      apiStyle: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
      apiKeyOptional: false
    },
    xai: {
      label: "xAI",
      apiStyle: "openai",
      baseUrl: "https://api.x.ai/v1",
      model: "grok-3-mini",
      apiKeyOptional: false
    },
    moonshot: {
      label: "Moonshot AI",
      apiStyle: "openai",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "moonshot-v1-8k",
      apiKeyOptional: false
    },
    ollama: {
      label: "Ollama",
      apiStyle: "openai",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.2",
      apiKeyOptional: true
    },
    openai_compatible: {
      label: "OpenAI Compatible",
      apiStyle: "openai",
      baseUrl: "https://api.example.com/v1",
      model: "your-model",
      apiKeyOptional: true
    }
  };

  function cloneProvider(id, definition) {
    return {
      id,
      ...definition,
      headers: { ...(definition.headers || {}) }
    };
  }

  function getProvider(providerId = "openai") {
    const key = Object.prototype.hasOwnProperty.call(PROVIDERS, providerId) ? providerId : "openai";
    return cloneProvider(key, PROVIDERS[key]);
  }

  function listProviders() {
    return Object.keys(PROVIDERS).map((providerId) => getProvider(providerId));
  }

  function hasProvider(providerId) {
    return Object.prototype.hasOwnProperty.call(PROVIDERS, providerId);
  }

  function normalizeBaseUrl(baseUrl, fallback = "") {
    return String(baseUrl || fallback || "")
      .trim()
      .replace(/\/+$/, "");
  }

  function normalizeMessageContent(content) {
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }

          if (typeof part?.text === "string") {
            return part.text;
          }

          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();
    }

    return "";
  }

  function splitSystemAndMessages(messages) {
    const safeMessages = Array.isArray(messages) ? messages : [];
    const systemText = safeMessages
      .filter((message) => message?.role === "system")
      .map((message) => normalizeMessageContent(message.content))
      .filter(Boolean)
      .join("\n\n");
    const conversation = safeMessages
      .filter((message) => message?.role !== "system")
      .map((message) => ({
        role: message?.role === "assistant" ? "assistant" : "user",
        content: normalizeMessageContent(message?.content)
      }))
      .filter((message) => message.content);

    return {
      systemText,
      conversation
    };
  }

  function buildEndpoint(provider, config) {
    const baseUrl = normalizeBaseUrl(config?.baseUrl, provider.baseUrl);

    switch (provider.apiStyle) {
      case "anthropic":
        return /\/messages$/i.test(baseUrl) ? baseUrl : `${baseUrl}/messages`;
      case "gemini":
        return /:generateContent(?:\?|$)/i.test(baseUrl)
          ? baseUrl
          : `${baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`;
      default:
        return /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
    }
  }

  function buildHeaders(provider, config) {
    const headers = {
      "Content-Type": "application/json",
      ...(provider.headers || {})
    };

    switch (provider.apiStyle) {
      case "anthropic":
        if (config.apiKey) {
          headers["x-api-key"] = config.apiKey;
        }
        headers["anthropic-version"] = "2023-06-01";
        break;
      case "gemini":
        if (config.apiKey) {
          headers["x-goog-api-key"] = config.apiKey;
        }
        break;
      default:
        if (config.apiKey) {
          headers.Authorization = `Bearer ${config.apiKey}`;
        }
        break;
    }

    return headers;
  }

  function normalizeOutputTokenBudget(value) {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    return Math.min(8192, Math.max(64, parsed));
  }

  function buildOpenAiPayload(provider, config, messages, mode, outputTokenBudget = 0) {
    const payload = {
      model: config.model,
      messages: (Array.isArray(messages) ? messages : []).map((message) => ({
        role:
          message?.role === "assistant"
            ? "assistant"
            : message?.role === "system"
              ? "system"
              : "user",
        content: normalizeMessageContent(message?.content)
      })),
      temperature: mode === "test" ? 0 : provider.id === "minimax" ? 0.2 : 0.1,
      stream: false
    };

    if (mode === "test") {
      payload.max_tokens = 8;
    } else if (outputTokenBudget) {
      payload.max_tokens = outputTokenBudget;
    }

    if (provider.id === "minimax") {
      payload.reasoning_split = true;
    }

    return payload;
  }

  function buildAnthropicPayload(config, messages, mode, outputTokenBudget = 0) {
    const { systemText, conversation } = splitSystemAndMessages(messages);
    const payload = {
      model: config.model,
      max_tokens: mode === "test" ? 32 : outputTokenBudget || 2048,
      messages: conversation.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: [{ type: "text", text: message.content }]
      })),
      temperature: mode === "test" ? 0 : 0.1
    };

    if (systemText) {
      payload.system = systemText;
    }

    return payload;
  }

  function buildGeminiPayload(messages, mode, outputTokenBudget = 0) {
    const { systemText, conversation } = splitSystemAndMessages(messages);
    const userText = conversation
      .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}:\n${message.content}`)
      .join("\n\n")
      .trim();
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: userText }]
        }
      ]
    };

    if (systemText) {
      payload.system_instruction = {
        parts: [{ text: systemText }]
      };
    }

    if (mode !== "test") {
      payload.generationConfig = {
        temperature: 0.1,
        ...(outputTokenBudget ? { maxOutputTokens: outputTokenBudget } : {})
      };
    }

    return payload;
  }

  function buildRequest(config, messages, options = {}) {
    const provider = getProvider(config?.provider);
    const mode = options.mode === "test" ? "test" : "organize";
    const outputTokenBudget = normalizeOutputTokenBudget(options.outputTokenBudget);
    const endpoint = buildEndpoint(provider, config || {});
    const headers = buildHeaders(provider, config || {});
    let body;

    switch (provider.apiStyle) {
      case "anthropic":
        body = buildAnthropicPayload(config || {}, messages, mode, outputTokenBudget);
        break;
      case "gemini":
        body = buildGeminiPayload(messages, mode, outputTokenBudget);
        break;
      default:
        body = buildOpenAiPayload(provider, config || {}, messages, mode, outputTokenBudget);
        break;
    }

    return {
      provider,
      endpoint,
      headers,
      body
    };
  }

  function extractOpenAiText(responseBody) {
    const choice = responseBody?.choices?.[0];
    const messageContent = choice?.message?.content;

    if (typeof messageContent === "string") {
      return messageContent;
    }

    if (Array.isArray(messageContent)) {
      return messageContent
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }

          if (typeof part?.text === "string") {
            return part.text;
          }

          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();
    }

    if (typeof responseBody?.output_text === "string") {
      return responseBody.output_text;
    }

    return "";
  }

  function extractAnthropicText(responseBody) {
    return (Array.isArray(responseBody?.content) ? responseBody.content : [])
      .map((block) => (typeof block?.text === "string" ? block.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function extractGeminiText(responseBody) {
    return (Array.isArray(responseBody?.candidates) ? responseBody.candidates : [])
      .map((candidate) =>
        (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
          .map((part) => (typeof part?.text === "string" ? part.text : ""))
          .filter(Boolean)
          .join("\n")
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function extractText(responseBody, providerId) {
    const provider = getProvider(providerId);

    switch (provider.apiStyle) {
      case "anthropic":
        return extractAnthropicText(responseBody);
      case "gemini":
        return extractGeminiText(responseBody);
      default:
        return extractOpenAiText(responseBody);
    }
  }

  const api = {
    getProvider,
    listProviders,
    hasProvider,
    buildRequest,
    extractText
  };

  globalScope.SmartBookmarkProviders = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
