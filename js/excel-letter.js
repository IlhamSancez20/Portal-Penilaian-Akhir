const ExcelLetterManager = (() => {
  function init() {
    const fileInput = document.getElementById('excelUploadInput');
    if (fileInput) {
      fileInput.addEventListener('change', handleExcelUpload);
    }
  }

  function parseFlexNum(val) {
    if (val === '' || val === null || val === undefined) return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const norm = String(val).trim().replace(',', '.');
    if (norm === '') return null;
    const n = Number(norm);
    return isNaN(n) ? null : n;
  }

  function cleanNis(raw) {
    let s = String(raw ?? '').trim().replace(/^'+/, '');
    if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
    return s;
  }

  function normalizeRowKeys(rawRow) {
    const normMap = {};
    Object.keys(rawRow || {}).forEach(k => {
      const cleanKey = String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      normMap[cleanKey] = rawRow[k];
    });
    return normMap;
  }

  function pickField(normMap, candidates) {
    for (const key of candidates) {
      if (normMap[key] !== undefined && normMap[key] !== '') {
        return normMap[key];
      }
    }
    return '';
  }

  function sanitizeExcelText(val) {
    const str = String(val ?? '');
    return /^[=+\-@]/.test(str) ? `'${str}` : str;
  }

  function populateExcelFilters() {
    const state = AdminApp.getState();
    const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
    const classSel = document.getElementById('excelClassFilter');
    const subjSel = document.getElementById('excelSubjectFilter');
    if (!classSel || !subjSel) return;

    const classes = [...new Set((state.siswa || []).map(s => String(s.kelas).trim()).filter(Boolean))].sort();
    classSel.innerHTML = `<option value="ALL">Semua Kelas (${classes.length} Kelas)</option>` +
      classes.map(c => `<option value="${GuestApp.escapeHtml(c)}">Kelas ${GuestApp.escapeHtml(c)}</option>`).join('');

    const isGlobalSuper = (admin.id === 'ADM-001' || admin.role === 'Super Admin') &&
      (!admin.mata_pelajaran || admin.mata_pelajaran === 'Semua Mata Pelajaran');

    if (isGlobalSuper) {
      const subjects = (state.mapel || []).map(m => String(m.nama_mapel).trim()).filter(Boolean);
      subjSel.innerHTML = subjects.length > 0
        ? subjects.map(s => `<option value="${GuestApp.escapeHtml(s)}">${GuestApp.escapeHtml(s)}</option>`).join('')
        : `<option value="">-- Belum Ada Mapel --</option>`;
      subjSel.disabled = false;
    } else {
      const lockedSubj = admin.mata_pelajaran || '';
      subjSel.innerHTML = `<option value="${GuestApp.escapeHtml(lockedSubj)}">${GuestApp.escapeHtml(lockedSubj)}</option>`;
      subjSel.disabled = true;
    }
  }

  function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
      SecurityManager.showToast('Library Excel belum siap, coba beberapa detik lagi.');
      return;
    }

    const state = AdminApp.getState();
    const selectedClass = document.getElementById('excelClassFilter')?.value || 'ALL';
    const selectedSubject = document.getElementById('excelSubjectFilter')?.value || '';

    if (!selectedSubject) {
      SecurityManager.showToast('Pilih Mata Pelajaran terlebih dahulu sebelum mengunduh template.');
      return;
    }

    const filteredStudents = (state.siswa || []).filter(s =>
      selectedClass === 'ALL' || String(s.kelas).trim() === selectedClass
    );

    if (filteredStudents.length === 0) {
      SecurityManager.showToast('Tidak ada data siswa pada filter kelas yang dipilih.');
      return;
    }

    const existingMap = {};
    (state.nilai || []).forEach(n => {
      if (String(n.mata_pelajaran).trim() === selectedSubject) {
        existingMap[String(n.nis).trim()] = n;
      }
    });

    let prefilledCount = 0;
    const rows = filteredStudents.map(s => {
      const ex = existingMap[String(s.nis).trim()] || {};
      const hasExisting = ex.nilai_akhir !== undefined && ex.nilai_akhir !== '' && ex.status !== 'BELUM_DINILAI';
      if (hasExisting) prefilledCount++;

      return {
        NIS: sanitizeExcelText(s.nis),
        Nama_Siswa: sanitizeExcelText(s.nama),
        Kelas: sanitizeExcelText(s.kelas),
        Mata_Pelajaran: sanitizeExcelText(selectedSubject),
        Nilai_1_Pembuatan: ex.nilai_1 ?? '',
        Nilai_2_Slide: ex.nilai_2 ?? '',
        Nilai_3_Presentasi: ex.nilai_3 ?? '',
        Nilai_Tambah: ex.nilai_tambah ?? 0,
        Nilai_Akhir: hasExisting ? ex.nilai_akhir : ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 15 }, { wch: 28 }, { wch: 12 }, { wch: 24 },
      { wch: 18 }, { wch: 15 }, { wch: 19 }, { wch: 14 }, { wch: 15 }
    ];

    const guideRows = [
      { Aturan: '1. Komponen Nilai', Penjelasan: 'Nilai_1_Pembuatan = Pembuatan, Nilai_2_Slide = Slide, Nilai_3_Presentasi = Presentasi.' },
      { Aturan: '2. Kolom Nilai_Akhir Terisi', Penjelasan: 'Jika kolom Nilai_Akhir diisi angka (misal 85), sistem mempertahankan nilai tersebut apa adanya (TETAP).' },
      { Aturan: '3. Kolom Nilai_Akhir Kosong', Penjelasan: 'Jika kolom Nilai_Akhir dikosongkan, sistem otomatis menghitung rata-rata (Pembuatan, Slide, Presentasi) + Nilai_Tambah.' }
    ];
    const wsGuide = XLSX.utils.json_to_sheet(guideRows);
    wsGuide['!cols'] = [{ wch: 28 }, { wch: 85 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Nilai');
    XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk');

    const safeMapel = selectedSubject.replace(/[^a-zA-Z0-9]/g, '_');
    const safeClass = selectedClass === 'ALL' ? 'Semua_Kelas' : `Kelas_${selectedClass.replace(/[^a-zA-Z0-9]/g, '_')}`;
    XLSX.writeFile(wb, `Template_Nilai_${safeMapel}_${safeClass}.xlsx`);

    SecurityManager.showToast(
      `Template ${safeClass.replace('_', ' ')} diunduh (${filteredStudents.length} siswa, ${prefilledCount} sudah ada nilai & siap diedit).`
    );
  }

  function exportRekapExcel() {
    if (typeof XLSX === 'undefined') {
      SecurityManager.showToast('Library Excel belum siap, coba beberapa detik lagi.');
      return;
    }

    const state = AdminApp.getState();
    const selectedClass = document.getElementById('excelClassFilter')?.value || 'ALL';
    const selectedSubject = document.getElementById('excelSubjectFilter')?.value || '';

    const siswaMap = {};
    (state.siswa || []).forEach(s => { siswaMap[String(s.nis).trim()] = s; });

    const filteredNilai = (state.nilai || []).filter(n => {
      const s = siswaMap[String(n.nis).trim()] || {};
      const matchClass = selectedClass === 'ALL' || String(s.kelas).trim() === selectedClass;
      const matchSubj = !selectedSubject || String(n.mata_pelajaran).trim() === selectedSubject;
      return matchClass && matchSubj;
    });

    if (filteredNilai.length === 0) {
      SecurityManager.showToast('Belum ada data nilai untuk diekspor pada filter ini.');
      return;
    }

    const rows = filteredNilai.map((n, idx) => {
      const s = siswaMap[String(n.nis).trim()] || {};
      return {
        No: idx + 1,
        NIS: sanitizeExcelText(n.nis),
        Nama_Siswa: sanitizeExcelText(s.nama || '-'),
        Kelas: sanitizeExcelText(s.kelas || '-'),
        Kelompok: sanitizeExcelText(s.kelompok || 'Individual'),
        Mata_Pelajaran: sanitizeExcelText(n.mata_pelajaran),
        Nilai_1_Pembuatan: n.nilai_1 ?? '',
        Nilai_2_Slide: n.nilai_2 ?? '',
        Nilai_3_Presentasi: n.nilai_3 ?? '',
        Nilai_Tambah: n.nilai_tambah ?? 0,
        Nilai_Akhir: n.nilai_akhir ?? '',
        Status: n.status || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 15 }, { wch: 28 }, { wch: 12 }, { wch: 16 },
      { wch: 22 }, { wch: 18 }, { wch: 15 }, { wch: 19 }, { wch: 13 }, { wch: 13 }, { wch: 14 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Nilai');
    XLSX.writeFile(wb, `Rekap_Nilai_${(selectedSubject || 'Semua').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
    SecurityManager.showToast(`Rekap nilai (${rows.length} baris) berhasil diekspor.`);
  }

  async function handleExcelUpload(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheetName = wb.SheetNames.includes('Data_Nilai') ? 'Data_Nilai' : wb.SheetNames[0];
        const jsonRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

        if (jsonRows.length === 0) {
          SecurityManager.showToast('File Excel kosong (0 baris data ditemukan pada sheet pertama).');
          return;
        }

        const fallbackMapel = document.getElementById('excelSubjectFilter')?.value || '';
        let fixedCount = 0;
        let autoCount = 0;
        const normalizedRows = [];

        jsonRows.forEach(raw => {
          const nm = normalizeRowKeys(raw);
          const nis = cleanNis(pickField(nm, ['nis', 'nisn', 'nomorinduk']));
          if (!nis) return;

          const rawN1 = pickField(nm, ['nilai1pembuatan', 'nilai1', 'pembuatan', 'n1']);
          const rawN2 = pickField(nm, ['nilai2slide', 'nilai2', 'slide', 'n2']);
          const rawN3 = pickField(nm, ['nilai3presentasi', 'nilai3', 'presentasi', 'n3']);
          const rawTambah = pickField(nm, ['nilaitambah', 'tambah', 'poin']);
          const rawFinal = pickField(nm, ['nilaiakhir', 'nilaiakhirmanual', 'akhir', 'total']);
          const rawMapel = pickField(nm, ['matapelajaran', 'mapel', 'ujian']) || fallbackMapel;

          const n1 = parseFlexNum(rawN1);
          const n2 = parseFlexNum(rawN2);
          const n3 = parseFlexNum(rawN3);
          const nFinal = parseFlexNum(rawFinal);

          if (nFinal !== null) {
            fixedCount++;
          } else if (n1 !== null || n2 !== null || n3 !== null) {
            autoCount++;
          } else {
            return;
          }

          normalizedRows.push({
            NIS: nis,
            Mata_Pelajaran: String(rawMapel).trim(),
            Nilai_1: rawN1,
            Nilai_2: rawN2,
            Nilai_3: rawN3,
            Nilai_Tambah: rawTambah === '' ? 0 : rawTambah,
            Nilai_Akhir: rawFinal
          });
        });

        const emptySkipped = jsonRows.length - normalizedRows.length;

        if (normalizedRows.length === 0) {
          const detectedCols = Object.keys(jsonRows[0] || {}).join(', ') || '(tidak ada)';
          SecurityManager.showToast(
            `Tidak ada baris nilai valid yang terbaca. Kolom terdeteksi: ${detectedCols}. Pastikan kolom NIS dan minimal 1 kolom nilai terisi angka.`
          );
          return;
        }

        const confirmed = await AdminApp.confirmCard({
          mode: 'edit',
          title: 'Konfirmasi Upload & Olah Nilai Excel',
          message: 'Nilai Akhir yang sudah terisi pada Excel akan dipertahankan tetap, sedangkan yang kosong akan dihitung otomatis oleh sistem.',
          details: `Nama File: <strong>${GuestApp.escapeHtml(file.name)}</strong> (Sheet: ${GuestApp.escapeHtml(sheetName)})<br/>Total Siswa Diproses: <strong>${normalizedRows.length} siswa</strong><br/>• Nilai Akhir Tetap (Terisi di Excel): <strong>${fixedCount} siswa</strong><br/>• Nilai Akhir Dihitung Otomatis (Kosong): <strong>${autoCount} siswa</strong>${emptySkipped > 0 ? `<br/>• Baris Tanpa NIS / Nilai Kosong: <strong>${emptySkipped} baris</strong>` : ''}`
        });

        if (!confirmed) return;

        const res = await ApiClient.adminRequest({
          action: 'bulk_upload_nilai',
          rows: normalizedRows,
          fallback_mapel: fallbackMapel
        });

        if (res && res.success) {
          SecurityManager.showToast(res.message);
          ApiClient.clearCache();
          await AdminApp.loadDashboard();
          await GuestApp.loadLeaderboardData();
        } else {
          SecurityManager.showToast(res?.message || 'Gagal mengimpor file Excel.');
        }
      } catch (err) {
        SecurityManager.showToast('Format file Excel tidak dapat dibaca: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function initLetterTab() {
    const state = AdminApp.getState();
    const sel = document.getElementById('letterClassSelect');
    if (!sel) return;

    const classes = [...new Set((state.siswa || []).map(s => s.kelas))];
    sel.innerHTML = `<option value="ALL">Semua Kelas Ampuan (${classes.join(', ') || '-'})</option>` +
      classes.map(c => `<option value="${GuestApp.escapeHtml(c)}">Kelas ${GuestApp.escapeHtml(c)}</option>`).join('');

    renderLetterStudentList();
    renderSentLetters();
  }

  function renderLetterStudentList() {
    const state = AdminApp.getState();
    const filterCls = document.getElementById('letterClassSelect').value;
    const esc = GuestApp.escapeHtml;

    const list = (state.siswa || []).filter(s => filterCls === 'ALL' || s.kelas === filterCls);
    document.getElementById('table-letter-students').innerHTML = `
      <thead><tr><th style="width:40px;">Pilih</th><th>NIS Saat Ini</th><th>Nama Saat Ini</th><th>Kelas</th><th>Usulan Perbaikan (NIS / Nama Benar)</th></tr></thead>
      <tbody>
        ${list.map(s => `
          <tr>
            <td><input type="checkbox" class="letter-chk" data-nis="${esc(s.nis)}" data-nama="${esc(s.nama)}" data-kelas="${esc(s.kelas)}" /></td>
            <td>${esc(s.nis)}</td>
            <td>${esc(s.nama)}</td>
            <td>${esc(s.kelas)}</td>
            <td><input type="text" class="letter-fix-input" data-nis="${esc(s.nis)}" placeholder="Ketik NIS / Nama yang benar..." style="width:100%; padding:6px 8px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text);" /></td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }

  function toggleSelectAllStudents(checked) {
    document.querySelectorAll('.letter-chk').forEach(cb => { cb.checked = checked; });
  }

  function collectSelectedLetterItems() {
    const items = [];
    document.querySelectorAll('.letter-chk:checked').forEach(cb => {
      const nis = cb.dataset.nis;
      const fixInput = document.querySelector(`.letter-fix-input[data-nis="${CSS.escape(nis)}"]`);
      items.push({
        nis_lama: nis,
        nama_lama: cb.dataset.nama,
        kelas: cb.dataset.kelas,
        usulan_perbaikan: fixInput ? fixInput.value.trim() : ''
      });
    });
    return items;
  }

  async function submitCorrectionLetter() {
    const items = collectSelectedLetterItems();
    const keterangan = document.getElementById('letterReasonInput').value.trim();

    if (items.length === 0) {
      SecurityManager.showToast('Centang minimal 1 siswa yang datanya perlu dikoreksi.');
      return;
    }

    const confirmed = await AdminApp.confirmCard({
      mode: 'add',
      title: 'Kirim Surat Koreksi ke Admin Pertama',
      message: 'Surat permohonan perubahan NIS/Nama siswa akan dikirimkan ke dashboard Admin Pertama.',
      details: `Jumlah Siswa Diajukan: <strong>${items.length} siswa</strong><br/>Keterangan: ${GuestApp.escapeHtml(keterangan || '-')}`
    });

    if (!confirmed) return;

    const res = await ApiClient.adminRequest({
      action: 'send_correction_letter',
      payload: {
        kelas: document.getElementById('letterClassSelect').value,
        items,
        keterangan
      }
    });

    if (res && res.success) {
      SecurityManager.showToast(res.message);
      document.getElementById('letterReasonInput').value = '';
      toggleSelectAllStudents(false);
      await AdminApp.loadDashboard();
    }
  }

  function printDraftLetter() {
    const items = collectSelectedLetterItems();
    if (items.length === 0) {
      SecurityManager.showToast('Pilih minimal 1 siswa terlebih dahulu untuk mencetak surat.');
      return;
    }
    const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
    const keterangan = document.getElementById('letterReasonInput').value.trim();
    const esc = GuestApp.escapeHtml;

    const win = window.open('', '_blank', 'width=800,height=650');
    win.document.write(`
      <html><head><title>Surat Permohonan Koreksi Data Siswa</title>
      <style>body{font-family:Arial,sans-serif;padding:36px;line-height:1.6}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #333;padding:8px;text-align:left}</style>
      </head><body>
      <h2 style="text-align:center;margin-bottom:4px;">SURAT PERMOHONAN KOREKSI DATA SISWA</h2>
      <p style="text-align:center;margin-top:0;">Portal Hasil Penilaian</p><hr/>
      <p><strong>Kepada Yth:</strong> Admin Pertama (Super Admin)<br/>
      <strong>Dari:</strong> ${esc(admin.nama_admin)} (Guru Mapel ${esc(admin.mata_pelajaran)})<br/>
      <strong>Tanggal:</strong> ${new Date().toLocaleDateString('id-ID')}</p>
      <p>Dengan hormat, mohon dilakukan perbaikan data Master Siswa berikut karena ditemukan ketidaksesuaian NIS/Nama:</p>
      <table><thead><tr><th>No</th><th>NIS Lama</th><th>Nama Lama</th><th>Kelas</th><th>Usulan Perbaikan</th></tr></thead>
      <tbody>${items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.nis_lama)}</td><td>${esc(it.nama_lama)}</td><td>${esc(it.kelas)}</td><td>${esc(it.usulan_perbaikan || '-')}</td></tr>`).join('')}</tbody></table>
      <p><strong>Catatan Tambahan:</strong> ${esc(keterangan || '-')}</p>
      <br/><p style="text-align:right;">Hormat saya,<br/><br/><br/><strong>${esc(admin.nama_admin)}</strong></p>
      <script>window.print();</script></body></html>
    `);
    win.document.close();
  }

  function renderSentLetters() {
    const state = AdminApp.getState();
    const esc = GuestApp.escapeHtml;
    const el = document.getElementById('table-surat-sent');
    if (!el) return;

    el.innerHTML = `
      <thead><tr><th>ID Surat</th><th>Tanggal</th><th>Jumlah Siswa</th><th>Keterangan</th><th>Status</th></tr></thead>
      <tbody>
        ${(state.surat || []).map(sr => {
          let count = 0;
          try { count = JSON.parse(sr.daftar_siswa_json || '[]').length; } catch (e) {}
          return `<tr>
            <td>${esc(sr.id_surat)}</td>
            <td>${new Date(sr.tanggal).toLocaleDateString('id-ID')}</td>
            <td>${count} siswa</td>
            <td>${esc(sr.keterangan)}</td>
            <td><strong>${esc(sr.status)}</strong></td>
          </tr>`;
        }).join('')}
      </tbody>
    `;
  }

  return {
    init,
    populateExcelFilters,
    downloadTemplate,
    exportRekapExcel,
    initLetterTab,
    renderLetterStudentList,
    toggleSelectAllStudents,
    submitCorrectionLetter,
    printDraftLetter
  };
})();

document.addEventListener('DOMContentLoaded', () => ExcelLetterManager.init());