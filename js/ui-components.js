const UIComponents = (() => {

  function attachSearchCombo({
    searchInputId,
    hiddenInputId,
    dropdownId,
    items = [],
    initialValue = '',
    initialLabel = '',
    allowCustom = false,
    allowEmpty = false,
    emptyText = 'Tidak ditemukan dalam daftar'
  }) {
    const searchEl = document.getElementById(searchInputId);
    const hiddenEl = document.getElementById(hiddenInputId);
    const dropEl = document.getElementById(dropdownId);
    if (!searchEl || !hiddenEl || !dropEl) return;

    searchEl.value = initialLabel || initialValue || '';
    hiddenEl.value = initialValue || '';

    function renderList(keyword = '') {
      const q = keyword.trim().toLowerCase();
      const filtered = items.filter(it =>
        String(it.label).toLowerCase().includes(q) ||
        String(it.value).toLowerCase().includes(q)
      );

      let html = '';
      if (allowEmpty) {
        html += `<div class="combo-item muted" data-val="" data-lbl="">— Kosongkan / Tanpa Pilihan —</div>`;
      }

      if (filtered.length === 0) {
        html += `<div class="combo-item muted">${allowCustom ? 'Tekan lanjut untuk memakai teks ketikan Anda' : emptyText}</div>`;
      } else {
        html += filtered.slice(0, 30).map(it => `
          <div class="combo-item" data-val="${GuestApp.escapeHtml(it.value)}" data-lbl="${GuestApp.escapeHtml(it.label)}">
            ${GuestApp.escapeHtml(it.label)}
          </div>
        `).join('');
      }

      dropEl.innerHTML = html;
      dropEl.classList.remove('hidden');

      dropEl.querySelectorAll('.combo-item[data-val]').forEach(row => {
        row.addEventListener('mousedown', e => {
          e.preventDefault();
          hiddenEl.value = row.dataset.val;
          searchEl.value = row.dataset.lbl;
          dropEl.classList.add('hidden');
        });
      });
    }

    searchEl.addEventListener('focus', () => renderList(searchEl.value));
    searchEl.addEventListener('input', () => {
      if (allowCustom) {
        hiddenEl.value = searchEl.value.trim();
      } else if (allowEmpty && searchEl.value.trim() === '') {
        hiddenEl.value = '';
      } else {
        const exact = items.find(it =>
          String(it.label).toLowerCase() === searchEl.value.trim().toLowerCase() ||
          String(it.value).toLowerCase() === searchEl.value.trim().toLowerCase()
        );
        hiddenEl.value = exact ? exact.value : '';
      }
      renderList(searchEl.value);
    });

    searchEl.addEventListener('blur', () => {
      setTimeout(() => dropEl.classList.add('hidden'), 150);
    });
  }

  return { attachSearchCombo };
})();