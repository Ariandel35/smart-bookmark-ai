(function initSmartBookmarkRules(globalScope) {
  function parseProtectedRootFolders(rawValue) {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return [];
    }

    return Array.from(
      new Set(
        rawValue
          .split(/[\n,]+/g)
          .map((value) => normalizeFolderSegment(value))
          .filter(Boolean)
      )
    );
  }

  function parseDomainFolderRules(rawValue, manualFolderTitle = "Needs Manual Review") {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return [];
    }

    return rawValue
      .split(/\n+/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseSingleDomainFolderRule(line, manualFolderTitle))
      .filter(Boolean);
  }

  function parseSingleDomainFolderRule(line, manualFolderTitle) {
    const match = line.match(/^(.+?)(?:=>|=|->|→)(.+)$/);
    if (!match) {
      return null;
    }

    const domain = normalizeDomainPattern(match[1]);
    const folderPath = normalizeFolderPathRule(match[2], manualFolderTitle);
    if (!domain || !folderPath.length) {
      return null;
    }

    return {
      domain,
      folderPath
    };
  }

  function normalizeDomainPattern(value) {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return "";
    }

    if (/^https?:\/\//.test(trimmed)) {
      try {
        return new URL(trimmed).hostname.toLowerCase();
      } catch (error) {
        return "";
      }
    }

    return trimmed.replace(/\/+$/, "");
  }

  function normalizeFolderPathRule(value, manualFolderTitle) {
    const rawSegments = typeof value === "string" ? value.split(/\/|>|\\|\||｜|→|➡/g) : [];
    const cleaned = rawSegments
      .map((segment) => normalizeFolderSegment(segment))
      .filter(Boolean)
      .slice(0, 2);

    if (cleaned.includes(manualFolderTitle)) {
      return [manualFolderTitle];
    }

    return cleaned;
  }

  function normalizeFolderSegment(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value
      .replace(/[\r\n\t]/g, " ")
      .replace(/[\/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  }

  function matchDomainRule(hostname, rules) {
    const normalizedHost = typeof hostname === "string" ? hostname.trim().toLowerCase() : "";
    if (!normalizedHost) {
      return null;
    }

    const safeRules = Array.isArray(rules) ? rules : [];
    return (
      safeRules.find((rule) => {
        if (!rule?.domain) {
          return false;
        }

        if (rule.domain.startsWith("*.")) {
          const suffix = rule.domain.slice(2);
          return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
        }

        return normalizedHost === rule.domain || normalizedHost.endsWith(`.${rule.domain}`);
      }) || null
    );
  }

  function normalizeUrlForFingerprint(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return "";
    }

    try {
      const url = new URL(rawUrl);
      url.hash = "";
      return `${url.protocol}//${url.host}${url.pathname}${url.search}`.replace(/\/$/, "");
    } catch (error) {
      return rawUrl.trim().toLowerCase();
    }
  }

  function normalizeTitleForFingerprint(title) {
    return String(title || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function buildBookmarkFingerprint(bookmark) {
    return [
      normalizeUrlForFingerprint(bookmark?.url || ""),
      normalizeTitleForFingerprint(bookmark?.title || "")
    ].join("|");
  }

  function buildClassificationSignature(config, manualFolderTitle) {
    const payload = {
      prompt: String(config?.customPrompt || "").trim(),
      provider: String(config?.provider || "").trim(),
      model: String(config?.model || "").trim(),
      domainFolderRules: parseDomainFolderRules(config?.domainFolderRules || "", manualFolderTitle),
      protectedRootFolders: parseProtectedRootFolders(config?.protectedRootFolders || ""),
      manualFolderTitle: String(manualFolderTitle || "").trim()
    };

    return JSON.stringify(payload);
  }

  const api = {
    parseProtectedRootFolders,
    parseDomainFolderRules,
    matchDomainRule,
    buildBookmarkFingerprint,
    buildClassificationSignature,
    normalizeDomainPattern,
    normalizeFolderPathRule,
    normalizeFolderSegment,
    normalizeUrlForFingerprint
  };

  globalScope.SmartBookmarkRules = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
