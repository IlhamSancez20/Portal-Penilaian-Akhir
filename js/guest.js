const GuestApp = (() => {
  const FALLBACK_CATEGORIES = [
    { key: 'slide_group', label: 'Pembuatan Slide (Kelompok)', source: 'avg_1_2', scope: 'group' },
    { key: 'pres_group', label: 'Presentasi (Kelompok)', source: 'nilai_3', scope: 'group' },
    { key: 'total_group', label: 'Total Akhir (Kelompok)', source: 'nilai_akhir', scope: 'group' },
    { key: 'slide_indiv', label: 'Pembuatan Slide (Individual)', source: 'avg_1_2', scope: 'indiv' },
    { key: 'pres_indiv', label: 'Presentasi (Individual)', source: 'nilai_3', scope: 'indiv' },
    { key: 'total_indiv', label: 'Total Akhir (Individual)', source: 'nilai_akhir', scope: 'indiv' }
  ];

  const SOURCE_DESC_MAP = {
    nilai_akhir: 'Nilai Akhir tertinggi',
    nilai_1: 'Komponen 1 (Nilai 1) tertinggi',
    nilai_2: 'Komponen 2 (Nilai 2) tertinggi',
    nilai_3: 'Komponen 3 (Nilai 3) tertinggi',
    avg_1_2: 'rata-rata Nilai 1 & Nilai 2 tertinggi',
    avg_all: 'rata-rata Nilai 1, Nilai 2, & Nilai 3 tertinggi'
  };

  let publicData = null;
  let currentCatIndex = 0;
  let autoSlideEnabled = true;
  let slideElapsed = 0;
  let activeStudentPayload = null;
  let activeSubjectIndex = 0;

  async function init() {
    document.getElementById('studentSearchForm').addEventListener('submit', async e => {
      e.preventDefault();
      await executeSearch();
    });

    document.getElementById('lbClassFilter').addEventListener('change', () => renderLeaderboard());
    document.getElementById('lbSubjectFilter').addEventListener('change', () => {
      currentCatIndex = 0;
      slideElapsed = 0;
      renderLeaderboard();
    });

    document.getElementById('btnToggleAutoSlide').addEventListener('click', e => {
      autoSlideEnabled = !autoSlideEnabled;
      e.target.textContent = autoSlideEnabled ? '⏸️ 30s Auto' : '▶️ Jeda';
    });

    await loadLeaderboardData();
    startAutoRotation();
  }

  function getAllCategories() {
    if (publicData && Array.isArray(publicData.lb_categories) && publicData.lb_categories.length > 0) {
      return publicData.lb_categories;
    }
    return FALLBACK_CATEGORIES;
  }

  function getActiveCategoriesForSelection() {
    const allCats = getAllCategories();
    if (!publicData || !publicData.subjects) return allCats;

    const selectedCombo = String(document.getElementById('lbSubjectFilter')?.value || 'ALL');
    if (selectedCombo === 'ALL') {
      return allCats;
    }

    const subjObj = publicData.subjects.find(s => String(s.key) === selectedCombo);
    const allowedKeys = subjObj?.lb_keys || subjObj?.lb_modes || [];
    if (!Array.isArray(allowedKeys) || allowedKeys.length === 0) {
      return allCats;
    }

    const filtered = allCats.filter(c => allowedKeys.includes(c.key));
    return filtered.length > 0 ? filtered : allCats;
  }

  function formatCategoryDesc(cat) {
    const srcText = SOURCE_DESC_MAP[cat.source] || 'skor tertinggi';
    const scopeText = cat.scope === 'group' ? 'Berbasis Kelompok' : 'Berbasis Individual';
    return `Top 10 ${srcText} — ${scopeText}`;
  }

  async function loadLeaderboardData() {
    try {
      const res = await ApiClient.getPublicInit();
      if (!res || !res.success) return;
      publicData = res;

      const classSel = document.getElementById('lbClassFilter');
      classSel.innerHTML = `<option value="ALL">Semua Kelas (VII, VIII, XI)</option>` +
        (res.classes || []).map(c => `<option value="${escapeHtml(String(c.nama_kelas))}">Kelas ${escapeHtml(String(c.nama_kelas))} (${escapeHtml(String(c.tingkat))})</option>`).join('');

      const subjSel = document.getElementById('lbSubjectFilter');
      subjSel.innerHTML = `<option value="ALL">Semua Mapel • Jenis Ujian • Guru Mapel</option>` +
        (res.subjects || []).map(m => {
          const guruPart = m.guru_mapel && m.guru_mapel !== '-' ? ` • ${m.guru_mapel}` : '';
          const label = `${m.nama_mapel} • ${m.jenis_ujian}${guruPart}`;
          return `<option value="${escapeHtml(String(m.key))}">${escapeHtml(label)}</option>`;
        }).join('');

      renderLeaderboard();
    } catch (err) {
      document.getElementById('lbListContainer').innerHTML =
        `<div class="pending-notice">Gagal memuat papan peringkat. Periksa koneksi atau konfigurasi API.</div>`;
    }
  }

  function startAutoRotation() {
    const stepMs = 250;
    setInterval(() => {
      if (!autoSlideEnabled) return;
      const activeCats = getActiveCategoriesForSelection();
      if (activeCats.length <= 1) {
        const bar = document.getElementById('lbProgressBar');
        if (bar) bar.style.width = '100%';
        return;
      }

      slideElapsed += stepMs;
      const pct = Math.max(0, 100 - (slideElapsed / APP_CONFIG.LEADERBOARD_INTERVAL_MS) * 100);
      const bar = document.getElementById('lbProgressBar');
      if (bar) bar.style.width = `${pct}%`;

      if (slideElapsed >= APP_CONFIG.LEADERBOARD_INTERVAL_MS) {
        slideElapsed = 0;
        currentCatIndex = (currentCatIndex + 1) % activeCats.length;
        renderLeaderboard();
      }
    }, stepMs);
  }

  function renderLeaderboard() {
    const activeCats = getActiveCategoriesForSelection();
    if (currentCatIndex >= activeCats.length) {
      currentCatIndex = 0;
    }

    const cat = activeCats[currentCatIndex];
    const selectedClass = String(document.getElementById('lbClassFilter').value);
    const selectedCombo = String(document.getElementById('lbSubjectFilter').value);

    const selectedSubjObj = (publicData?.subjects || []).find(s => String(s.key) === selectedCombo);
    const headerContext = selectedSubjObj
      ? ` (${selectedSubjObj.nama_mapel} • ${selectedSubjObj.jenis_ujian}${selectedSubjObj.guru_mapel && selectedSubjObj.guru_mapel !== '-' ? ` • ${selectedSubjObj.guru_mapel}` : ''})`
      : '';

    document.getElementById('lbCategoryTitle').textContent = cat.label + headerContext;
    document.getElementById('lbCategoryDesc').textContent = formatCategoryDesc(cat);

    const tabsEl = document.getElementById('lbCategoryTabs');
    tabsEl.innerHTML = activeCats.map((c, idx) => `
      <button type="button" class="tab-chip ${idx === currentCatIndex ? 'active' : ''}" data-idx="${idx}">
        ${idx + 1}. ${escapeHtml(c.label)}
      </button>
    `).join('');

    tabsEl.querySelectorAll('.tab-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        currentCatIndex = Number(btn.dataset.idx);
        slideElapsed = 0;
        renderLeaderboard();
      });
    });

    const container = document.getElementById('lbListContainer');
    if (!publicData || !publicData.leaderboards) return;

    let list = [...(publicData.leaderboards[cat.key] || [])];

    if (selectedClass !== 'ALL') {
      list = list.filter(item => String(item.kelas) === selectedClass);
    }
    if (selectedCombo !== 'ALL') {
      list = list.filter(item => String(item.combo_key) === selectedCombo);
    }

    list.sort((a, b) => Number(b.score) - Number(a.score));
    const topList = list.slice(0, 10);

    if (topList.length === 0) {
      container.innerHTML = `<div class="muted">Belum ada data nilai pada kategori &amp; filter ini.</div>`;
      return;
    }

    container.innerHTML = topList.map((item, i) => `
      <div class="rank-card animate-fade">
        <div class="rank-medal">#${i + 1}</div>
        <div class="rank-info">
          <h4 title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</h4>
          <small class="muted">
            Kelas ${escapeHtml(String(item.kelas))} • <strong>${escapeHtml(item.nama_mapel)}</strong> (${escapeHtml(item.jenis_ujian)})${item.guru_mapel && item.guru_mapel !== '-' ? ` • ${escapeHtml(item.guru_mapel)}` : ''}
          </small>
        </div>
        <div class="rank-score">${item.score}</div>
      </div>
    `).join('');
  }

  async function executeSearch() {
    const input = document.getElementById('studentQueryInput');
    const section = document.getElementById('searchResultSection');
    const btn = document.getElementById('btnSearchStudent');
    const query = input.value.trim();

    if (!query) return;
    btn.disabled = true;
    btn.textContent = 'Mencari...';
    section.classList.remove('hidden');
    section.innerHTML = `<div class="card-glass">Memeriksa data siswa &amp; daftar ujian...</div>`;

    try {
      const res = await ApiClient.searchStudent(query);
      if (!res.success) {
        section.innerHTML = `<div class="card-glass pending-notice">${escapeHtml(res.message)}</div>`;
        return;
      }

      activeStudentPayload = res;
      activeSubjectIndex = 0;
      renderStudentGradeCard();
    } catch (err) {
      section.innerHTML = `<div class="card-glass pending-notice">Gangguan jaringan saat memuat data. Silakan coba lagi.</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cari Nilai';
    }
  }

  function selectSubject(index) {
    activeSubjectIndex = index;
    renderStudentGradeCard();
  }

  function copyRemedialTemplate(encodedText) {
    const text = decodeURIComponent(encodedText);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (typeof SecurityManager !== 'undefined') SecurityManager.showToast('Template pesan WhatsApp berhasil disalin!');
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      if (typeof SecurityManager !== 'undefined') SecurityManager.showToast('Template pesan WhatsApp berhasil disalin!');
    }
  }

  function formatWaPhone(rawPhone) {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) return '62' + digits.slice(1);
    return digits;
  }

  function buildScoreBodyByCardType(sub) {
    const fmtVal = v => (v === '' || v === null || v === undefined) ? '-' : v;
    const type = sub.tipe_card || 'default';

    if (type === 'nilai_akhir') {
      return `
        <div class="final-only-hero">
          <div>
            <span class="pill-info" style="margin-bottom:6px;">HASIL ${escapeHtml(sub.jenis_ujian).toUpperCase()}</span>
            <h4>${escapeHtml(sub.mata_pelajaran)}</h4>
            <small class="muted">Kategori: <strong>${escapeHtml(sub.is_kelompok ? `Kelompok (${sub.kelompok})` : 'Individual')}</strong> • Poin Tambahan: <strong>+${fmtVal(sub.nilai_tambah)}</strong> • KKM: <strong>${sub.kkm}</strong></small>
          </div>
          <div style="text-align:right;">
            <small class="muted" style="display:block;">NILAI AKHIR</small>
            <div class="final-only-score">${fmtVal(sub.nilai_akhir)}</div>
          </div>
        </div>
      `;
    }

    if (type === 'tka') {
      const lbl1 = sub.label_n1 || 'TKA — Bahasa Indonesia (Literasi)';
      const lbl2 = sub.label_n2 || 'TKA — Matematika (Numerasi)';
      const lbl3 = sub.label_n3 || 'TKA — Penalaran / Bahasa Inggris';

      return `
        <div>
          <span class="tka-banner" style="margin-bottom:10px;">📘 KARTU HASIL ${escapeHtml(sub.jenis_ujian).toUpperCase()}</span>
          <div class="tka-grid">
            ${sub.nilai_1 !== '' && sub.nilai_1 !== null ? `<div class="tka-box"><span>${escapeHtml(lbl1)}</span><strong>${fmtVal(sub.nilai_1)}</strong></div>` : ''}
            ${sub.nilai_2 !== '' && sub.nilai_2 !== null ? `<div class="tka-box"><span>${escapeHtml(lbl2)}</span><strong>${fmtVal(sub.nilai_2)}</strong></div>` : ''}
            ${sub.nilai_3 !== '' && sub.nilai_3 !== null ? `<div class="tka-box"><span>${escapeHtml(lbl3)}</span><strong>${fmtVal(sub.nilai_3)}</strong></div>` : ''}
            <div class="tka-box"><span>Nilai Tambah</span><strong>+${fmtVal(sub.nilai_tambah)}</strong></div>
            <div class="tka-box" style="border-color:var(--primary); background:rgba(37,99,235,0.08);">
              <span style="color:var(--primary);">Skor Akhir TKA</span>
              <strong>${fmtVal(sub.nilai_akhir)}</strong>
            </div>
          </div>
        </div>
      `;
    }

    if (type === 'custom') {
      const items = [];
      if (sub.nilai_1 !== '' && sub.nilai_1 !== null) items.push({ label: sub.label_n1 || 'Nilai 1 (Pembuatan)', val: sub.nilai_1 });
      if (sub.nilai_2 !== '' && sub.nilai_2 !== null) items.push({ label: sub.label_n2 || 'Nilai 2 (Slide)', val: sub.nilai_2 });
      if (sub.nilai_3 !== '' && sub.nilai_3 !== null) items.push({ label: sub.label_n3 || 'Nilai 3 (Presentasi)', val: sub.nilai_3 });

      return `
        <div class="grades-grid">
          ${items.map(it => `
            <div class="grade-box">
              <span>${escapeHtml(it.label)}</span>
              <strong>${fmtVal(it.val)}</strong>
            </div>
          `).join('')}
          ${Number(sub.nilai_tambah) > 0 ? `
            <div class="grade-box">
              <span>Nilai Tambah</span>
              <strong>+${fmtVal(sub.nilai_tambah)}</strong>
            </div>
          ` : ''}
          <div class="grade-box highlight">
            <span>Nilai Akhir (${escapeHtml(sub.jenis_ujian)})</span>
            <strong>${fmtVal(sub.nilai_akhir)}</strong>
          </div>
        </div>
      `;
    }

    return `
      <div class="grades-grid">
        <div class="grade-box">
          <span>${escapeHtml(sub.label_n1 || 'Nilai 1 (Pembuatan)')}</span>
          <strong>${fmtVal(sub.nilai_1)}</strong>
        </div>
        <div class="grade-box">
          <span>${escapeHtml(sub.label_n2 || 'Nilai 2 (Slide)')}</span>
          <strong>${fmtVal(sub.nilai_2)}</strong>
        </div>
        <div class="grade-box">
          <span>${escapeHtml(sub.label_n3 || 'Nilai 3 (Presentasi)')}</span>
          <strong>${fmtVal(sub.nilai_3)}</strong>
        </div>
        <div class="grade-box">
          <span>Nilai Tambah</span>
          <strong>+${fmtVal(sub.nilai_tambah)}</strong>
        </div>
        <div class="grade-box highlight">
          <span>Nilai Akhir (${escapeHtml(sub.jenis_ujian)})</span>
          <strong>${fmtVal(sub.nilai_akhir)}</strong>
        </div>
      </div>
    `;
  }

  function renderStudentGradeCard() {
    const section = document.getElementById('searchResultSection');
    const { student, subjects } = activeStudentPayload;

    if (!subjects || subjects.length === 0) {
      section.innerHTML = `
        <div class="card-glass result-card">
          <h3>${escapeHtml(student.nama)} (${escapeHtml(String(student.nis))})</h3>
          <div class="pending-notice">⏳ Belum ada mata pelajaran atau nilai yang dipublikasikan untuk siswa ini.</div>
        </div>`;
      return;
    }

    const sub = subjects[activeSubjectIndex] || subjects[0];
    const variantClass = `card-variant-${escapeHtml(sub.tipe_card || 'default')}`;
    const pesertaLabel = sub.is_kelompok ? `Kelompok: ${sub.kelompok}` : 'Individual';

    const subjectButtonsHtml = `
      <div>
        <small class="muted" style="display:block; margin-bottom:8px; font-weight:700;">
          Ditemukan ${subjects.length} Pilihan Ujian / Penilaian (Klik untuk membuka kartu hasil masing-masing):
        </small>
        <div class="subject-selector-bar">
          ${subjects.map((item, idx) => {
            const katBadge = item.is_kelompok ? `Kelompok: ${item.kelompok}` : 'Individual';
            const statusText = item.pending ? 'Proses' : `${item.nilai_akhir}`;
            return `
              <button type="button" class="subject-pill ${idx === activeSubjectIndex ? 'active' : ''}" onclick="GuestApp.selectSubject(${idx})">
                <strong>${escapeHtml(item.mata_pelajaran)}</strong> • ${escapeHtml(item.jenis_ujian)}
                <small>[${escapeHtml(katBadge)}${item.guru_mapel && item.guru_mapel !== '-' ? ` • ${escapeHtml(item.guru_mapel)}` : ''} • ${escapeHtml(statusText)}]</small>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    if (sub.pending) {
      section.innerHTML = `
        <div class="card-glass result-card ${variantClass}">
          <div class="student-meta">
            <div>
              <h3>${escapeHtml(student.nama)}</h3>
              <p class="muted">
                NIS: <strong>${escapeHtml(String(student.nis))}</strong> •
                Kelas: <strong>${escapeHtml(String(student.kelas))}</strong> •
                Kategori: <strong>${escapeHtml(pesertaLabel)}</strong> •
                Jenis Ujian: <strong>${escapeHtml(sub.jenis_ujian)}</strong> •
                Guru Mapel: <strong>${escapeHtml(sub.guru_mapel)}</strong>
              </p>
            </div>
            <span class="status-badge">PROSES PENILAIAN</span>
          </div>
          ${subjectButtonsHtml}
          <div class="pending-notice">
            ⏳ <strong>${escapeHtml(sub.mata_pelajaran)} (${escapeHtml(sub.jenis_ujian)})</strong>: ${escapeHtml(sub.message)}
          </div>
        </div>`;
      return;
    }

    const isAman = sub.status === 'AMAN';
    if (isAman) ThemeAudio.playSuccess();
    else ThemeAudio.playRemedial();

    const rawTemplate = `Assalamualaikum wr, wb.
Selamat pagi / siang / sore / malam, saya dari :
Nama : [nama lengkap]
Kelas : [Kelas sendiri]
Mata Pelajaran : [Mata pelajaran apa]
Saya ingin memperbaiki nilai saya pada [mata pelajaran apa], jadi yang harus saya lakukan apa bu/pak untuk memperbaiki nilai saya ?.
Terima kasih.`;

    const filledTemplate = `Assalamualaikum wr, wb.
Selamat pagi / siang / sore / malam, saya dari :
Nama : ${student.nama}
Kelas : ${student.kelas}
Mata Pelajaran : ${sub.mata_pelajaran} (${sub.jenis_ujian})
Saya ingin memperbaiki nilai saya pada ${sub.mata_pelajaran} (${sub.jenis_ujian}), jadi yang harus saya lakukan apa bu/pak untuk memperbaiki nilai saya ?.
Terima kasih.`;

    const waNumber = formatWaPhone(sub.guru_wa);
    const waDirectLink = waNumber
      ? `<a class="btn btn-primary btn-sm" href="https://wa.me/${waNumber}?text=${encodeURIComponent(filledTemplate)}" target="_blank" rel="noopener noreferrer">💬 Chat WhatsApp Guru</a>`
      : '';

    section.innerHTML = `
      <div class="card-glass result-card ${variantClass} ${isAman ? 'aman' : 'remedial'}">
        <div class="student-meta">
          <div>
            <h3>${escapeHtml(student.nama)}</h3>
            <p class="muted">
              NIS: <strong>${escapeHtml(String(student.nis))}</strong> •
              Kelas: <strong>${escapeHtml(String(student.kelas))}</strong> •
              Kategori: <strong>${escapeHtml(pesertaLabel)}</strong> •
              Jenis Ujian: <strong>${escapeHtml(sub.jenis_ujian)}</strong> •
              Guru Mapel: <strong>${escapeHtml(sub.guru_mapel)}</strong>
            </p>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="status-badge ${isAman ? 'aman' : 'remedial'}">
              ${isAman ? '🎉 SELAMAT — AMAN (TUNTAS)' : '⚠️ TIDAK SELAMAT — REMEDIAL'}
            </span>
            <button type="button" class="btn btn-ghost btn-sm no-print" onclick="window.print()">🖨️ Cetak Kartu Nilai</button>
          </div>
        </div>

        ${subjectButtonsHtml}
        ${buildScoreBodyByCardType(sub)}

        ${!isAman ? `
          <div class="remedial-notice">
            <strong>Instruksi Perbaikan Nilai (Remedial — ${escapeHtml(sub.mata_pelajaran)} • ${escapeHtml(sub.jenis_ujian)}):</strong><br/>
            Silakan kepada guru yang bersangkutan mau secara ketemu langsung atau chat whatsapp pribadi ke guru tersebut untuk memperbaiki nilai. Contoh pesan template yang benar untuk chat whatsapp pribadi ke guru adalah :
            <pre class="wa-template-box">${escapeHtml(rawTemplate)}</pre>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;" class="no-print">
              ${waDirectLink}
              <button type="button" class="btn btn-primary btn-sm" onclick="GuestApp.copyRemedialTemplate('${encodeURIComponent(filledTemplate)}')">
                📋 Salin Pesan Siap Kirim (Terisi Otomatis)
              </button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="GuestApp.copyRemedialTemplate('${encodeURIComponent(rawTemplate)}')">
                📄 Salin Template
              </button>
            </div>
          </div>
        ` : `
          <p class="muted">Selamat! Nilai akhir Anda pada <strong>${escapeHtml(sub.mata_pelajaran)} (${escapeHtml(sub.jenis_ujian)})</strong> telah melampaui batas ketuntasan (KKM ${sub.kkm}).</p>
        `}
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init, loadLeaderboardData, selectSubject, copyRemedialTemplate, escapeHtml };
})();

document.addEventListener('DOMContentLoaded', () => GuestApp.init());