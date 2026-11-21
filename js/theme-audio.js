const ThemeAudio = (() => {
  let manualOverride = null;
  let audioCtx = null;

  function init() {
    applyRealtimeTheme();
    setInterval(applyRealtimeTheme, 30000);

    const btn = document.getElementById('btnToggleTheme');
    if (btn) {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        manualOverride = manualOverride === null ? (current === 'dark' ? 'light' : 'dark') : null;
        applyRealtimeTheme();
      });
    }
  }

  function applyRealtimeTheme() {
    const now = new Date();
    const hour = now.getHours();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const autoMode = (hour >= 6 && hour < 18) ? 'light' : 'dark';
    const activeTheme = manualOverride || autoMode;

    document.documentElement.setAttribute('data-theme', activeTheme);
    const iconEl = document.getElementById('themeIcon');
    const textEl = document.getElementById('themeText');
    const clockEl = document.getElementById('realtimeClockLabel');

    if (iconEl) iconEl.textContent = activeTheme === 'dark' ? '🌙' : '☀️';
    if (textEl) textEl.textContent = manualOverride ? `${activeTheme.toUpperCase()} (Manual)` : `Auto (${activeTheme})`;
    if (clockEl) clockEl.textContent = `Waktu Realtime: ${timeStr} WIB`;
  }

  function playTone(freqs, durations, type = 'sine') {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      let startTime = audioCtx.currentTime;
      freqs.forEach((f, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f, startTime);
        gain.gain.setValueAtTime(0.14, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + durations[idx]);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + durations[idx]);
        startTime += durations[idx] * 0.85;
      });
    } catch (e) {}
  }

  return {
    init,
    playSuccess() { playTone([523.25, 659.25, 783.99, 1046.5], [0.14, 0.14, 0.14, 0.35], 'triangle'); },
    playRemedial() { playTone([329.63, 261.63], [0.25, 0.45], 'sawtooth'); },
    playWarningBeep() { playTone([880, 880], [0.12, 0.12], 'sine'); }
  };
})();

document.addEventListener('DOMContentLoaded', () => ThemeAudio.init());