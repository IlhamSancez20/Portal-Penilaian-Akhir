const SecurityManager = (() => {
  let lastActivity = Date.now();
  let warningStage = 0;
  let idleTimerId = null;

  function init() {
    const btnOpen = document.getElementById('btnOpenLogin');
    const btnClose = document.getElementById('btnCloseLogin');
    const btnLogout = document.getElementById('btnAdminLogout');
    const brandHome = document.getElementById('brandHome');

    if (btnOpen) btnOpen.addEventListener('click', () => document.getElementById('loginModal').classList.remove('hidden'));
    if (btnClose) btnClose.addEventListener('click', () => document.getElementById('loginModal').classList.add('hidden'));
    if (btnLogout) btnLogout.addEventListener('click', () => logoutUser(false));
    if (brandHome) brandHome.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    document.querySelectorAll('.toggle-pass-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const isPass = target.type === 'password';
        target.type = isPass ? 'text' : 'password';
        btn.textContent = isPass ? '🙈' : '👁️';
      });
    });

    document.getElementById('adminLoginForm').addEventListener('submit', handleLoginSubmit);
    document.getElementById('assignClassForm').addEventListener('submit', handleAssignClassSubmit);
    document.getElementById('btnStayActive').addEventListener('click', resetIdleState);

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, () => {
        if (warningStage === 0) lastActivity = Date.now();
      }, { passive: true });
    });

    restoreSessionIfAny();
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginErrorMsg');
    const btn = document.getElementById('btnSubmitLogin');

    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Memverifikasi...';

    try {
      const res = await ApiClient.adminRequest({ action: 'admin_login', username: u, password: p });
      if (!res || !res.success) {
        errEl.textContent = res?.message || 'Login gagal.';
        errEl.classList.remove('hidden');
        return;
      }

      sessionStorage.setItem('PHP_ADMIN_TOKEN', res.token);
      sessionStorage.setItem('PHP_ADMIN_USER', JSON.stringify(res.admin));
      document.getElementById('loginModal').classList.add('hidden');
      document.getElementById('adminLoginForm').reset();

      const isSuper = res.admin.id === 'ADM-001' || res.admin.role === 'Super Admin';
      if (!isSuper && !res.admin.kelas_diampu) {
        openAssignClassModal(res.availableClasses || []);
      } else {
        enterAdminView(res.admin);
      }
    } catch (err) {
      errEl.textContent = 'Gangguan jaringan saat login.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk Portal';
    }
  }

  function openAssignClassModal(classesList) {
    const box = document.getElementById('assignClassCheckboxes');
    box.innerHTML = classesList.length > 0
      ? classesList.map(c => `
          <label class="checkbox-item">
            <input type="checkbox" value="${GuestApp.escapeHtml(c.nama_kelas)}" />
            <span>${GuestApp.escapeHtml(c.nama_kelas)} (${GuestApp.escapeHtml(c.tingkat)})</span>
          </label>
        `).join('')
      : `<p class="muted">Belum ada data kelas di Master Kelas. Hubungi Admin Pertama.</p>`;

    document.getElementById('assignClassModal').classList.remove('hidden');
  }

  async function handleAssignClassSubmit(e) {
    e.preventDefault();
    const checked = Array.from(document.querySelectorAll('#assignClassCheckboxes input:checked')).map(el => el.value);
    const errEl = document.getElementById('assignClassError');

    if (checked.length === 0) {
      errEl.textContent = 'Pilih minimal 1 kelas yang Anda ampu.';
      errEl.classList.remove('hidden');
      return;
    }

    errEl.classList.add('hidden');
    const res = await ApiClient.adminRequest({ action: 'save_assigned_classes', classes: checked });
    if (res && res.success) {
      const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
      admin.kelas_diampu = res.kelas_diampu;
      sessionStorage.setItem('PHP_ADMIN_USER', JSON.stringify(admin));
      document.getElementById('assignClassModal').classList.add('hidden');
      showToast(res.message);
      enterAdminView(admin);
    } else {
      errEl.textContent = res?.message || 'Gagal menyimpan kelas ampuan.';
      errEl.classList.remove('hidden');
    }
  }

  function restoreSessionIfAny() {
    const token = sessionStorage.getItem('PHP_ADMIN_TOKEN');
    const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || 'null');
    if (token && admin) {
      enterAdminView(admin);
    }
  }

  function enterAdminView(admin) {
    document.getElementById('guestView').classList.add('hidden');
    document.getElementById('adminView').classList.remove('hidden');
    document.getElementById('btnOpenLogin').classList.add('hidden');
    document.getElementById('btnAdminLogout').classList.remove('hidden');

    document.getElementById('adminWelcomeText').textContent =
      `${admin.nama_admin} • Role: ${admin.role} • Mapel: ${admin.mata_pelajaran || '-'} • Kelas: ${admin.kelas_diampu || 'Semua'}`;

    startIdleMonitor();
    AdminApp.loadDashboard();
  }

  function startIdleMonitor() {
    if (idleTimerId) clearInterval(idleTimerId);
    lastActivity = Date.now();
    warningStage = 0;

    idleTimerId = setInterval(() => {
      if (!sessionStorage.getItem('PHP_ADMIN_TOKEN')) return;
      const idleMs = Date.now() - lastActivity;
      const [t1, t2, t3] = APP_CONFIG.IDLE_THRESHOLDS_MS;

      if (idleMs >= t3) {
        forceLogout('Sesi otomatis keluar setelah 3 peringatan tidak ada aktivitas.');
      } else if (idleMs >= t2 && warningStage < 2) {
        warningStage = 2;
        showIdleModal('PERINGATAN 2 / 3', 'Sesi Anda akan segera berakhir dalam 1 menit jika tetap tidak aktif.');
      } else if (idleMs >= t1 && warningStage < 1) {
        warningStage = 1;
        showIdleModal('PERINGATAN 1 / 3', 'Tidak terdeteksi aktivitas selama 3 menit.');
      }
    }, 3000);
  }

  function showIdleModal(badgeText, descText) {
    ThemeAudio.playWarning();
    document.getElementById('idleWarningBadge').textContent = badgeText;
    document.getElementById('idleWarningDesc').textContent = descText;
    document.getElementById('idleWarningModal').classList.remove('hidden');
  }

  function resetIdleState() {
    lastActivity = Date.now();
    warningStage = 0;
    document.getElementById('idleWarningModal').classList.add('hidden');
  }

  async function logoutUser(silent = false) {
    try { await ApiClient.adminRequest({ action: 'admin_logout' }); } catch (e) {}
    forceLogout(silent ? '' : 'Anda telah keluar dari portal admin.');
  }

  function forceLogout(msg) {
    sessionStorage.removeItem('PHP_ADMIN_TOKEN');
    sessionStorage.removeItem('PHP_ADMIN_USER');
    if (idleTimerId) clearInterval(idleTimerId);
    document.getElementById('idleWarningModal').classList.add('hidden');
    document.getElementById('adminView').classList.add('hidden');
    document.getElementById('guestView').classList.remove('hidden');
    document.getElementById('btnOpenLogin').classList.remove('hidden');
    document.getElementById('btnAdminLogout').classList.add('hidden');
    if (msg) showToast(msg);
  }

  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast animate-pop';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  return { init, showToast, forceLogout };
})();

document.addEventListener('DOMContentLoaded', () => SecurityManager.init());