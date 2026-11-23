const AdminApp = (() => {
  let state = { akun: [], guru: [], mapel: [], kelas: [], siswa: [], nilai: [], surat: [], audit: [] };
  let isSuperAdmin = false;
  let chartInstance = null;
  let activeModalEntity = null;
  let isEditing = false;

  const PRESET_SUBJECTS = [
    'Informatika',
    'Bahasa Indonesia',
    'Matematika',
    'Bahasa Inggris',
    'Ilmu Pengetahuan Alam (IPA)',
    'Ilmu Pengetahuan Sosial (IPS)',
    'Pendidikan Pancasila',
    'TKA — Bahasa Indonesia',
    'TKA — Matematika',
    'TKA — Bahasa Inggris',
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
  }

  async function loadDashboard() {
    const res = await ApiClient.adminRequest({ action: 'admin_dashboard' });
    if (!res || !res.success) return;

    state = res.data;
    isSuperAdmin = Boolean(res.isSuperAdmin);

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
    const belumDinilai = Math.max(0, state.siswa.length - graded.length);

    document.getElementById('kpiCards').innerHTML = `
      <div class="kpi-card"><h4>Total Siswa (${isSuperAdmin ? 'Semua' : 'Kelas Ampuan'})</h4><strong>${state.siswa.length}</strong></div>
      <div class="kpi-card"><h4>Aman (≥ ${APP_CONFIG.KKM})</h4><strong style="color:var(--success)">${amanCount}</strong></div>
      <div class="kpi-card"><h4>Remedial (&lt; ${APP_CONFIG.KKM})</h4><strong style="color:var(--danger)">${remedialCount}</strong></div>
      <div class="kpi-card"><h4>Belum Dinilai</h4><strong style="color:var(--warn)">${belumDinilai}</strong></div>
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
    const nClass = document.getElementById('nilaiTableClassFilter')?.value || 'ALL';
    const nStatus = document.getElementById('nilaiStatusFilter')?.value || 'ALL';

    const filteredNilai = state.nilai.filter(n => {
      const s = siswaMap[String(n.nis).trim()] || {};
      const matchQuery = !nSearch ||
        String(n.nis).toLowerCase().includes(nSearch) ||
        String(s.nama || '').toLowerCase().includes(nSearch);
      const matchClass = nClass === 'ALL' || String(s.kelas || '') === nClass;
      const matchStatus = nStatus === 'ALL' || String(n.status || '') === nStatus;
      return matchQuery && matchClass && matchStatus;
    });

    document.getElementById('table-nilai').innerHTML = `
      <thead><tr><th>NIS</th><th>Nama Siswa</th><th>Kelas</th><th>Mapel</th><th>N1</th><th>N2</th><th>N3</th><th>+Tmb</th><th>Akhir</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${filteredNilai.length === 0 ? `<tr><td colspan="11" class="muted" style="text-align:center;">Tidak ada data nilai yang sesuai filter.</td></tr>` : ''}
        ${filteredNilai.map(n => {
          const s = siswaMap[String(n.nis).trim()] || {};
          return `<tr>
            <td>${esc(n.nis)}</td>
            <td>${esc(s.nama || '-')}</td>
            <td>${esc(s.kelas || '-')}</td>
            <td>${esc(n.mata_pelajaran)}</td>
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
      default: 'Default (Slide & Presentasi)',
      nilai_akhir: 'Nilai Akhir Saja',
      tka: 'Khusus TKA',
      custom: 'Input Sendiri (Kustom)'
    };
    document.getElementById('table-mapel').innerHTML = `
      <thead><tr><th>ID</th><th>Mata Pelajaran / Ujian</th><th>Jenis Ujian</th><th>Guru Mapel</th><th>KKM</th><th>Bentuk Card</th><th>Aksi</th></tr></thead>
      <tbody>
        ${state.mapel.map(m => `<tr>
          <td>${esc(m.id)}</td>
          <td><strong>${esc(m.nama_mapel)}</strong></td>
          <td>${esc(m.jenis_ujian)}</td>
          <td>${esc(m.guru_mapel || '(Kosong)')}</td>
          <td>${esc(m.kkm)}</td>
          <td>${esc(cardLabels[m.tipe_card] || 'Default')}</td>
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
      <thead><tr><th>NIS</th><th>Nama Lengkap</th><th>Kelas</th><th>Kelompok</th><th>Aksi</th></tr></thead>
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
      <thead><tr><th>ID</th><th>Username</th><th>Password</th><th>Guru Mapel / Admin</th><th>Mata Pelajaran</th><th>Role</th><th>Kelas Diampu</th><th>Aksi</th></tr></thead>
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
      const foundMapel = state.mapel.find(m => String(m.nama_mapel).trim() === mapelName);
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
      title.textContent = isEditing ? 'Edit Mata Pelajaran / Ujian' : 'Tambah Mata Pelajaran / Ujian';
      const combinedSubjects = [...new Set([...PRESET_SUBJECTS, ...state.mapel.map(m => m.nama_mapel)])]
        .map(s => ({ value: s, label: s }));

      form.innerHTML = `
        <input type="hidden" name="id" value="${esc(existing?.id || '')}" />
        <div class="form-group">
          <label>Nama Mata Pelajaran / Ujian Lain (Pilih, Cari, atau Ketik Sendiri)</label>
          <div class="combo-wrapper">
            <input type="text" id="mapelComboSearch" autocomplete="off" required placeholder="Pilih dari daftar atau ketik nama ujian baru..." />
            <input type="hidden" id="mapelComboVal" name="nama_mapel" />
            <div id="mapelComboDrop" class="combo-dropdown hidden"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Kategori Ujian</label>
          <input type="text" name="jenis_ujian" required placeholder="Contoh: Penilaian Akhir Semester / TKA" value="${esc(existing?.jenis_ujian || 'Penilaian Akhir Semester')}" />
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
            <option value="default" ${existing?.tipe_card === 'default' ? 'selected' : ''}>Default (Slide 1, Slide 2, Presentasi, Nilai Akhir)</option>
            <option value="nilai_akhir" ${existing?.tipe_card === 'nilai_akhir' ? 'selected' : ''}>Nilai Akhir Saja (Ringkas)</option>
            <option value="tka" ${existing?.tipe_card === 'tka' ? 'selected' : ''}>Khusus TKA (Nilai Bahasa Indonesia, Matematika, dll)</option>
            <option value="custom" ${existing?.tipe_card === 'custom' ? 'selected' : ''}>Input Sendiri / Label Komponen Kustom</option>
          </select>
        </div>
        <div id="customLabelsGroup">
          <div class="form-group">
            <label>Label Komponen 1 (Opsional — misal: TKA Bahasa Indonesia / Tes Tulis)</label>
            <input type="text" name="label_n1" value="${esc(existing?.label_n1 || '')}" />
          </div>
          <div class="form-group">
            <label>Label Komponen 2 (Opsional — misal: TKA Matematika / Praktik)</label>
            <input type="text" name="label_n2" value="${esc(existing?.label_n2 || '')}" />
          </div>
          <div class="form-group">
            <label>Label Komponen 3 (Opsional — misal: TKA Bahasa Inggris / Portofolio)</label>
            <input type="text" name="label_n3" value="${esc(existing?.label_n3 || '')}" />
          </div>
        </div>
        <div class="form-group">
          <label>KKM</label>
          <input type="number" name="kkm" min="1" max="100" required value="${esc(existing?.kkm || 75)}" />
        </div>
        <button type="submit" class="btn btn-primary w-full">Simpan Mata Pelajaran</button>`;

      UIComponents.attachSearchCombo({
        searchInputId: 'mapelComboSearch',
        hiddenInputId: 'mapelComboVal',
        dropdownId: 'mapelComboDrop',
        items: combinedSubjects,
        initialValue: existing?.nama_mapel || '',
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
      const mapelOpts = state.mapel.map(m =>
        `<option value="${esc(m.nama_mapel)}" ${existing?.mata_pelajaran === m.nama_mapel ? 'selected' : ''}>${esc(m.nama_mapel)}</option>`
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
          <label>Kelompok (Opsional — kosongkan jika individual)</label>
          <input type="text" name="kelompok" value="${esc(existing?.kelompok || '')}" />
        </div>
        <button type="submit" class="btn btn-primary w-full">Simpan Siswa</button>`;
    }

    if (entity === 'akun') {
      title.textContent = isEditing ? 'Edit Akun Guru / Admin' : 'Tambah Akun Guru / Admin';
      const mapelOpts = state.mapel.map(m =>
        `<option value="${esc(m.nama_mapel)}" ${existing?.mata_pelajaran === m.nama_mapel ? 'selected' : ''}>${esc(m.nama_mapel)}</option>`
      ).join('');

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
          <label>Mata Pelajaran (Otomatis Mengunci Input Nilai Akun Ini)</label>
          <select name="mata_pelajaran" required>
            <option value="Semua Mata Pelajaran" ${existing?.mata_pelajaran === 'Semua Mata Pelajaran' ? 'selected' : ''}>Semua Mata Pelajaran (Khusus Super Admin)</option>
            ${mapelOpts}
          </select>
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
    }

    if (entity === 'nilai') {
      title.textContent = isEditing ? 'Edit Nilai Siswa' : 'Input Nilai Siswa';
      const studentItems = state.siswa.map(s => ({
        value: String(s.nis),
        label: `${s.nis} — ${s.nama} (${s.kelas})`
      }));
      const existingStudent = state.siswa.find(s => String(s.nis) === String(existing?.nis));

      const accountSubject = admin.mata_pelajaran || '';
      const isGlobalSuper = isSuperAdmin && (!accountSubject || accountSubject === 'Semua Mata Pelajaran');

      const mapelFieldHtml = isGlobalSuper
        ? `<div class="form-group"><label>Mata Pelajaran</label><select name="mata_pelajaran" required>${state.mapel.map(m => `<option value="${esc(m.nama_mapel)}" ${existing?.mata_pelajaran === m.nama_mapel ? 'selected' : ''}>${esc(m.nama_mapel)}</option>`).join('')}</select></div>`
        : `<div class="form-group">
             <label>Mata Pelajaran (Otomatis dari Master Akun — Terkunci)</label>
             <input type="text" name="mata_pelajaran" readonly class="input-locked" value="${esc(accountSubject)}" />
           </div>`;

      form.innerHTML = `
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
          <label>Nilai 1 / Komponen 1 (Opsional, 0-100)</label>
          <input type="number" step="0.01" min="0" max="100" name="nilai_1" value="${esc(existing?.nilai_1 ?? '')}" />
        </div>
        <div class="form-group">
          <label>Nilai 2 / Komponen 2 (Opsional, 0-100)</label>
          <input type="number" step="0.01" min="0" max="100" name="nilai_2" value="${esc(existing?.nilai_2 ?? '')}" />
        </div>
        <div class="form-group">
          <label>Nilai 3 / Komponen 3 (Opsional, 0-100)</label>
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
      attachGradeLivePreview();
    }

    document.getElementById('crudModal').classList.remove('hidden');
  }

  function closeCrudModal() {
    document.getElementById('crudModal').classList.add('hidden');
  }

  async function handleCrudSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());

    if (activeModalEntity === 'mapel' && !data.nama_mapel) {
      data.nama_mapel = (document.getElementById('mapelComboSearch')?.value || '').trim();
    }

    if (activeModalEntity === 'nilai' && !data.nis) {
      SecurityManager.showToast('Pilih siswa yang valid dari daftar pencarian terlebih dahulu.');
      return;
    }

    const ok = await confirmCard({
      mode: isEditing ? 'edit' : 'add',
      title: isEditing ? `Konfirmasi Ubah Data ${activeModalEntity.toUpperCase()}` : `Konfirmasi Tambah Data ${activeModalEntity.toUpperCase()}`,
      message: isEditing
        ? 'Perubahan ini akan langsung memperbarui database Google Sheets dan tampilan portal siswa.'
        : 'Data baru akan ditambahkan ke database Portal Hasil Penilaian.',
      details: Object.entries(data)
        .filter(([k, v]) => k !== 'password' && v !== '')
        .map(([k, v]) => `<strong>${GuestApp.escapeHtml(k)}</strong>: ${GuestApp.escapeHtml(v)}`)
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