const ApiClient = (() => {
  const CACHE_KEY = 'PHP_PUBLIC_CACHE_V5';
  const CACHE_MAX_AGE = 3 * 60 * 1000;

  async function fetchWithRetry(url, options = {}, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json && json.code === 401 && typeof SecurityManager !== 'undefined') {
          SecurityManager.forceLogout('Sesi login telah habis. Silakan masuk kembali.');
        }
        return json;
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
      }
    }
  }

  async function getPublicInit() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.ts < CACHE_MAX_AGE) {
        return cached.data;
      }
    } catch (e) {}

    const data = await fetchWithRetry(`${APP_CONFIG.API_URL}?action=public_init`);
    if (data && data.success) {
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      } catch (e) {}
    }
    return data;
  }

  async function searchStudent(query) {
    return fetchWithRetry(APP_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'search_student', query })
    });
  }

  async function adminRequest(payload) {
    const token = sessionStorage.getItem('PHP_ADMIN_TOKEN') || '';
    return fetchWithRetry(APP_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, token })
    });
  }

  function clearCache() {
    sessionStorage.removeItem(CACHE_KEY);
  }

  return { getPublicInit, searchStudent, adminRequest, clearCache };
})();