(function initMarkoCache(globalScope) {
  const DEAD_LINK_TTL_MS = {
    dead: 14 * 24 * 60 * 60 * 1000,
    healthy: 7 * 24 * 60 * 60 * 1000,
    uncertain: 24 * 60 * 60 * 1000,
    error: 6 * 60 * 60 * 1000
  };

  function normalizeCacheUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return "";
    }

    try {
      const url = new URL(rawUrl);
      url.hash = "";
      return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
    } catch (error) {
      return rawUrl.trim();
    }
  }

  function classifyHealthState(result) {
    if (result?.isDead) {
      return "dead";
    }

    if (result?.isHealthy) {
      return "healthy";
    }

    return result?.reason ? "uncertain" : "error";
  }

  function createDeadLinkCacheEntry(rawUrl, result, now = Date.now()) {
    const cacheKey = normalizeCacheUrl(rawUrl);
    if (!cacheKey) {
      return null;
    }

    return {
      cacheKey,
      checkedAt: now,
      state: classifyHealthState(result),
      result: {
        isDead: Boolean(result?.isDead),
        isHealthy: Boolean(result?.isHealthy),
        shouldRetryWithGet: Boolean(result?.shouldRetryWithGet),
        reason: String(result?.reason || "")
      }
    };
  }

  function isDeadLinkCacheFresh(entry, now = Date.now()) {
    if (!entry?.checkedAt || !entry?.state || !DEAD_LINK_TTL_MS[entry.state]) {
      return false;
    }

    return now - Number(entry.checkedAt) <= DEAD_LINK_TTL_MS[entry.state];
  }

  function trimCacheEntries(map, maxEntries = 3000) {
    const safeEntries = Object.entries(map || {}).sort(
      (a, b) => Number(b[1]?.checkedAt || 0) - Number(a[1]?.checkedAt || 0)
    );

    return Object.fromEntries(safeEntries.slice(0, maxEntries));
  }

  const api = {
    DEAD_LINK_TTL_MS,
    normalizeCacheUrl,
    createDeadLinkCacheEntry,
    isDeadLinkCacheFresh,
    trimCacheEntries
  };

  globalScope.MarkoCache = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
