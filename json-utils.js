(function initSmartBookmarkJson(globalScope) {
  function extractJsonArray(rawText) {
    const value = extractJsonValue(rawText, "array");
    if (!Array.isArray(value)) {
      throw new Error("No valid JSON array was found.");
    }
    return value;
  }

  function extractJsonObject(rawText) {
    const value = extractJsonValue(rawText, "object");
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("No valid JSON object was found.");
    }
    return value;
  }

  function extractJsonValue(rawText, preferredType = "") {
    if (typeof rawText !== "string" || !rawText.trim()) {
      throw new Error("The model returned an empty string.");
    }

    const normalizedText = rawText.trim().replace(/^\uFEFF/, "");
    const direct = tryParseJsonCandidate(normalizedText, preferredType);
    if (direct !== null) {
      return direct;
    }

    const fencedCandidates = [];
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let fenceMatch;
    while ((fenceMatch = fenceRegex.exec(normalizedText))) {
      fencedCandidates.push(fenceMatch[1].trim());
    }

    for (const candidate of fencedCandidates) {
      const parsed = tryParseJsonCandidate(candidate, preferredType);
      if (parsed !== null) {
        return parsed;
      }
    }

    const stripped = normalizedText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const fragments = collectBalancedJsonFragments(stripped);
    for (const fragment of fragments) {
      const parsed = tryParseJsonCandidate(fragment, preferredType);
      if (parsed !== null) {
        return parsed;
      }
    }

    if (preferredType === "object") {
      throw new Error("No valid JSON object was found.");
    }

    throw new Error("No valid JSON array was found.");
  }

  function tryParseJsonCandidate(candidate, preferredType = "") {
    if (!candidate) {
      return null;
    }

    try {
      const parsed = JSON.parse(candidate);
      if (preferredType === "array") {
        if (Array.isArray(parsed)) {
          return parsed;
        }

        if (parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.items)) {
            return parsed.items;
          }

          if (Array.isArray(parsed.data)) {
            return parsed.data;
          }

          if (Array.isArray(parsed.bookmarks)) {
            return parsed.bookmarks;
          }
        }

        return null;
      }

      if (preferredType === "object") {
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }

        return null;
      }

      return parsed;
    } catch (error) {
      return null;
    }
  }

  function collectBalancedJsonFragments(text) {
    const fragments = [];

    for (let start = 0; start < text.length; start += 1) {
      const firstChar = text[start];
      if (firstChar !== "[" && firstChar !== "{") {
        continue;
      }

      const end = findBalancedJsonEnd(text, start);
      if (end !== -1) {
        fragments.push(text.slice(start, end + 1));
      }
    }

    return fragments;
  }

  function findBalancedJsonEnd(text, startIndex) {
    const stack = [];
    let inString = false;
    let escaping = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "[") {
        stack.push("]");
        continue;
      }

      if (char === "{") {
        stack.push("}");
        continue;
      }

      if (char === "]" || char === "}") {
        if (!stack.length || stack[stack.length - 1] !== char) {
          return -1;
        }

        stack.pop();
        if (!stack.length) {
          return index;
        }
      }
    }

    return -1;
  }

  const api = {
    extractJsonArray,
    extractJsonObject,
    extractJsonValue,
    tryParseJsonCandidate,
    collectBalancedJsonFragments,
    findBalancedJsonEnd
  };

  globalScope.SmartBookmarkJson = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
