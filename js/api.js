const ApiClient = (() => {
  const memoryCache = new Map();

  function getCached(key) {
    const item = memoryCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      memoryCache.delete(key);
      return null;
    }
    return item.value;
  }

  function setCached(key, value, ttlMs = APP_CONFIG.CLIENT_CACHE_TTL_MS) {
    memoryCache.set(key, { value, expiry: Date.now() + ttlMs });
  }

  async function fetchWithRetry(url, options = {}, retries = 3) {
    let delay = 500;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, delay + Math.random() * 300));
        delay *= 2;
      }
    }
  }

  async function getPublicInit() {
    const cached = getCached('PUBLIC_INIT');
    if (cached) return cached;
    const data = await fetchWithRetry(`${APP_CONFIG.GAS_API_URL}?action=public_init`, { method: 'GET' });
    if (data && data.success) setCached('PUBLIC_INIT', data);
    return data;
  }

  async function searchStudent(query) {
    const cacheKey = `SEARCH_${query.trim().toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const data = await fetchWithRetry(APP_CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'search_student', query })
    });
    if (data && data.success) setCached(cacheKey, data, 60000);
    return data;
  }

  async function adminRequest(payload) {
    const token = sessionStorage.getItem('PHP_ADMIN_TOKEN');
    const data = await fetchWithRetry(APP_CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, token })
    });
    if (data && data.code === 401) {
      SecurityManager.forceLogout('Sesi telah berakhir. Silakan login kembali.');
    }
    return data;
  }

  function clearCache() { memoryCache.clear(); }

  return { getPublicInit, searchStudent, adminRequest, clearCache };
})();