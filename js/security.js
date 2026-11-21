const SecurityManager = (() => {
  let idleStart = Date.now();
  let currentStage = 0;
  let idleChecker = null;
  let logoutCountdownTimer = null;

  function init() {
    document.querySelectorAll('.toggle-pass-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        btn.textContent = isPass ? '🙈' : '👁️';
      });
    });

    document.getElementById('btnOpenLogin').addEventListener('click', () => {
      document.getElementById('loginModal').classList.remove('hidden');
    });
    document.getElementById('btnCloseLogin').addEventListener('click', () => {
      document.getElementById('loginModal').classList.add('hidden');
    });

    document.getElementById('adminLoginForm').addEventListener('submit', handleLoginSubmit);
    document.getElementById('assignClassForm').addEventListener('submit', handleSaveAssignedClasses);
    document.getElementById('btnAdminLogout').addEventListener('click', () => forceLogout('Anda telah logout.'));
    document.getElementById('btnStayActive').addEventListener('click', resetIdleTimer);

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, () => {
        if (currentStage === 0) idleStart = Date.now();
      }, { passive: true });
    });

    if (sessionStorage.getItem('PHP_ADMIN_TOKEN')) {
      const savedAdmin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
      const savedClasses = JSON.parse(sessionStorage.getItem('PHP_AVAIL_CLASSES') || '[]');
      activateAdminSession(savedAdmin, savedClasses);
    }
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginErrorMsg');
    const btn = document.getElementById('btnSubmitLogin');

    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Memverifikasi...';

    try {
      const res = await fetch(APP_CONFIG.GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'admin_login', username, password })
      }).then(r => r.json());

      if (!res.success) {
        errEl.textContent = res.message;
        errEl.classList.remove('hidden');
        return;
      }

      sessionStorage.setItem('PHP_ADMIN_TOKEN', res.token);
      sessionStorage.setItem('PHP_ADMIN_USER', JSON.stringify(res.admin));
      sessionStorage.setItem('PHP_AVAIL_CLASSES', JSON.stringify(res.availableClasses || []));

      document.getElementById('loginModal').classList.add('hidden');
      document.getElementById('adminLoginForm').reset();

      activateAdminSession(res.admin, res.availableClasses || []);
    } catch (err) {
      errEl.textContent = 'Gagal terhubung ke server autentikasi.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk Portal';
    }
  }

  function activateAdminSession(admin, availableClasses = []) {
    document.getElementById('guestView').classList.add('hidden');
    document.getElementById('adminView').classList.remove('hidden');
    document.getElementById('btnOpenLogin').classList.add('hidden');
    document.getElementById('btnAdminLogout').classList.remove('hidden');

    const isSuper = admin.id === 'ADM-001' || admin.role === 'Super Admin';
    document.getElementById('adminPanelHeading').textContent = isSuper
      ? 'Dashboard Admin Pertama (Super Admin)'
      : `Dashboard Guru Mapel — ${admin.mata_pelajaran || ''}`;

    document.getElementById('adminWelcomeText').textContent = isSuper
      ? `${admin.nama_admin} • Hak Akses Penuh`
      : `${admin.nama_admin} • Mapel: ${admin.mata_pelajaran} • Kelas Ampuan: ${admin.kelas_diampu || 'Belum Dipilih'}`;

    if (!isSuper && !admin.kelas_diampu) {
      openAssignClassModal(availableClasses);
    }

    startIdleMonitor();
    AdminApp.loadDashboard();
  }

  function openAssignClassModal(availableClasses) {
    const box = document.getElementById('assignClassCheckboxes');
    const uniqueNames = [...new Set(availableClasses.map(c => c.nama_kelas))];

    if (uniqueNames.length === 0) {
      box.innerHTML = `<p class="error-text">Belum ada Master Kelas yang dibuat oleh Admin Pertama.</p>`;
    } else {
      box.innerHTML = uniqueNames.map(cls => `
        <label class="checkbox-item">
          <input type="checkbox" name="kelas_ampuan" value="${GuestApp.escapeHtml(cls)}" />
          <span>${GuestApp.escapeHtml(cls)}</span>
        </label>
      `).join('');
    }
    document.getElementById('assignClassModal').classList.remove('hidden');
  }

  async function handleSaveAssignedClasses(e) {
    e.preventDefault();
    const checked = Array.from(document.querySelectorAll('input[name="kelas_ampuan"]:checked')).map(el => el.value);
    const errEl = document.getElementById('assignClassError');

    if (checked.length === 0) {
      errEl.textContent = 'Pilih minimal 1 kelas yang Anda ampu.';
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    const res = await ApiClient.adminRequest({
      action: 'save_assigned_classes',
      classes: checked
    });

    if (res && res.success) {
      const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
      admin.kelas_diampu = res.kelas_diampu;
      sessionStorage.setItem('PHP_ADMIN_USER', JSON.stringify(admin));

      document.getElementById('assignClassModal').classList.add('hidden');
      document.getElementById('adminWelcomeText').textContent =
        `${admin.nama_admin} • Mapel: ${admin.mata_pelajaran} • Kelas Ampuan: ${admin.kelas_diampu}`;
      showToast(res.message);
      AdminApp.loadDashboard();
    } else {
      errEl.textContent = res?.message || 'Gagal menyimpan pilihan kelas.';
      errEl.classList.remove('hidden');
    }
  }

  function startIdleMonitor() {
    resetIdleTimer();
    clearInterval(idleChecker);

    idleChecker = setInterval(() => {
      if (!sessionStorage.getItem('PHP_ADMIN_TOKEN')) return;
      const idleDuration = Date.now() - idleStart;

      if (idleDuration >= APP_CONFIG.IDLE_TIMERS.WARNING_3_MS && currentStage < 3) {
        showWarningStage(3);
      } else if (idleDuration >= APP_CONFIG.IDLE_TIMERS.WARNING_2_MS && currentStage < 2) {
        showWarningStage(2);
      } else if (idleDuration >= APP_CONFIG.IDLE_TIMERS.WARNING_1_MS && currentStage < 1) {
        showWarningStage(1);
      }
    }, 1000);
  }

  function showWarningStage(stage) {
    currentStage = stage;
    ThemeAudio.playWarningBeep();

    const modal = document.getElementById('idleWarningModal');
    const badge = document.getElementById('idleWarningBadge');
    const title = document.getElementById('idleWarningTitle');
    const desc = document.getElementById('idleWarningDesc');

    modal.classList.remove('hidden');
    badge.textContent = `PERINGATAN ${stage} / 3`;

    if (stage === 1) {
      title.textContent = 'Peringatan 1: Tidak Ada Aktivitas';
      desc.textContent = 'Tidak terdeteksi interaksi selama 2 menit. Klik tombol di bawah untuk melanjutkan.';
    } else if (stage === 2) {
      title.textContent = 'Peringatan 2: Sesi Segera Berakhir';
      desc.textContent = 'Tidak ada interaksi selama 3 menit. Peringatan berikutnya akan mengeluarkan akun Anda.';
    } else if (stage === 3) {
      title.textContent = 'Peringatan 3 (Terakhir): Auto Logout!';
      desc.textContent = 'Akun akan otomatis logout dalam 15 detik demi keamanan database.';
      clearTimeout(logoutCountdownTimer);
      logoutCountdownTimer = setTimeout(() => {
        forceLogout('Logout otomatis karena tidak ada aktivitas hingga Peringatan 3.');
      }, APP_CONFIG.IDLE_TIMERS.LOGOUT_GRACE_MS);
    }
  }

  function resetIdleTimer() {
    idleStart = Date.now();
    currentStage = 0;
    clearTimeout(logoutCountdownTimer);
    document.getElementById('idleWarningModal').classList.add('hidden');
  }

  async function forceLogout(reason) {
    if (sessionStorage.getItem('PHP_ADMIN_TOKEN')) {
      ApiClient.adminRequest({ action: 'admin_logout' }).catch(() => {});
    }
    sessionStorage.removeItem('PHP_ADMIN_TOKEN');
    sessionStorage.removeItem('PHP_ADMIN_USER');
    sessionStorage.removeItem('PHP_AVAIL_CLASSES');
    clearInterval(idleChecker);
    clearTimeout(logoutCountdownTimer);

    document.getElementById('idleWarningModal').classList.add('hidden');
    document.getElementById('assignClassModal').classList.add('hidden');
    document.getElementById('adminView').classList.add('hidden');
    document.getElementById('guestView').classList.remove('hidden');
    document.getElementById('btnOpenLogin').classList.remove('hidden');
    document.getElementById('btnAdminLogout').classList.add('hidden');

    if (reason) showToast(reason);
    ApiClient.clearCache();
    GuestApp.loadLeaderboardData();
  }

  function showToast(msg) {
    const box = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast animate-pop';
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  return { init, forceLogout, showToast };
})();

document.addEventListener('DOMContentLoaded', () => SecurityManager.init());