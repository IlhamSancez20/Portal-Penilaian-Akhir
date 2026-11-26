const ExcelLetterManager = (() => {
  function init() {
    const uploadInp = document.getElementById('excelUploadInput');
    if (uploadInp) {
      uploadInp.addEventListener('change', handleExcelUpload);
    }
  }

  function populateExcelFilters() {
    const state = AdminApp.getState();
    const esc = GuestApp.escapeHtml;
    const subjects = AdminApp.getTeacherSubjects();

    const mapelSel = document.getElementById('excelMapelFilter');
    const jenisInp = document.getElementById('excelJenisUjianInput');
    const datalistEl = document.getElementById('examTypesDatalist');
    const classSel = document.getElementById('excelClassFilter');

    if (mapelSel) {
      const prevMapel = mapelSel.value;
      mapelSel.innerHTML = subjects.length > 0
        ? subjects.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')
        : `<option value="">-- Belum Ada Mata Pelajaran --</option>`;

      if (subjects.includes(prevMapel)) {
        mapelSel.value = prevMapel;
      }

      const syncExamTypeForSelectedSubject = () => {
        const chosenMapel = mapelSel.value;
        const matchingConfigs = (state.mapel || []).filter(m => String(m.nama_mapel).trim() === chosenMapel);

        if (datalistEl && matchingConfigs.length > 0) {
          const examNames = [...new Set(matchingConfigs.map(m => String(m.jenis_ujian || '').trim()).filter(Boolean))];
          datalistEl.innerHTML = examNames.map(ex => `<option value="${esc(ex)}"></option>`).join('');
        }

        if (jenisInp && matchingConfigs.length > 0 && matchingConfigs[0].jenis_ujian) {
          jenisInp.value = matchingConfigs[0].jenis_ujian;
        }
      };

      if (!mapelSel.dataset.boundSync) {
        mapelSel.addEventListener('change', syncExamTypeForSelectedSubject);
        mapelSel.dataset.boundSync = '1';
      }
      syncExamTypeForSelectedSubject();
    }

    if (classSel) {
      const uniqueClasses = [...new Set((state.siswa || []).map(s => String(s.kelas).trim()).filter(Boolean))].sort();
      const prevClass = classSel.value;
      classSel.innerHTML = `<option value="ALL">Semua Kelas (${uniqueClasses.length} Kelas)</option>` +
        uniqueClasses.map(c => `<option value="${esc(c)}">Kelas ${esc(c)}</option>`).join('');
      if (uniqueClasses.includes(prevClass)) {
        classSel.value = prevClass;
      }
    }
  }

  function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
      SecurityManager.showToast('Library Excel belum siap. Muat ulang halaman.');
      return;
    }

    const state = AdminApp.getState();
    const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
    const selectedMapel = document.getElementById('excelMapelFilter')?.value || '';
    const selectedJenis = document.getElementById('excelJenisUjianInput')?.value.trim() || 'Ulangan Akhir Semester';
    const selectedMode = document.getElementById('excelModeFilter')?.value || 'kelompok';
    const selectedClass = document.getElementById('excelClassFilter')?.value || 'ALL';

    if (!selectedMapel) {
      SecurityManager.showToast('Pilih Mata Pelajaran terlebih dahulu sebelum mengunduh template.');
      return;
    }

    const students = (state.siswa || []).filter(s => selectedClass === 'ALL' || String(s.kelas).trim() === selectedClass);
    if (students.length === 0) {
      SecurityManager.showToast('Belum ada data siswa pada kelas yang dipilih.');
      return;
    }

    const rows = students.map(s => ({
      NIS: String(s.nis).trim(),
      Nama_Siswa: String(s.nama).trim(),
      Kelas: String(s.kelas).trim(),
      Mata_Pelajaran: selectedMapel,
      Jenis_Ujian: selectedJenis,
      Guru_Mapel: String(admin.nama_admin || '').trim(),
      Kelompok: selectedMode === 'kelompok' ? String(s.kelompok || '').trim() : '',
      Nilai_1: '',
      Nilai_2: '',
      Nilai_3: '',
      Nilai_Tambah: 0,
      Nilai_Akhir: ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 28 },
      { wch: 26 }, { wch: 26 }, { wch: 16 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 13 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Nilai');

    const safeMapel = selectedMapel.replace(/[^a-zA-Z0-9]+/g, '_');
    const safeJenis = selectedJenis.replace(/[^a-zA-Z0-9]+/g, '_');
    const safeClass = selectedClass === 'ALL' ? 'Semua_Kelas' : selectedClass.replace(/[^a-zA-Z0-9]+/g, '_');
    XLSX.writeFile(wb, `Template_${safeMapel}_${safeJenis}_${safeClass}.xlsx`);
    SecurityManager.showToast(`Template Excel ${selectedMapel} (${selectedJenis}) berhasil diunduh.`);
  }

  async function handleExcelUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (typeof XLSX === 'undefined') {
      SecurityManager.showToast('Library Excel belum siap.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        if (!rows || rows.length === 0) {
          SecurityManager.showToast('File Excel kosong atau tidak memiliki baris data.');
          return;
        }

        const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
        const fallbackMapel = document.getElementById('excelMapelFilter')?.value || '';
        const fallbackJenis = document.getElementById('excelJenisUjianInput')?.value.trim() || 'Ulangan Akhir Semester';
        const fallbackGuru = String(admin.nama_admin || '').trim();

        const previewMapel = String(rows[0].Mata_Pelajaran || rows[0].mata_pelajaran || fallbackMapel).trim();
        const previewJenis = String(rows[0].Jenis_Ujian || rows[0].jenis_ujian || fallbackJenis).trim();

        const ok = await AdminApp.confirmCard({
          mode: 'add',
          title: 'Konfirmasi Unggah File Nilai Excel',
          message: 'Sistem akan memproses nilai sesuai Mata Pelajaran, Jenis Ujian, dan NIS siswa pada file Excel.',
          details: `
            <strong>Nama File</strong>: ${GuestApp.escapeHtml(file.name)}<br/>
            <strong>Jumlah Baris</strong>: ${rows.length} siswa<br/>
            <strong>Mata Pelajaran</strong>: ${GuestApp.escapeHtml(previewMapel || '-')}<br/>
            <strong>Jenis Ujian</strong>: ${GuestApp.escapeHtml(previewJenis || '-')}
          `
        });
        if (!ok) return;

        const res = await ApiClient.adminRequest({
          action: 'bulk_upload_nilai',
          rows,
          fallback_mapel: fallbackMapel,
          fallback_jenis: fallbackJenis,
          fallback_guru: fallbackGuru
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
        SecurityManager.showToast('Format file Excel tidak valid: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function exportRekapExcel() {
    if (typeof XLSX === 'undefined') {
      SecurityManager.showToast('Library Excel belum siap.');
      return;
    }

    const state = AdminApp.getState();
    const siswaMap = {};
    (state.siswa || []).forEach(s => { siswaMap[String(s.nis).trim()] = s; });

    const rows = (state.nilai || []).map(n => {
      const s = siswaMap[String(n.nis).trim()] || {};
      return {
        NIS: n.nis,
        Nama_Siswa: s.nama || '-',
        Kelas: s.kelas || '-',
        Mata_Pelajaran: n.mata_pelajaran,
        Jenis_Ujian: n.jenis_ujian || 'Ulangan Akhir Semester',
        Guru_Mapel: n.guru_mapel || '-',
        Kategori: n.kelompok ? `Kelompok (${n.kelompok})` : 'Individual',
        Nilai_1: n.nilai_1,
        Nilai_2: n.nilai_2,
        Nilai_3: n.nilai_3,
        Nilai_Tambah: n.nilai_tambah || 0,
        Nilai_Akhir: n.nilai_akhir,
        Status: n.status
      };
    });

    if (rows.length === 0) {
      SecurityManager.showToast('Belum ada data nilai untuk diekspor.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Nilai');
    XLSX.writeFile(wb, `Rekap_Nilai_${new Date().toISOString().slice(0, 10)}.xlsx`);
    SecurityManager.showToast('Rekap nilai berhasil diekspor ke Excel.');
  }

  /* ==================== SURAT KOREKSI DATA SISWA ==================== */

  function initLetterTab() {
    const state = AdminApp.getState();
    const esc = GuestApp.escapeHtml;
    const classSel = document.getElementById('letterClassSelect');
    if (classSel) {
      const classes = [...new Set((state.siswa || []).map(s => String(s.kelas).trim()).filter(Boolean))].sort();
      classSel.innerHTML = `<option value="ALL">Semua Kelas Ampuan</option>` +
        classes.map(c => `<option value="${esc(c)}">Kelas ${esc(c)}</option>`).join('');
    }
    renderLetterStudentList();
    renderSentLetters();
  }

  function renderLetterStudentList() {
    const state = AdminApp.getState();
    const esc = GuestApp.escapeHtml;
    const selectedClass = document.getElementById('letterClassSelect')?.value || 'ALL';
    const students = (state.siswa || []).filter(s => selectedClass === 'ALL' || String(s.kelas).trim() === selectedClass);

    const tbl = document.getElementById('table-letter-students');
    if (!tbl) return;

    tbl.innerHTML = `
      <thead><tr><th style="width:42px;">Pilih</th><th>NIS</th><th>Nama Lengkap</th><th>Kelas</th><th>Usulan Perbaikan NIS / Nama</th></tr></thead>
      <tbody>
        ${students.map(s => `
          <tr>
            <td><input type="checkbox" class="letter-student-chk" data-nis="${esc(s.nis)}" data-nama="${esc(s.nama)}" data-kelas="${esc(s.kelas)}" /></td>
            <td>${esc(s.nis)}</td>
            <td>${esc(s.nama)}</td>
            <td>${esc(s.kelas)}</td>
            <td><input type="text" class="letter-fix-input" data-nis="${esc(s.nis)}" placeholder="Contoh: Nama seharusnya Budi Santoso" style="width:100%; padding:6px 8px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text);" /></td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }

  function toggleSelectAllStudents(checked) {
    document.querySelectorAll('.letter-student-chk').forEach(chk => { chk.checked = checked; });
  }

  async function submitCorrectionLetter() {
    const checked = Array.from(document.querySelectorAll('.letter-student-chk:checked'));
    if (checked.length === 0) {
      SecurityManager.showToast('Centang minimal 1 siswa yang datanya perlu dikoreksi.');
      return;
    }

    const items = checked.map(chk => {
      const nis = chk.dataset.nis;
      const fixInput = document.querySelector(`.letter-fix-input[data-nis="${CSS.escape(nis)}"]`);
      return {
        nis_lama: nis,
        nama_lama: chk.dataset.nama,
        kelas: chk.dataset.kelas,
        usulan_perbaikan: (fixInput?.value || '').trim()
      };
    });

    const keterangan = (document.getElementById('letterReasonInput')?.value || '').trim();
    const kelas = document.getElementById('letterClassSelect')?.value || 'ALL';

    const res = await ApiClient.adminRequest({
      action: 'send_correction_letter',
      payload: { kelas, items, keterangan }
    });

    if (res && res.success) {
      SecurityManager.showToast(res.message);
      document.getElementById('letterReasonInput').value = '';
      toggleSelectAllStudents(false);
      await AdminApp.loadDashboard();
    } else {
      SecurityManager.showToast(res?.message || 'Gagal mengirim surat koreksi.');
    }
  }

  function renderSentLetters() {
    const state = AdminApp.getState();
    const esc = GuestApp.escapeHtml;
    const tbl = document.getElementById('table-surat-sent');
    if (!tbl) return;

    tbl.innerHTML = `
      <thead><tr><th>ID Surat</th><th>Tanggal</th><th>Rincian Koreksi</th><th>Catatan</th><th>Status</th></tr></thead>
      <tbody>
        ${(state.surat || []).map(sr => {
          let items = [];
          try { items = JSON.parse(sr.daftar_siswa_json || '[]'); } catch (e) {}
          const summary = items.map(it => `${esc(it.nis_lama)} (${esc(it.nama_lama)}) ➔ ${esc(it.usulan_perbaikan || '-')}`).join('<br/>');
          return `<tr>
            <td>${esc(sr.id_surat)}</td>
            <td>${new Date(sr.tanggal).toLocaleDateString('id-ID')}</td>
            <td>${summary}</td>
            <td>${esc(sr.keterangan || '-')}</td>
            <td><strong>${esc(sr.status)}</strong></td>
          </tr>`;
        }).join('')}
      </tbody>
    `;
  }

  function printDraftLetter() {
    window.print();
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