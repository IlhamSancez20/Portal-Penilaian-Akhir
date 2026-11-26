const AdminApp = (() => {
  let state = { akun: [], guru: [], mapel: [], kelas: [], siswa: [], nilai: [], surat: [], audit: [] };
  let isSuperAdmin = false;
  let allowedSubjects = [];
  let chartInstance = null;
  let activeModalEntity = null;
  let isEditing = false;

  const DEFAULT_LB_CONFIGS = [
    { key: 'slide_group', label: 'Pembuatan Slide (Kelompok)', source: 'avg_1_2', scope: 'group' },
    { key: 'pres_group', label: 'Presentasi (Kelompok)', source: 'nilai_3', scope: 'group' },
    { key: 'total_group', label: 'Total Akhir (Kelompok)', source: 'nilai_akhir', scope: 'group' },
    { key: 'slide_indiv', label: 'Pembuatan Slide (Individual)', source: 'avg_1_2', scope: 'indiv' },
    { key: 'pres_indiv', label: 'Presentasi (Individual)', source: 'nilai_3', scope: 'indiv' },
    { key: 'total_indiv', label: 'Total Akhir (Individual)', source: 'nilai_akhir', scope: 'indiv' }
  ];

  const LB_SOURCE_OPTIONS = [
    { value: 'nilai_akhir', label: 'Nilai Akhir / Total Akhir' },
    { value: 'nilai_1', label: 'Komponen 1 (Nilai 1)' },
    { value: 'nilai_2', label: 'Komponen 2 (Nilai 2)' },
    { value: 'nilai_3', label: 'Komponen 3 (Nilai 3)' },
    { value: 'avg_1_2', label: 'Rata-rata Nilai 1 & 2' },
    { value: 'avg_all', label: 'Rata-rata Nilai 1, 2, & 3' }
  ];

  const PRESET_SUBJECTS = [
    'Informatika',
    'Informatika + KKA',
    'Koding dan Kecerdasan Artifisial',
    'Bahasa Indonesia',
    'Matematika',
    'Bahasa Inggris',
    'Ilmu Pengetahuan Alam (IPA)',
    'Ilmu Pengetahuan Sosial (IPS)',
    'Pendidikan Pancasila',
    'Ujian TKA',
    'Ujian Praktik'
  ];

  const PRESET_EXAM_TYPES = [
    'Ulangan Akhir Semester',
    'Ujian Akhir Semester',
    'Nilai Rapor',
    'Nilai Rapor Semester Ganjil',
    'Nilai Rapor Semester Genap',
    'Ujian TKA',
    'Ulangan Harian',
    'Sumatif Tengah Semester (STS)',
    'Sumatif Akhir Semester (SAS)',
    'Ujian Praktik',
    'Try Out Ujian Sekolah'
  ];

  function init() {
    document.querySelectorAll('.admin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const target = btn.dataset.tab;
        document.querySelectorAll('.admin-panel-section').forEach(sec => sec.classList.add('hidden'));
        document.getElementById(`tab-${target}`).classList.remove('hidden');

        if (target === 'surat-kirim') ExcelLetterManager.initLetterTab();
        if (target === 'nilai') ExcelLetterManager.populateExcelFilters();
      });
    });

    document.getElementById('crudForm').addEventListener('submit', handleCrudSubmit);
  }

  function getTeacherSubjects() {
    const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
    const fromSession = String(admin.mata_pelajaran || '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s && s !== 'Semua Mata Pelajaran');
    const fromServer = (allowedSubjects || []).filter(s => s && s !== 'ALL' && s !== 'Semua Mata Pelajaran');
    const fromMapel = (state.mapel || []).map(m => String(m.nama_mapel || '').trim()).filter(Boolean);
    const fromNilai = (state.nilai || []).map(n => String(n.mata_pelajaran || '').trim()).filter(Boolean);

    const combined = [...new Set([...fromServer, ...fromSession, ...fromMapel, ...fromNilai])];
    if (isSuperAdmin && combined.length === 0) {
      return [...PRESET_SUBJECTS];
    }
    return combined;
  }

  function getScopedExamTypes() {
    const fromMapel = (state.mapel || []).map(m => String(m.jenis_ujian || '').trim()).filter(Boolean);
    const fromNilai = (state.nilai || []).map(n => String(n.jenis_ujian || 'Ulangan Akhir Semester').trim()).filter(Boolean);
    const combined = [...new Set([...fromMapel, ...fromNilai])];
    if (isSuperAdmin) {
      return combined.length > 0 ? combined : [...PRESET_EXAM_TYPES];
    }
    return combined;
  }

  function parseLbConfigs(raw) {
    if (!raw || String(raw).trim() === '' || String(raw).trim().toUpperCase() === 'ALL') {
      return DEFAULT_LB_CONFIGS.map(d => ({ ...d }));
    }

    let parsed = null;
    if (Array.isArray(raw)) {
      parsed = raw;
    } else {
      const str = String(raw).trim();
      if (str.startsWith('[')) {
        try { parsed = JSON.parse(str); } catch (e) { parsed = null; }
      }
    }

    if (Array.isArray(parsed)) {
      const valid = parsed
        .filter(it => it && typeof it === 'object' && String(it.label || '').trim() !== '')
        .map(it => ({
          key: String(it.key || '').trim(),
          label: String(it.label).trim(),
          source: String(it.source || 'nilai_akhir').trim(),
          scope: it.scope === 'group' ? 'group' : 'indiv'
        }));
      return valid.length > 0 ? valid : DEFAULT_LB_CONFIGS.map(d => ({ ...d }));
    }

    const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
    const legacy = parts
      .map(p => DEFAULT_LB_CONFIGS.find(d => d.key === p))
      .filter(Boolean)
      .map(d => ({ ...d }));
    return legacy.length > 0 ? legacy : DEFAULT_LB_CONFIGS.map(d => ({ ...d }));
  }

  function formatLbConfigsBadge(raw) {
    const list = parseLbConfigs(raw);
    const preview = list.slice(0, 2).map(c => c.label).join(', ');
    return list.length > 2
      ? `${list.length} Kategori (${preview}, +${list.length - 2} lainnya)`
      : `${list.length} Kategori (${preview})`;
  }

  function createLbRowHtml(item = { label: '', source: 'nilai_akhir', scope: 'indiv' }) {
    const esc = GuestApp.escapeHtml;
    return `
      <div class="lb-custom-row" style="display:grid; grid-template-columns: 1.5fr 1.1fr 0.85fr auto; gap:8px; align-items:center; margin-bottom:8px; padding:8px; border:1px solid var(--border); border-radius:10px; background:var(--bg);">
        <input type="text" class="lb-row-label" required placeholder="Judul Kategori (misal: Skor Literasi TKA)" value="${esc(item.label || '')}" />
        <select class="lb-row-source" aria-label="Sumber Nilai">
          ${LB_SOURCE_OPTIONS.map(opt => `<option value="${esc(opt.value)}" ${item.source === opt.value ? 'selected' : ''}>${esc(opt.label)}</option>`).join('')}
        </select>
        <select class="lb-row-scope" aria-label="Mode Peserta">
          <option value="group" ${item.scope === 'group' ? 'selected' : ''}>Kelompok</option>
          <option value="indiv" ${item.scope !== 'group' ? 'selected' : ''}>Individual</option>
        </select>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.lb-custom-row').remove()" title="Hapus kategori ini">✕</button>
      </div>
    `;
  }

  function buildLbBuilderHtml(selectedConfigs) {
    const rows = (selectedConfigs && selectedConfigs.length > 0 ? selectedConfigs : DEFAULT_LB_CONFIGS)
      .map(item => createLbRowHtml(item))
      .join('');

    return `
      <div class="form-group">
        <label>Kategori Leaderboard Kustom (Diisi Admin Pertama Sesuai Keinginan Guru Mapel)</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
          <button type="button" class="btn btn-primary btn-sm" onclick="AdminApp.addCustomLbRow()">+ Tambah Kategori Kustom</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="AdminApp.applyLbPreset('ALL')">Isi 6 Standar</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="AdminApp.applyLbPreset('KELOMPOK')">Khusus Kelompok</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="AdminApp.applyLbPreset('INDIVIDUAL')">Khusus Individual</button>
        </div>
        <div id="lbCustomRowsContainer" style="max-height:260px; overflow-y:auto; padding-right:2px;">
          ${rows}
        </div>
        <small class="muted">Ketik judul leaderboard bebas pada kolom kiri, lalu pilih komponen nilai dan mode peserta (Kelompok / Individual).</small>
      </div>
    `;
  }

  function addCustomLbRow(presetItem = null) {
    const container = document.getElementById('lbCustomRowsContainer');
    if (!container) return;
    const item = presetItem || { label: '', source: 'nilai_akhir', scope: 'indiv' };
    container.insertAdjacentHTML('beforeend', createLbRowHtml(item));
    const inputs = container.querySelectorAll('.lb-row-label');
    if (inputs.length > 0 && !presetItem) {
      inputs[inputs.length - 1].focus();
    }
  }

  function applyLbPreset(preset) {
    const container = document.getElementById('lbCustomRowsContainer');
    if (!container) return;
    let items = [];
    if (preset === 'ALL') items = DEFAULT_LB_CONFIGS;
    else if (preset === 'KELOMPOK') items = DEFAULT_LB_CONFIGS.filter(d => d.scope === 'group');
    else if (preset === 'INDIVIDUAL') items = DEFAULT_LB_CONFIGS.filter(d => d.scope === 'indiv');

    container.innerHTML = items.map(it => createLbRowHtml(it)).join('');
  }

  function collectLbConfigsFromDom() {
    const rows = Array.from(document.querySelectorAll('#lbCustomRowsContainer .lb-custom-row'));
    const configs = [];
    rows.forEach(row => {
      const label = (row.querySelector('.lb-row-label')?.value || '').trim();
      const source = row.querySelector('.lb-row-source')?.value || 'nilai_akhir';
      const scope = row.querySelector('.lb-row-scope')?.value || 'indiv';
      if (label) {
        configs.push({ label, source, scope });
      }
    });
    return configs;
  }

  function confirmCard({ mode = 'edit', title, message, details = '' }) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirmActionModal');
      const card = modal.querySelector('.confirm-card');
      const badge = document.getElementById('confirmBadge');
      const titleEl = document.getElementById('confirmTitle');
      const msgEl = document.getElementById('confirmMessage');
      const detEl = document.getElementById('confirmDetails');
      const btnYes = document.getElementById('btnConfirmProceed');
      const btnNo = document.getElementById('btnConfirmCancel');

      const isDanger = mode === 'delete' || mode === 'delete_all';
      card.classList.toggle('danger-mode', isDanger);
      badge.classList.toggle('danger', isDanger);
      btnYes.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';

      badge.textContent = mode === 'add'
        ? 'PERINGATAN & KONFIRMASI TAMBAH DATA'
        : mode === 'edit'
          ? 'PERINGATAN & KONFIRMASI UBAH DATA'
          : 'PERINGATAN KERAS & KONFIRMASI HAPUS';

      titleEl.textContent = title;
      msgEl.textContent = message;
      detEl.innerHTML = details || 'Pastikan data yang diproses sudah diperiksa dengan teliti.';
      detEl.classList.toggle('hidden', !details);
      btnYes.textContent = isDanger ? 'Ya, Hapus Data' : 'Ya, Simpan Perubahan';

      modal.classList.remove('hidden');

      const cleanup = result => {
        modal.classList.add('hidden');
        btnYes.onclick = null;
        btnNo.onclick = null;
        resolve(result);
      };

      btnYes.onclick = () => cleanup(true);
      btnNo.onclick = () => cleanup(false);
    });
  }

  function populateTableClassFilters() {
    const classes = [...new Set((state.siswa || []).map(s => String(s.kelas).trim()).filter(Boolean))].sort();
    const opts = `<option value="ALL">Semua Kelas</option>` +
      classes.map(c => `<option value="${GuestApp.escapeHtml(c)}">Kelas ${GuestApp.escapeHtml(c)}</option>`).join('');

    const nSel = document.getElementById('nilaiTableClassFilter');
    const sSel = document.getElementById('siswaTableClassFilter');
    if (nSel) {
      const prev = nSel.value;
      nSel.innerHTML = opts;
      if (classes.includes(prev)) nSel.value = prev;
    }
    if (sSel) {
      const prev = sSel.value;
      sSel.innerHTML = opts;
      if (classes.includes(prev)) sSel.value = prev;
    }

    const mapelSel = document.getElementById('nilaiMapelTableFilter');
    if (mapelSel) {
      const subjList = getTeacherSubjects();
      const prevMapel = mapelSel.value;
      mapelSel.innerHTML = `<option value="ALL">Semua Mata Pelajaran</option>` +
        subjList.map(m => `<option value="${GuestApp.escapeHtml(m)}">${GuestApp.escapeHtml(m)}</option>`).join('');
      if (subjList.includes(prevMapel)) mapelSel.value = prevMapel;
    }

    const examSel = document.getElementById('nilaiExamTableFilter');
    if (examSel) {
      const examTypes = getScopedExamTypes();
      const prevExam = examSel.value;
      const defaultLabel = examTypes.length > 0 ? 'Semua Jenis Ujian' : 'Belum Ada Jenis Ujian';
      examSel.innerHTML = `<option value="ALL">${defaultLabel}</option>` +
        examTypes.map(j => `<option value="${GuestApp.escapeHtml(j)}">${GuestApp.escapeHtml(j)}</option>`).join('');
      if (examTypes.includes(prevExam)) examSel.value = prevExam;
    }
  }

  async function loadDashboard() {
    const res = await ApiClient.adminRequest({ action: 'admin_dashboard' });
    if (!res || !res.success) return;

    state = res.data;
    isSuperAdmin = Boolean(res.isSuperAdmin);
    allowedSubjects = Array.isArray(res.allowedSubjects) ? res.allowedSubjects : [];

    if (!isSuperAdmin && allowedSubjects.length > 0 && !allowedSubjects.includes('ALL')) {
      const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
      admin.mata_pelajaran = allowedSubjects.join(', ');
      sessionStorage.setItem('PHP_ADMIN_USER', JSON.stringify(admin));
      const welcomeEl = document.getElementById('adminWelcomeText');
      if (welcomeEl) {
        welcomeEl.textContent = `${admin.nama_admin} • Role: ${admin.role} • Mapel: ${admin.mata_pelajaran} • Kelas: ${admin.kelas_diampu || '-'}`;
      }
    }

    document.querySelectorAll('.super-only').forEach(el => el.classList.toggle('hidden', !isSuperAdmin));
    document.querySelectorAll('.teacher-only').forEach(el => el.classList.toggle('hidden', isSuperAdmin));

    populateTableClassFilters();
    renderStatsAndChart();
    renderTables();
    ExcelLetterManager.populateExcelFilters();
    if (!isSuperAdmin) ExcelLetterManager.initLetterTab();
  }

  function renderStatsAndChart() {
    const graded = state.nilai.filter(n => n.nilai_akhir !== '' && n.status !== 'BELUM_DINILAI');
    const amanCount = graded.filter(n => Number(n.nilai_akhir) >= APP_CONFIG.KKM).length;
    const remedialCount = graded.filter(n => Number(n.nilai_akhir) < APP_CONFIG.KKM).length;

    document.getElementById('kpiCards').innerHTML = `
      <div class="kpi-card"><h4>Total Siswa (${isSuperAdmin ? 'Semua' : 'Kelas Ampuan'})</h4><strong>${state.siswa.length}</strong></div>
      <div class="kpi-card"><h4>Aman (≥ ${APP_CONFIG.KKM})</h4><strong style="color:var(--success)">${amanCount}</strong></div>
      <div class="kpi-card"><h4>Remedial (&lt; ${APP_CONFIG.KKM})</h4><strong style="color:var(--danger)">${remedialCount}</strong></div>
      <div class="kpi-card"><h4>Total Entri Nilai</h4><strong>${graded.length}</strong></div>
    `;

    const siswaKelasMap = {};
    state.siswa.forEach(s => { siswaKelasMap[String(s.nis).trim()] = s.kelas; });

    const classLabels = [...new Set(state.kelas.map(k => k.nama_kelas))];
    if (classLabels.length === 0) classLabels.push('Kelas Ampuan');

    const amanPerClass = classLabels.map(cls =>
      graded.filter(n => (cls === 'Kelas Ampuan' || siswaKelasMap[String(n.nis).trim()] === cls) && Number(n.nilai_akhir) >= APP_CONFIG.KKM).length
    );
    const remPerClass = classLabels.map(cls =>
      graded.filter(n => (cls === 'Kelas Ampuan' || siswaKelasMap[String(n.nis).trim()] === cls) && Number(n.nilai_akhir) < APP_CONFIG.KKM).length
    );

    const ctx = document.getElementById('remedialBarChart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: classLabels,
        datasets: [
          { label: `Aman (≥ ${APP_CONFIG.KKM})`, data: amanPerClass, backgroundColor: '#10b981', borderRadius: 8 },
          { label: `Remedial (< ${APP_CONFIG.KKM})`, data: remPerClass, backgroundColor: '#ef4444', borderRadius: 8 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderTables() {
    const esc = GuestApp.escapeHtml;
    const siswaMap = {};
    state.siswa.forEach(s => { siswaMap[String(s.nis).trim()] = s; });

    const nSearch = (document.getElementById('nilaiSearchInput')?.value || '').trim().toLowerCase();
    const nMapel = document.getElementById('nilaiMapelTableFilter')?.value || 'ALL';
    const nExam = document.getElementById('nilaiExamTableFilter')?.value || 'ALL';
    const nCat = document.getElementById('nilaiCategoryTableFilter')?.value || 'ALL';
    const nClass = document.getElementById('nilaiTableClassFilter')?.value || 'ALL';
    const nStatus = document.getElementById('nilaiStatusFilter')?.value || 'ALL';

    const filteredNilai = state.nilai.filter(n => {
      const s = siswaMap[String(n.nis).trim()] || {};
      const rowKelompok = n.kelompok !== undefined ? String(n.kelompok).trim() : String(s.kelompok || '').trim();
      const rowMapel = String(n.mata_pelajaran || '').trim();
      const rowJenis = String(n.jenis_ujian || 'Ulangan Akhir Semester').trim();
      const matchQuery = !nSearch ||
        String(n.nis).toLowerCase().includes(nSearch) ||
        String(s.nama || '').toLowerCase().includes(nSearch) ||
        rowKelompok.toLowerCase().includes(nSearch);
      const matchMapel = nMapel === 'ALL' || rowMapel === nMapel;
      const matchExam = nExam === 'ALL' || rowJenis === nExam;
      const matchCat = nCat === 'ALL' ||
        (nCat === 'KELOMPOK' && Boolean(rowKelompok)) ||
        (nCat === 'INDIVIDUAL' && !rowKelompok);
      const matchClass = nClass === 'ALL' || String(s.kelas || '') === nClass;
      const matchStatus = nStatus === 'ALL' || String(n.status || '') === nStatus;
      return matchQuery && matchMapel && matchExam && matchCat && matchClass && matchStatus;
    });

    document.getElementById('table-nilai').innerHTML = `
      <thead><tr><th>NIS</th><th>Nama Siswa</th><th>Kelas</th><th>Mapel &amp; Jenis Ujian</th><th>Kategori</th><th>N1</th><th>N2</th><th>N3</th><th>+Tmb</th><th>Akhir</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${filteredNilai.length === 0 ? `<tr><td colspan="12" class="muted" style="text-align:center;">Tidak ada data nilai yang sesuai filter.</td></tr>` : ''}
        ${filteredNilai.map(n => {
          const s = siswaMap[String(n.nis).trim()] || {};
          const rowJenis = String(n.jenis_ujian || 'Ulangan Akhir Semester').trim();
          const rowGuru = String(n.guru_mapel || '').trim();
          const rowKelompok = n.kelompok !== undefined ? String(n.kelompok).trim() : String(s.kelompok || '').trim();
          const kategoriText = rowKelompok ? `Kelompok: ${rowKelompok}` : 'Individual';

          return `<tr>
            <td>${esc(n.nis)}</td>
            <td>${esc(s.nama || '-')}</td>
            <td>${esc(s.kelas || '-')}</td>
            <td>
              <strong>${esc(n.mata_pelajaran)}</strong><br/>
              <small class="muted">${esc(rowJenis)}${rowGuru && rowGuru !== '-' ? ` • ${esc(rowGuru)}` : ''}</small>
            </td>
            <td><span class="pill-info">${esc(kategoriText)}</span></td>
            <td>${esc(n.nilai_1 !== '' ? n.nilai_1 : '-')}</td>
            <td>${esc(n.nilai_2 !== '' ? n.nilai_2 : '-')}</td>
            <td>${esc(n.nilai_3 !== '' ? n.nilai_3 : '-')}</td>
            <td>${esc(n.nilai_tambah || 0)}</td>
            <td><strong>${esc(n.nilai_akhir !== '' ? n.nilai_akhir : '-')}</strong></td>
            <td>${esc(n.status)}</td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="AdminApp.openEditModal('nilai', '${esc(n.id_nilai)}')">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="AdminApp.deleteOne('nilai', '${esc(n.id_nilai)}', '${esc(s.nama || n.nis)}')">Hapus</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>`;

    if (!isSuperAdmin) return;

    document.getElementById('table-guru').innerHTML = `
      <thead><tr><th>ID</th><th>NIP / Kode</th><th>Nama Guru Mapel</th><th>Bidang Studi</th><th>Kontak WA</th><th>Aksi</th></tr></thead>
      <tbody>
        ${(state.guru || []).map(g => `<tr>
          <td>${esc(g.id)}</td>
          <td>${esc(g.nip || '-')}</td>
          <td><strong>${esc(g.nama_guru)}</strong></td>
          <td>${esc(g.bidang_studi || '-')}</td>
          <td>${esc(g.no_hp || '-')}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="AdminApp.openEditModal('guru', '${esc(g.id)}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="AdminApp.deleteOne('guru', '${esc(g.id)}', '${esc(g.nama_guru)}')">Hapus</button>
          </td>
        </tr>`).join('')}
      </tbody>`;

    const cardLabels = {
      default: 'Default (Pembuatan, Slide, Presentasi, Akhir)',
      nilai_akhir: 'Nilai Akhir Saja (Nilai Rapor / Ringkas)',
      tka: 'Khusus Ujian TKA',
      custom: 'Input Sendiri (Kustom)'
    };
    document.getElementById('table-mapel').innerHTML = `
      <thead><tr><th>ID</th><th>Mata Pelajaran</th><th>Jenis Ujian</th><th>Guru Mapel</th><th>KKM</th><th>Bentuk Card</th><th>Kategori Leaderboard Kustom</th><th>Aksi</th></tr></thead>
      <tbody>
        ${state.mapel.map(m => `<tr>
          <td>${esc(m.id)}</td>
          <td><strong>${esc(m.nama_mapel)}</strong></td>
          <td>${esc(m.jenis_ujian)}</td>
          <td>${esc(m.guru_mapel || '(Kosong)')}</td>
          <td>${esc(m.kkm)}</td>
          <td>${esc(cardLabels[m.tipe_card] || 'Default')}</td>
          <td><span class="pill-info">${esc(formatLbConfigsBadge(m.lb_modes))}</span></td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="AdminApp.openEditModal('mapel', '${esc(m.id)}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="AdminApp.deleteOne('mapel', '${esc(m.id)}', '${esc(m.nama_mapel)}')">Hapus</button>
          </td>
        </tr>`).join('')}
      </tbody>`;

    document.getElementById('table-kelas').innerHTML = `
      <thead><tr><th>ID</th><th>Tingkat</th><th>Nama Kelas</th><th>Guru Mapel</th><th>Mata Pelajaran</th><th>Aksi</th></tr></thead>
      <tbody>
        ${state.kelas.map(k => `<tr>
          <td>${esc(k.id)}</td>
          <td>${esc(k.tingkat)}</td>
          <td>${esc(k.nama_kelas)}</td>
          <td>${esc(k.guru_mapel || '(Kosong)')}</td>
          <td>${esc(k.mata_pelajaran || '-')}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="AdminApp.openEditModal('kelas', '${esc(k.id)}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="AdminApp.deleteOne('kelas', '${esc(k.id)}', '${esc(k.nama_kelas)}')">Hapus</button>
          </td>
        </tr>`).join('')}
      </tbody>`;

    const sSearch = (document.getElementById('siswaSearchInput')?.value || '').trim().toLowerCase();
    const sClass = document.getElementById('siswaTableClassFilter')?.value || 'ALL';

    const filteredSiswa = state.siswa.filter(s => {
      const matchQuery = !sSearch ||
        String(s.nis).toLowerCase().includes(sSearch) ||
        String(s.nama).toLowerCase().includes(sSearch);
      const matchClass = sClass === 'ALL' || String(s.kelas) === sClass;
      return matchQuery && matchClass;
    });

    document.getElementById('table-siswa').innerHTML = `
      <thead><tr><th>NIS</th><th>Nama Lengkap</th><th>Kelas</th><th>Kelompok Default</th><th>Aksi</th></tr></thead>
      <tbody>
        ${filteredSiswa.length === 0 ? `<tr><td colspan="5" class="muted" style="text-align:center;">Tidak ada data siswa yang sesuai filter.</td></tr>` : ''}
        ${filteredSiswa.map(s => `<tr>
          <td>${esc(s.nis)}</td>
          <td>${esc(s.nama)}</td>
          <td>${esc(s.kelas)}</td>
          <td>${esc(s.kelompok || '(Individual)')}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="AdminApp.openEditModal('siswa', '${esc(s.nis)}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="AdminApp.deleteOne('siswa', '${esc(s.nis)}', '${esc(s.nama)}')">Hapus</button>
          </td>
        </tr>`).join('')}
      </tbody>`;

    document.getElementById('table-akun').innerHTML = `
      <thead><tr><th>ID</th><th>Username</th><th>Password</th><th>Guru Mapel / Admin</th><th>Mata Pelajaran Diampu</th><th>Role</th><th>Kelas Diampu</th><th>Aksi</th></tr></thead>
      <tbody>
        ${state.akun.map(a => `<tr>
          <td>${esc(a.id)}</td>
          <td>${esc(a.username)}</td>
          <td><span class="pass-masked-pill">•••••••• (Terkunci)</span></td>
          <td>${esc(a.nama_admin)}</td>
          <td><strong>${esc(a.mata_pelajaran || '-')}</strong></td>
          <td>${esc(a.role)}</td>
          <td>${esc(a.kelas_diampu || 'Belum Memilih')}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="AdminApp.openEditModal('akun', '${esc(a.id)}')">Edit</button>
            ${a.id !== 'ADM-001' ? `<button class="btn btn-danger btn-sm" onclick="AdminApp.deleteOne('akun', '${esc(a.id)}', '${esc(a.username)}')">Hapus</button>` : ''}
          </td>
        </tr>`).join('')}
      </tbody>`;

    document.getElementById('table-surat-inbox').innerHTML = `
      <thead><tr><th>ID Surat</th><th>Pengirim</th><th>Mapel</th><th>Rincian Siswa & Usulan</th><th>Catatan</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${state.surat.map(sr => {
          let items = [];
          try { items = JSON.parse(sr.daftar_siswa_json || '[]'); } catch (e) {}
          const summary = items.map(it => `${esc(it.nis_lama)} (${esc(it.nama_lama)}) ➔ ${esc(it.usulan_perbaikan || '-')}`).join('<br/>');
          return `<tr>
            <td>${esc(sr.id_surat)}</td>
            <td>${esc(sr.pengirim_nama)}</td>
            <td>${esc(sr.mata_pelajaran)}</td>
            <td>${summary}</td>
            <td>${esc(sr.keterangan)}</td>
            <td><strong>${esc(sr.status)}</strong></td>
            <td>
              ${sr.status !== 'SELESAI'
                ? `<button class="btn btn-primary btn-sm" onclick="AdminApp.markLetterDone('${esc(sr.id_surat)}')">Tandai Selesai</button>`
                : '✅ Selesai'}
            </td>
          </tr>`;
        }).join('')}
      </tbody>`;

    document.getElementById('table-audit').innerHTML = `
      <thead><tr><th>Waktu</th><th>User</th><th>Role</th><th>Aktivitas</th><th>Detail</th></tr></thead>
      <tbody>
        ${state.audit.map(lg => `<tr>
          <td>${new Date(lg.timestamp).toLocaleString('id-ID')}</td>
          <td>${esc(lg.actor)}</td>
          <td>${esc(lg.role)}</td>
          <td><strong>${esc(lg.action)}</strong></td>
          <td>${esc(lg.detail)}</td>
        </tr>`).join('')}
      </tbody>`;
  }

  /* ==================== KHUSUS ADMIN PERTAMA: ATUR LEADERBOARD KUSTOM ==================== */

  function openLbPreferenceModal() {
    if (!isSuperAdmin) {
      SecurityManager.showToast('Akses ditolak! Wajib Admin Pertama yang mengisi dan mengatur kategori Leaderboard.');
      return;
    }

    activeModalEntity = 'lb_pref';
    isEditing = true;

    const mapelItems = [...new Set([...PRESET_SUBJECTS, ...(state.mapel || []).map(m => m.nama_mapel)])]
      .map(s => ({ value: s, label: s }));
    const examItems = [...new Set([...PRESET_EXAM_TYPES, ...(state.mapel || []).map(m => m.jenis_ujian).filter(Boolean)])]
      .map(s => ({ value: s, label: s }));
    const guruItems = (state.guru || []).map(g => ({
      value: g.nama_guru,
      label: `${g.nama_guru}${g.bidang_studi ? ` (${g.bidang_studi})` : ''}`
    }));

    const firstMapel = state.mapel?.[0] || {};
    const initialMapel = firstMapel.nama_mapel || mapelItems[0]?.value || 'Informatika';
    const initialJenis = firstMapel.jenis_ujian || 'Ulangan Akhir Semester';
    const initialGuru = firstMapel.guru_mapel || '';
    const initialConfigs = parseLbConfigs(firstMapel.lb_modes);

    document.getElementById('crudModalTitle').textContent = 'Pengaturan Leaderboard Kustom (Khusus Admin Pertama)';
    document.getElementById('crudForm').innerHTML = `
      <p class="muted" style="margin-bottom:12px;">
        Wajib diisi oleh <strong>Admin Pertama</strong>: tentukan kategori Leaderboard kustom sesuai permintaan masing-masing guru mapel dan jenis ujiannya.
      </p>
      <div class="form-group">
        <label>Mata Pelajaran</label>
        <div class="combo-wrapper">
          <input type="text" id="lbPrefMapelSearch" autocomplete="off" required placeholder="Pilih atau ketik mata pelajaran..." />
          <input type="hidden" id="lbPrefMapelVal" name="nama_mapel" />
          <div id="lbPrefMapelDrop" class="combo-dropdown hidden"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Jenis Ujian</label>
        <div class="combo-wrapper">
          <input type="text" id="lbPrefJenisSearch" autocomplete="off" required placeholder="Pilih atau ketik jenis ujian..." />
          <input type="hidden" id="lbPrefJenisVal" name="jenis_ujian" />
          <div id="lbPrefJenisDrop" class="combo-dropdown hidden"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Guru Mata Pelajaran (Opsional — untuk membedakan guru pada mapel sama)</label>
        <div class="combo-wrapper">
          <input type="text" id="lbPrefGuruSearch" autocomplete="off" placeholder="Pilih/cari guru mapel atau kosongkan..." />
          <input type="hidden" id="lbPrefGuruVal" name="guru_mapel" />
          <div id="lbPrefGuruDrop" class="combo-dropdown hidden"></div>
        </div>
      </div>
      ${buildLbBuilderHtml(initialConfigs)}
      <button type="submit" class="btn btn-primary w-full">Simpan Kategori Leaderboard Kustom</button>
    `;

    const syncExistingLbForSelection = () => {
      const mVal = (document.getElementById('lbPrefMapelSearch')?.value || '').trim();
      const jVal = (document.getElementById('lbPrefJenisSearch')?.value || '').trim();
      const gVal = (document.getElementById('lbPrefGuruSearch')?.value || '').trim();
      const matched = (state.mapel || []).find(m =>
        String(m.nama_mapel).trim() === mVal &&
        String(m.jenis_ujian || 'Ulangan Akhir Semester').trim() === jVal &&
        (!gVal || String(m.guru_mapel || '').trim() === gVal)
      );
      if (matched) {
        const container = document.getElementById('lbCustomRowsContainer');
        if (container) {
          container.innerHTML = parseLbConfigs(matched.lb_modes).map(it => createLbRowHtml(it)).join('');
        }
      }
    };

    UIComponents.attachSearchCombo({
      searchInputId: 'lbPrefMapelSearch',
      hiddenInputId: 'lbPrefMapelVal',
      dropdownId: 'lbPrefMapelDrop',
      items: mapelItems,
      initialValue: initialMapel,
      allowCustom: true,
      onSelect: syncExistingLbForSelection
    });

    UIComponents.attachSearchCombo({
      searchInputId: 'lbPrefJenisSearch',
      hiddenInputId: 'lbPrefJenisVal',
      dropdownId: 'lbPrefJenisDrop',
      items: examItems,
      initialValue: initialJenis,
      allowCustom: true,
      onSelect: syncExistingLbForSelection
    });

    UIComponents.attachSearchCombo({
      searchInputId: 'lbPrefGuruSearch',
      hiddenInputId: 'lbPrefGuruVal',
      dropdownId: 'lbPrefGuruDrop',
      items: guruItems,
      initialValue: initialGuru,
      allowEmpty: true,
      onSelect: syncExistingLbForSelection
    });

    document.getElementById('crudModal').classList.remove('hidden');
  }

  function openEditModal(entity, id) {
    const idStr = String(id).trim();
    let found = null;
    if (entity === 'nilai') found = state.nilai.find(x => String(x.id_nilai).trim() === idStr);
    else if (entity === 'guru') found = state.guru.find(x => String(x.id).trim() === idStr);
    else if (entity === 'mapel') found = state.mapel.find(x => String(x.id).trim() === idStr);
    else if (entity === 'kelas') found = state.kelas.find(x => String(x.id).trim() === idStr);
    else if (entity === 'siswa') found = state.siswa.find(x => String(x.nis).trim() === idStr);
    else if (entity === 'akun') found = state.akun.find(x => String(x.id).trim() === idStr);

    if (!found) {
      SecurityManager.showToast('Data tidak ditemukan untuk diedit.');
      return;
    }
    openFormModal(entity, found);
  }

  function attachGradeLivePreview() {
    const form = document.getElementById('crudForm');
    const box = document.getElementById('gradeLivePreview');
    if (!form || !box) return;

    const recalc = () => {
      const getVal = name => {
        const raw = form.querySelector(`[name="${name}"]`)?.value ?? '';
        if (raw === '') return null;
        const n = Number(String(raw).replace(',', '.'));
        return isNaN(n) ? null : Math.min(100, Math.max(0, n));
      };

      const mapelName = form.querySelector('[name="mata_pelajaran"]')?.value || '';
      const jenisUjian = form.querySelector('[name="jenis_ujian"]')?.value || '';
      const foundMapel = state.mapel.find(m => String(m.nama_mapel).trim() === mapelName && String(m.jenis_ujian).trim() === jenisUjian)
        || state.mapel.find(m => String(m.nama_mapel).trim() === mapelName);
      const kkm = foundMapel ? Number(foundMapel.kkm) : APP_CONFIG.KKM;

      const n1 = getVal('nilai_1');
      const n2 = getVal('nilai_2');
      const n3 = getVal('nilai_3');
      const tambah = getVal('nilai_tambah') || 0;
      const manualFinal = getVal('nilai_akhir');

      const comps = [n1, n2, n3].filter(v => v !== null);
      if (manualFinal === null && comps.length === 0) {
        box.innerHTML = `<span class="muted">Pratinjau Nilai Akhir akan muncul saat Anda mengisi komponen nilai.</span>`;
        return;
      }

      let finalScore = 0;
      let modeLabel = '';
      if (manualFinal !== null) {
        finalScore = Math.round(manualFinal * 100) / 100;
        modeLabel = 'Nilai Akhir Tetap';
      } else {
        const avg = comps.reduce((a, b) => a + b, 0) / comps.length;
        finalScore = Math.round(Math.min(100, avg + tambah) * 100) / 100;
        modeLabel = 'Hitung Otomatis';
      }

      const isAman = finalScore >= kkm;
      box.innerHTML = `
        <div>
          <small class="muted" style="display:block;">Pratinjau (${modeLabel} • KKM ${kkm})</small>
          <strong style="color:${isAman ? 'var(--success)' : 'var(--danger)'};">
            ${isAman ? '🎉 AMAN (TUNTAS)' : '⚠️ REMEDIAL'}
          </strong>
        </div>
        <div style="font-size:1.35rem; font-weight:800; color:var(--primary);">${finalScore}</div>
      `;
    };

    form.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });
    recalc();
  }

  function openFormModal(entity, existing = null) {
    activeModalEntity = entity;
    isEditing = Boolean(existing);
    const form = document.getElementById('crudForm');
    const title = document.getElementById('crudModalTitle');
    const esc = GuestApp.escapeHtml;
    const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');

    const guruItems = (state.guru || []).map(g => ({
      value: g.nama_guru,
      label: `${g.nama_guru}${g.bidang_studi ? ` (${g.bidang_studi})` : ''}`
    }));

    if (entity === 'guru') {
      title.textContent = isEditing ? 'Edit Master Guru Mapel' : 'Tambah Master Guru Mapel';
      form.innerHTML = `
        <input type="hidden" name="id" value="${esc(existing?.id || '')}" />
        <div class="form-group">
          <label>NIP / Kode Guru (Opsional)</label>
          <input type="text" name="nip" value="${esc(existing?.nip || '')}" />
        </div>
        <div class="form-group">
          <label>Nama Lengkap Guru Mapel</label>
          <input type="text" name="nama_guru" required value="${esc(existing?.nama_guru || '')}" />
        </div>
        <div class="form-group">
          <label>Bidang Studi / Spesialisasi</label>
          <input type="text" name="bidang_studi" placeholder="Contoh: Informatika / Bahasa Indonesia" value="${esc(existing?.bidang_studi || '')}" />
        </div>
        <div class="form-group">
          <label>No. WhatsApp / Kontak (Opsional — untuk tautan WA remedial)</label>
          <input type="text" name="no_hp" placeholder="Contoh: 08123456789" value="${esc(existing?.no_hp || '')}" />
        </div>
        <button type="submit" class="btn btn-primary w-full">Simpan Guru Mapel</button>`;
    }

    if (entity === 'mapel') {
      title.textContent = isEditing ? 'Edit Mata Pelajaran / Ujian & Leaderboard' : 'Tambah Mata Pelajaran / Ujian & Leaderboard';
      const combinedSubjects = [...new Set([...PRESET_SUBJECTS, ...state.mapel.map(m => m.nama_mapel)])]
        .map(s => ({ value: s, label: s }));
      const combinedExams = [...new Set([...PRESET_EXAM_TYPES, ...state.mapel.map(m => m.jenis_ujian).filter(Boolean)])]
        .map(s => ({ value: s, label: s }));
      const selectedLbConfigs = parseLbConfigs(existing?.lb_modes);

      form.innerHTML = `
        <input type="hidden" name="id" value="${esc(existing?.id || '')}" />
        <div class="form-group">
          <label>Nama Mata Pelajaran / Ujian Lain (Pilih, Cari, atau Ketik Sendiri)</label>
          <div class="combo-wrapper">
            <input type="text" id="mapelComboSearch" autocomplete="off" required placeholder="Pilih dari daftar atau ketik nama mapel..." />
            <input type="hidden" id="mapelComboVal" name="nama_mapel" />
            <div id="mapelComboDrop" class="combo-dropdown hidden"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Jenis Ujian (Contoh: Ulangan Akhir Semester, Nilai Rapor, Ujian TKA, dll.)</label>
          <div class="combo-wrapper">
            <input type="text" id="jenisUjianSearch" autocomplete="off" required placeholder="Pilih atau ketik jenis ujian..." />
            <input type="hidden" id="jenisUjianVal" name="jenis_ujian" />
            <div id="jenisUjianDrop" class="combo-dropdown hidden"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Guru Mata Pelajaran (Cari/Pilih — Boleh Kosong Jika Belum Ada)</label>
          <div class="combo-wrapper">
            <input type="text" id="mapelGuruSearch" autocomplete="off" placeholder="Cari nama guru atau kosongkan..." />
            <input type="hidden" id="mapelGuruVal" name="guru_mapel" />
            <div id="mapelGuruDrop" class="combo-dropdown hidden"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Bentuk Card Hasil Pencarian Siswa</label>
          <select name="tipe_card" id="selectTipeCard">
            <option value="default" ${existing?.tipe_card === 'default' ? 'selected' : ''}>Default (Pembuatan, Slide, Presentasi, Nilai Akhir)</option>
            <option value="nilai_akhir" ${existing?.tipe_card === 'nilai_akhir' ? 'selected' : ''}>Nilai Akhir Saja (Cocok untuk Nilai Rapor / UAS Ringkas)</option>
            <option value="tka" ${existing?.tipe_card === 'tka' ? 'selected' : ''}>Khusus Ujian TKA (Literasi, Numerasi, Penalaran)</option>
            <option value="custom" ${existing?.tipe_card === 'custom' ? 'selected' : ''}>Input Sendiri / Label Komponen Kustom</option>
          </select>
        </div>
        <div id="customLabelsGroup">
          <div class="form-group">
            <label>Label Komponen 1 (Default: Nilai 1 (Pembuatan))</label>
            <input type="text" name="label_n1" value="${esc(existing?.label_n1 || '')}" />
          </div>
          <div class="form-group">
            <label>Label Komponen 2 (Default: Nilai 2 (Slide))</label>
            <input type="text" name="label_n2" value="${esc(existing?.label_n2 || '')}" />
          </div>
          <div class="form-group">
            <label>Label Komponen 3 (Default: Nilai 3 (Presentasi))</label>
            <input type="text" name="label_n3" value="${esc(existing?.label_n3 || '')}" />
          </div>
        </div>
        ${buildLbBuilderHtml(selectedLbConfigs)}
        <div class="form-group">
          <label>KKM</label>
          <input type="number" name="kkm" min="1" max="100" required value="${esc(existing?.kkm || 75)}" />
        </div>
        <button type="submit" class="btn btn-primary w-full">Simpan Mata Pelajaran &amp; Leaderboard</button>`;

      UIComponents.attachSearchCombo({
        searchInputId: 'mapelComboSearch',
        hiddenInputId: 'mapelComboVal',
        dropdownId: 'mapelComboDrop',
        items: combinedSubjects,
        initialValue: existing?.nama_mapel || '',
        allowCustom: true
      });

      UIComponents.attachSearchCombo({
        searchInputId: 'jenisUjianSearch',
        hiddenInputId: 'jenisUjianVal',
        dropdownId: 'jenisUjianDrop',
        items: combinedExams,
        initialValue: existing?.jenis_ujian || 'Ulangan Akhir Semester',
        allowCustom: true
      });

      UIComponents.attachSearchCombo({
        searchInputId: 'mapelGuruSearch',
        hiddenInputId: 'mapelGuruVal',
        dropdownId: 'mapelGuruDrop',
        items: guruItems,
        initialValue: existing?.guru_mapel || '',
        allowEmpty: true,
        emptyText: 'Belum ada data di Master Guru Mapel (boleh dikosongkan)'
      });

      const cardSel = document.getElementById('selectTipeCard');
      const labelsGrp = document.getElementById('customLabelsGroup');
      const toggleLabels = () => {
        labelsGrp.classList.toggle('hidden', cardSel.value === 'nilai_akhir');
      };
      cardSel.addEventListener('change', toggleLabels);
      toggleLabels();
    }

    if (entity === 'kelas') {
      title.textContent = isEditing ? 'Edit Master Kelas' : 'Tambah Master Kelas';
      const uniqueMapelNames = [...new Set(state.mapel.map(m => m.nama_mapel))];
      const mapelOpts = uniqueMapelNames.map(nm =>
        `<option value="${esc(nm)}" ${existing?.mata_pelajaran === nm ? 'selected' : ''}>${esc(nm)}</option>`
      ).join('');

      form.innerHTML = `
        <input type="hidden" name="id" value="${esc(existing?.id || '')}" />
        <div class="form-group">
          <label>Tingkat Kelas</label>
          <select name="tingkat" required>
            <option value="VII" ${existing?.tingkat === 'VII' ? 'selected' : ''}>Kelas VII</option>
            <option value="VIII" ${existing?.tingkat === 'VIII' ? 'selected' : ''}>Kelas VIII</option>
            <option value="XI" ${existing?.tingkat === 'XI' ? 'selected' : ''}>Kelas XI</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nama Kelas (Contoh: VII-A, VIII-B, XI-1)</label>
          <input type="text" name="nama_kelas" required value="${esc(existing?.nama_kelas || '')}" />
        </div>
        <div class="form-group">
          <label>Guru Mata Pelajaran (Pilih/Cari — Kosongkan Jika Belum Ada)</label>
          <div class="combo-wrapper">
            <input type="text" id="kelasGuruSearch" autocomplete="off" placeholder="Ketik untuk mencari nama guru..." />
            <input type="hidden" id="kelasGuruVal" name="guru_mapel" />
            <div id="kelasGuruDrop" class="combo-dropdown hidden"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Mata Pelajaran</label>
          <select name="mata_pelajaran">${mapelOpts || '<option value="">-- Belum Ada Mapel --</option>'}</select>
        </div>
        <button type="submit" class="btn btn-primary w-full">Simpan Kelas</button>`;

      UIComponents.attachSearchCombo({
        searchInputId: 'kelasGuruSearch',
        hiddenInputId: 'kelasGuruVal',
        dropdownId: 'kelasGuruDrop',
        items: guruItems,
        initialValue: existing?.guru_mapel || '',
        allowEmpty: true,
        emptyText: 'Guru tidak ditemukan (boleh dikosongkan)'
      });
    }

    if (entity === 'siswa') {
      title.textContent = isEditing ? 'Edit Master Siswa' : 'Tambah Master Siswa';
      const uniqueClasses = [...new Set(state.kelas.map(k => k.nama_kelas))];
      const classOptions = uniqueClasses.map(cls =>
        `<option value="${esc(cls)}" ${existing?.kelas === cls ? 'selected' : ''}>${esc(cls)}</option>`
      ).join('');

      form.innerHTML = `
        <div class="form-group">
          <label>NIS</label>
          <input type="text" name="nis" required ${isEditing ? 'readonly class="input-locked"' : ''} value="${esc(existing?.nis || '')}" />
        </div>
        <div class="form-group">
          <label>Nama Lengkap Siswa</label>
          <input type="text" name="nama" required value="${esc(existing?.nama || '')}" />
        </div>
        <div class="form-group">
          <label>Kelas</label>
          <select name="kelas" required>${classOptions || '<option value="">Buat Master Kelas Dulu</option>'}</select>
        </div>
        <div class="form-group">
          <label>Kelompok Default (Opsional — kosongkan jika individual)</label>
          <input type="text" name="kelompok" value="${esc(existing?.kelompok || '')}" />
        </div>
        <button type="submit" class="btn btn-primary w-full">Simpan Siswa</button>`;
    }

    if (entity === 'akun') {
      title.textContent = isEditing ? 'Edit Akun Guru / Admin' : 'Tambah Akun Guru / Admin';
      const uniqueMapelNames = [...new Set([...state.mapel.map(m => m.nama_mapel), ...PRESET_SUBJECTS])];
      const existingSubjects = String(existing?.mata_pelajaran || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const isAllSubj = existingSubjects.includes('Semua Mata Pelajaran');

      const mapelCheckboxesHtml = uniqueMapelNames.map(nm => {
        const checked = existingSubjects.includes(nm) ? 'checked' : '';
        return `
          <label style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid var(--border); border-radius:8px; cursor:pointer; background:var(--bg);">
            <input type="checkbox" class="akun-mapel-chk" value="${esc(nm)}" ${checked} />
            <span>${esc(nm)}</span>
          </label>
        `;
      }).join('');

      form.innerHTML = `
        <input type="hidden" name="id" value="${esc(existing?.id || '')}" />
        <div class="form-group">
          <label>Username</label>
          <input type="text" name="username" required value="${esc(existing?.username || '')}" />
        </div>
        <div class="form-group">
          <label>Password ${isEditing ? '(Kosongkan jika tidak diubah — password lama terenkripsi)' : ''}</label>
          <input type="password" name="password" placeholder="${isEditing ? '•••••••• (Tidak ditampilkan demi keamanan)' : 'Masukkan password baru'}" ${isEditing ? '' : 'required'} />
        </div>
        <div class="form-group">
          <label>Nama Guru Mapel / Admin</label>
          <input type="text" name="nama_admin" required value="${esc(existing?.nama_admin || '')}" />
        </div>
        <div class="form-group">
          <label>Mata Pelajaran yang Diampu (Bisa Pilih Lebih dari Satu)</label>
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap:6px; max-height:190px; overflow-y:auto; padding:6px; border:1px solid var(--border); border-radius:10px;">
            <label style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid var(--primary); border-radius:8px; cursor:pointer; background:rgba(37,99,235,0.06);">
              <input type="checkbox" id="akunAllSubjChk" value="Semua Mata Pelajaran" ${isAllSubj ? 'checked' : ''} />
              <strong>Semua Mata Pelajaran (Super Admin)</strong>
            </label>
            ${mapelCheckboxesHtml}
          </div>
          <small class="muted">Centang semua mata pelajaran yang diajarkan guru ini (misal: Informatika + KKA, Informatika, dan Koding dan Kecerdasan Artifisial).</small>
        </div>
        <div class="form-group">
          <label>Role Akses</label>
          <select name="role">
            <option value="Guru Mapel" ${existing?.role === 'Guru Mapel' ? 'selected' : ''}>Guru Mapel (Admin Lainnya)</option>
            <option value="Super Admin" ${existing?.role === 'Super Admin' ? 'selected' : ''}>Super Admin (Admin Pertama)</option>
          </select>
        </div>
        ${isEditing ? `
          <div class="form-group">
            <label>Kelas Diampu (Pisahkan koma, contoh: VII-A,VII-B — kosongkan agar guru memilih ulang saat login)</label>
            <input type="text" name="kelas_diampu" value="${esc(existing?.kelas_diampu || '')}" />
          </div>
        ` : ''}
        <button type="submit" class="btn btn-primary w-full">Simpan Akun</button>`;

      const allChk = document.getElementById('akunAllSubjChk');
      const itemChks = Array.from(document.querySelectorAll('.akun-mapel-chk'));
      if (allChk) {
        allChk.addEventListener('change', () => {
          if (allChk.checked) {
            itemChks.forEach(c => { c.checked = false; });
          }
        });
        itemChks.forEach(c => {
          c.addEventListener('change', () => {
            if (c.checked) allChk.checked = false;
          });
        });
      }
    }

    if (entity === 'nilai') {
      title.textContent = isEditing ? 'Edit Nilai Siswa' : 'Input Nilai Siswa';
      const studentItems = state.siswa.map(s => ({
        value: String(s.nis),
        label: `${s.nis} — ${s.nama} (${s.kelas})`
      }));
      const existingStudent = state.siswa.find(s => String(s.nis) === String(existing?.nis));

      const teacherSubjects = getTeacherSubjects();
      const accountSubject = admin.mata_pelajaran || '';
      const isGlobalSuper = isSuperAdmin && (!accountSubject || accountSubject === 'Semua Mata Pelajaran');
      const uniqueMapelNames = isGlobalSuper
        ? [...new Set([...PRESET_SUBJECTS, ...state.mapel.map(m => m.nama_mapel)])]
        : teacherSubjects;

      const defaultSelectedMapel = existing?.mata_pelajaran
        || document.getElementById('excelMapelFilter')?.value
        || uniqueMapelNames[0]
        || accountSubject;

      const scopedExams = getScopedExamTypes();
      const examSuggestions = isGlobalSuper
        ? [...new Set([...PRESET_EXAM_TYPES, ...scopedExams])]
        : (scopedExams.length > 0 ? scopedExams : PRESET_EXAM_TYPES);
      const combinedExams = examSuggestions.map(s => ({ value: s, label: s }));

      const mapelFieldHtml = (isGlobalSuper || uniqueMapelNames.length > 1)
        ? `<div class="form-group">
             <label>Mata Pelajaran (${isGlobalSuper ? 'Semua Mapel' : 'Sesuai Mapel yang Anda Ampu'})</label>
             <select name="mata_pelajaran" id="nilaiMapelSelect" required>
               ${uniqueMapelNames.map(nm => `<option value="${esc(nm)}" ${defaultSelectedMapel === nm ? 'selected' : ''}>${esc(nm)}</option>`).join('')}
             </select>
           </div>`
        : `<div class="form-group">
             <label>Mata Pelajaran (Otomatis dari Master Akun — Terkunci)</label>
             <input type="text" name="mata_pelajaran" id="nilaiMapelSelect" readonly class="input-locked" value="${esc(uniqueMapelNames[0] || accountSubject)}" />
           </div>`;

      const guruFieldHtml = isGlobalSuper
        ? `<div class="form-group">
             <label>Guru Mata Pelajaran</label>
             <div class="combo-wrapper">
               <input type="text" id="nilaiGuruSearch" autocomplete="off" placeholder="Cari/pilih guru mapel..." />
               <input type="hidden" id="nilaiGuruVal" name="guru_mapel" />
               <div id="nilaiGuruDrop" class="combo-dropdown hidden"></div>
             </div>
           </div>`
        : `<div class="form-group">
             <label>Guru Mata Pelajaran</label>
             <input type="text" name="guru_mapel" readonly class="input-locked" value="${esc(admin.nama_admin || '')}" />
           </div>`;

      const initialKelompok = existing
        ? (existing.kelompok !== undefined ? String(existing.kelompok) : String(existingStudent?.kelompok || ''))
        : '';
      const initialTipePeserta = initialKelompok ? 'kelompok' : 'individual';

      const matchedCfgForDefault = (state.mapel || []).find(m => String(m.nama_mapel).trim() === defaultSelectedMapel);
      const initialExamVal = existing?.jenis_ujian
        || matchedCfgForDefault?.jenis_ujian
        || document.getElementById('excelJenisUjianInput')?.value.trim()
        || scopedExams[0]
        || 'Ulangan Akhir Semester';

      form.innerHTML = `
        <input type="hidden" name="id_nilai" value="${esc(existing?.id_nilai || '')}" />
        <div class="form-group">
          <label>Cari / Pilih Siswa (Ketik NIS atau Nama Siswa)</label>
          ${isEditing
            ? `<input type="text" readonly class="input-locked" value="${esc(existingStudent ? `${existingStudent.nis} — ${existingStudent.nama} (${existingStudent.kelas})` : existing.nis)}" />
               <input type="hidden" name="nis" value="${esc(existing.nis)}" />`
            : `<div class="combo-wrapper">
                 <input type="text" id="nilaiSiswaSearch" autocomplete="off" required placeholder="Ketik NIS atau Nama Lengkap siswa..." />
                 <input type="hidden" id="nilaiSiswaVal" name="nis" required />
                 <div id="nilaiSiswaDrop" class="combo-dropdown hidden"></div>
               </div>`
          }
        </div>
        ${mapelFieldHtml}
        <div class="form-group">
          <label>Jenis Ujian (Sesuai Mata Pelajaran &amp; Ujian Guru Bersangkutan)</label>
          <div class="combo-wrapper">
            <input type="text" id="nilaiJenisSearch" autocomplete="off" required placeholder="Pilih atau ketik jenis ujian..." />
            <input type="hidden" id="nilaiJenisVal" name="jenis_ujian" />
            <div id="nilaiJenisDrop" class="combo-dropdown hidden"></div>
          </div>
        </div>
        ${guruFieldHtml}
        <div class="form-group">
          <label>Kategori Penilaian Ujian Ini</label>
          <select name="tipe_peserta" id="nilaiTipePeserta">
            <option value="individual" ${initialTipePeserta === 'individual' ? 'selected' : ''}>Individual (Kelompok Dikosongkan)</option>
            <option value="kelompok" ${initialTipePeserta === 'kelompok' ? 'selected' : ''}>Kelompok (Isi Nama/Nomor Kelompok)</option>
          </select>
        </div>
        <div class="form-group ${initialTipePeserta === 'individual' ? 'hidden' : ''}" id="nilaiKelompokGroup">
          <label>Nama / Nomor Kelompok</label>
          <input type="text" name="kelompok" id="nilaiKelompokInput" placeholder="Contoh: Kelompok 1" value="${esc(initialKelompok)}" />
        </div>
        <div class="form-group">
          <label>Nilai 1 — Pembuatan (Opsional, 0-100)</label>
          <input type="number" step="0.01" min="0" max="100" name="nilai_1" value="${esc(existing?.nilai_1 ?? '')}" />
        </div>
        <div class="form-group">
          <label>Nilai 2 — Slide (Opsional, 0-100)</label>
          <input type="number" step="0.01" min="0" max="100" name="nilai_2" value="${esc(existing?.nilai_2 ?? '')}" />
        </div>
        <div class="form-group">
          <label>Nilai 3 — Presentasi (Opsional, 0-100)</label>
          <input type="number" step="0.01" min="0" max="100" name="nilai_3" value="${esc(existing?.nilai_3 ?? '')}" />
        </div>
        <div class="form-group">
          <label>Nilai Tambah (Otomatis dipakai jika Nilai Akhir dikosongkan)</label>
          <input type="number" step="1" min="0" max="100" name="nilai_tambah" value="${esc(existing?.nilai_tambah ?? 0)}" />
        </div>
        <div class="form-group">
          <label>Nilai Akhir (Kosongkan untuk hitung otomatis; jika diisi maka nilainya tetap)</label>
          <input type="number" step="0.01" min="0" max="100" name="nilai_akhir" value="${esc(existing?.nilai_akhir ?? '')}" />
        </div>
        <div id="gradeLivePreview" class="grade-live-preview"></div>
        <button type="submit" class="btn btn-primary w-full">Proses &amp; Simpan Nilai</button>`;

      if (!isEditing) {
        UIComponents.attachSearchCombo({
          searchInputId: 'nilaiSiswaSearch',
          hiddenInputId: 'nilaiSiswaVal',
          dropdownId: 'nilaiSiswaDrop',
          items: studentItems,
          allowCustom: false,
          emptyText: 'Siswa tidak ditemukan pada kelas yang Anda ampu'
        });
      }

      UIComponents.attachSearchCombo({
        searchInputId: 'nilaiJenisSearch',
        hiddenInputId: 'nilaiJenisVal',
        dropdownId: 'nilaiJenisDrop',
        items: combinedExams,
        initialValue: initialExamVal,
        allowCustom: true
      });

      const mapelSelectEl = document.getElementById('nilaiMapelSelect');
      if (mapelSelectEl && mapelSelectEl.tagName === 'SELECT' && !isEditing) {
        mapelSelectEl.addEventListener('change', () => {
          const chosenMapel = mapelSelectEl.value;
          const matchedCfg = (state.mapel || []).find(m => String(m.nama_mapel).trim() === chosenMapel);
          if (matchedCfg && matchedCfg.jenis_ujian) {
            const jSearch = document.getElementById('nilaiJenisSearch');
            const jHidden = document.getElementById('nilaiJenisVal');
            if (jSearch) jSearch.value = matchedCfg.jenis_ujian;
            if (jHidden) jHidden.value = matchedCfg.jenis_ujian;
          }
        });
      }

      if (isGlobalSuper) {
        UIComponents.attachSearchCombo({
          searchInputId: 'nilaiGuruSearch',
          hiddenInputId: 'nilaiGuruVal',
          dropdownId: 'nilaiGuruDrop',
          items: guruItems,
          initialValue: existing?.guru_mapel || '',
          allowEmpty: true
        });
      }

      const tipeSel = document.getElementById('nilaiTipePeserta');
      const kelGrp = document.getElementById('nilaiKelompokGroup');
      const kelInp = document.getElementById('nilaiKelompokInput');
      tipeSel.addEventListener('change', () => {
        const isIndiv = tipeSel.value === 'individual';
        kelGrp.classList.toggle('hidden', isIndiv);
        if (isIndiv) {
          kelInp.value = '';
        } else if (!kelInp.value) {
          const nisVal = form.querySelector('[name="nis"]')?.value || '';
          const st = state.siswa.find(s => String(s.nis) === String(nisVal));
          if (st?.kelompok) kelInp.value = st.kelompok;
        }
      });

      attachGradeLivePreview();
    }

    document.getElementById('crudModal').classList.remove('hidden');
  }

  function closeCrudModal() {
    document.getElementById('crudModal').classList.add('hidden');
  }

  async function handleCrudSubmit(e) {
    e.preventDefault();

    if (activeModalEntity === 'lb_pref') {
      if (!isSuperAdmin) {
        SecurityManager.showToast('Hanya Admin Pertama yang diizinkan mengatur Leaderboard.');
        return;
      }
      const lbConfigs = collectLbConfigsFromDom();
      const namaMapel = (document.getElementById('lbPrefMapelSearch')?.value || e.target.querySelector('[name="nama_mapel"]')?.value || '').trim();
      const jenisUjian = (document.getElementById('lbPrefJenisSearch')?.value || e.target.querySelector('[name="jenis_ujian"]')?.value || 'Ulangan Akhir Semester').trim();
      const guruMapel = (document.getElementById('lbPrefGuruSearch')?.value || e.target.querySelector('[name="guru_mapel"]')?.value || '').trim();

      if (!namaMapel) {
        SecurityManager.showToast('Pilih atau ketik Mata Pelajaran terlebih dahulu.');
        return;
      }
      if (lbConfigs.length === 0) {
        SecurityManager.showToast('Tambahkan minimal 1 kategori leaderboard kustom.');
        return;
      }

      const res = await ApiClient.adminRequest({
        action: 'save_mapel_lb_modes',
        nama_mapel: namaMapel,
        jenis_ujian: jenisUjian,
        guru_mapel: guruMapel,
        lb_modes: lbConfigs
      });
      if (res && res.success) {
        SecurityManager.showToast(res.message);
        closeCrudModal();
        ApiClient.clearCache();
        await loadDashboard();
        await GuestApp.loadLeaderboardData();
      } else {
        SecurityManager.showToast(res?.message || 'Gagal menyimpan pengaturan leaderboard.');
      }
      return;
    }

    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());

    if (activeModalEntity === 'akun') {
      const allChk = document.getElementById('akunAllSubjChk');
      const checkedSubjs = Array.from(document.querySelectorAll('.akun-mapel-chk:checked')).map(c => c.value.trim());
      if (allChk && allChk.checked) {
        data.mata_pelajaran = 'Semua Mata Pelajaran';
      } else if (checkedSubjs.length > 0) {
        data.mata_pelajaran = checkedSubjs.join(', ');
      } else {
        SecurityManager.showToast('Pilih minimal 1 mata pelajaran untuk akun ini.');
        return;
      }
    }

    if (activeModalEntity === 'mapel') {
      if (!data.nama_mapel) {
        data.nama_mapel = (document.getElementById('mapelComboSearch')?.value || '').trim();
      }
      if (!data.jenis_ujian) {
        data.jenis_ujian = (document.getElementById('jenisUjianSearch')?.value || 'Ulangan Akhir Semester').trim();
      }
      const lbConfigs = collectLbConfigsFromDom();
      if (lbConfigs.length === 0) {
        SecurityManager.showToast('Tambahkan minimal 1 kategori leaderboard kustom.');
        return;
      }
      data.lb_modes = lbConfigs;
    }

    if (activeModalEntity === 'nilai') {
      if (!data.nis) {
        SecurityManager.showToast('Pilih siswa yang valid dari daftar pencarian terlebih dahulu.');
        return;
      }
      if (!data.jenis_ujian) {
        data.jenis_ujian = (document.getElementById('nilaiJenisSearch')?.value || 'Ulangan Akhir Semester').trim();
      }
      if (data.tipe_peserta === 'individual') {
        data.kelompok = '';
      }
    }

    const ok = await confirmCard({
      mode: isEditing ? 'edit' : 'add',
      title: isEditing ? `Konfirmasi Ubah Data ${activeModalEntity.toUpperCase()}` : `Konfirmasi Tambah Data ${activeModalEntity.toUpperCase()}`,
      message: isEditing
        ? 'Perubahan ini akan langsung memperbarui database Google Sheets dan tampilan portal siswa.'
        : 'Data baru akan ditambahkan ke database Portal Hasil Penilaian.',
      details: Object.entries(data)
        .filter(([k, v]) => k !== 'password' && k !== 'id_nilai' && v !== '')
        .map(([k, v]) => {
          const valStr = Array.isArray(v)
            ? v.map(item => (typeof item === 'object' ? `${item.label} (${item.scope === 'group' ? 'Kelompok' : 'Individual'})` : item)).join(', ')
            : v;
          return `<strong>${GuestApp.escapeHtml(k)}</strong>: ${GuestApp.escapeHtml(valStr)}`;
        })
        .join('<br/>')
    });

    if (!ok) return;

    const res = await ApiClient.adminRequest({
      action: 'save_record',
      entity: activeModalEntity,
      data,
      isEdit: isEditing
    });

    if (res && res.success) {
      SecurityManager.showToast(res.message);
      closeCrudModal();
      ApiClient.clearCache();
      await loadDashboard();
      await GuestApp.loadLeaderboardData();
    } else {
      SecurityManager.showToast(res?.message || 'Gagal menyimpan data.');
    }
  }

  async function deleteOne(entity, id, label = '') {
    const ok = await confirmCard({
      mode: 'delete',
      title: `Peringatan Hapus Data (${entity.toUpperCase()})`,
      message: 'Data yang sudah dihapus tidak dapat dikembalikan lagi. Apakah Anda yakin ingin menghapus data ini?',
      details: `Target Data: <strong>${GuestApp.escapeHtml(label || id)}</strong> (ID: ${GuestApp.escapeHtml(id)})`
    });
    if (!ok) return;

    const res = await ApiClient.adminRequest({ action: 'delete_record', entity, id });
    if (res && res.success) {
      SecurityManager.showToast(res.message);
      ApiClient.clearCache();
      await loadDashboard();
      await GuestApp.loadLeaderboardData();
    } else {
      SecurityManager.showToast(res?.message || 'Gagal menghapus data.');
    }
  }

  async function confirmDeleteAll(entity) {
    const ok = await confirmCard({
      mode: 'delete_all',
      title: `PERINGATAN: Kosongkan Seluruh Data ${entity.toUpperCase()}`,
      message: 'Tindakan ini akan menghapus seluruh baris data yang berada dalam lingkup akses Anda secara permanen!',
      details: `Entitas Target: <strong>Master ${GuestApp.escapeHtml(entity.toUpperCase())}</strong>`
    });
    if (!ok) return;

    const res = await ApiClient.adminRequest({ action: 'delete_all', entity });
    if (res && res.success) {
      SecurityManager.showToast(res.message);
      ApiClient.clearCache();
      await loadDashboard();
      await GuestApp.loadLeaderboardData();
    } else {
      SecurityManager.showToast(res?.message || 'Gagal mengosongkan data.');
    }
  }

  async function markLetterDone(idSurat) {
    const ok = await confirmCard({
      mode: 'edit',
      title: 'Tandai Surat Koreksi Selesai',
      message: 'Pastikan Anda telah memperbarui NIS/Nama siswa yang bersangkutan pada menu Master Siswa sebelum menandai surat ini selesai.',
      details: `Nomor Surat: <strong>${GuestApp.escapeHtml(idSurat)}</strong>`
    });
    if (!ok) return;

    const res = await ApiClient.adminRequest({ action: 'resolve_letter', id_surat: idSurat, status: 'SELESAI' });
    if (res && res.success) {
      SecurityManager.showToast(res.message);
      await loadDashboard();
    }
  }

  function getState() { return state; }

  return {
    init,
    loadDashboard,
    renderTables,
    getTeacherSubjects,
    openLbPreferenceModal,
    addCustomLbRow,
    applyLbPreset,
    openEditModal,
    openFormModal,
    closeCrudModal,
    deleteOne,
    confirmDeleteAll,
    confirmCard,
    markLetterDone,
    getState
  };
})();

document.addEventListener('DOMContentLoaded', () => AdminApp.init());