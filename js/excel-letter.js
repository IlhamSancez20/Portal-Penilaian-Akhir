const ExcelLetterManager = (() => {
  function init() {
    const fileInput = document.getElementById('excelUploadInput');
    if (fileInput) {
      fileInput.addEventListener('change', handleExcelUpload);
    }
  }

  function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
      SecurityManager.showToast('Library Excel belum siap, coba beberapa detik lagi.');
      return;
    }

    const state = AdminApp.getState();
    const admin = JSON.parse(sessionStorage.getItem('PHP_ADMIN_USER') || '{}');
    const students = state.siswa || [];

    if (students.length === 0) {
      SecurityManager.showToast('Belum ada data siswa pada kelas yang Anda ampu.');
      return;
    }

    const existingMap = {};
    (state.nilai || []).forEach(n => {
      existingMap[String(n.nis).trim()] = n;
    });

    const rows = students.map(s => {
      const ex = existingMap[String(s.nis).trim()] || {};
      return {
        NIS: s.nis,
        Nama_Siswa: s.nama,
        Kelas: s.kelas,
        Mata_Pelajaran: admin.mata_pelajaran || ex.mata_pelajaran || '',
        Nilai_1: ex.nilai_1 ?? '',
        Nilai_2: ex.nilai_2 ?? '',
        Nilai_3: ex.nilai_3 ?? '',
        Nilai_Tambah: ex.nilai_tambah ?? 0,
        Nilai_Akhir_Manual: ex.nilai_akhir ?? ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 15 },
      { wch: 28 },
      { wch: 12 },
      { wch: 24 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Nilai');

    const safeMapel = (admin.mata_pelajaran || 'Mapel').replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(wb, `Template_Nilai_${safeMapel}.xlsx`);
    SecurityManager.showToast(`Template Excel berhasil diunduh (${students.length} siswa — siap diisi & diedit).`);
  }

  async function handleExcelUpload(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const jsonRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

        if (jsonRows.length === 0) {
          SecurityManager.showToast('File Excel kosong.');
          return;
        }

        const validRows = jsonRows.filter(r => {
          const nis = String(r.NIS || r.nis || '').trim();
          if (!nis) return false;
          return r.Nilai_1 !== '' || r.Nilai_2 !== '' || r.Nilai_3 !== '' || r.Nilai_Akhir_Manual !== '';
        });

        const emptySkipped = jsonRows.length - validRows.length;

        const confirmed = await AdminApp.confirmCard({
          mode: 'edit',
          title: 'Konfirmasi Impor / Pembaruan Nilai dari Excel',
          message: 'Seluruh baris nilai yang terisi pada file Excel ini akan disimpan dan memperbarui data nilai siswa.',
          details: `Nama File: <strong>${GuestApp.escapeHtml(file.name)}</strong><br/>Baris Nilai Diproses: <strong>${validRows.length} siswa</strong>${emptySkipped > 0 ? `<br/>Baris Kosong Dilewati: <strong>${emptySkipped} baris</strong>` : ''}`
        });

        if (!confirmed) return;
        if (validRows.length === 0) {
          SecurityManager.showToast('Tidak ada kolom nilai yang terisi pada file Excel.');
          return;
        }

        const res = await ApiClient.adminRequest({
          action: 'bulk_upload_nilai',
          rows: validRows
        });

        if (res && res.success) {
          SecurityManager.showToast(res.message);
          ApiClient.clearCache();
          await AdminApp.loadDashboard();
        } else {
          SecurityManager.showToast(res?.message || 'Gagal mengimpor file Excel.');
        }
      } catch (err) {
        SecurityManager.showToast('Format file Excel tidak dapat dibaca.');
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
    downloadTemplate,
    initLetterTab,
    renderLetterStudentList,
    toggleSelectAllStudents,
    submitCorrectionLetter,
    printDraftLetter
  };
})();

document.addEventListener('DOMContentLoaded', () => ExcelLetterManager.init());