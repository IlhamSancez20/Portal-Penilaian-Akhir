const ThemeAudio = (() => {
  let manualOverride = null;
  let audioCtx = null;

  function init() {
    applyRealtimeTheme();
    updateClock();
    setInterval(() => {
      updateClock();
      if (!manualOverride) applyRealtimeTheme();
    }, 1000);

    const btn = document.getElementById('btnToggleTheme');
    if (btn) {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        manualOverride = current === 'dark' ? 'light' : 'dark';
        setTheme(manualOverride, true);
      });
    }
  }

  function applyRealtimeTheme() {
    const hour = new Date().getHours();
    const isNight = hour >= 18 || hour < 6;
    setTheme(isNight ? 'dark' : 'light', false);
  }

  function setTheme(mode, isManual) {
    document.documentElement.setAttribute('data-theme', mode);
    const icon = document.getElementById('themeIcon');
    const txt = document.getElementById('themeText');
    if (icon) icon.textContent = mode === 'dark' ? '🌙' : '☀️';
    if (txt) txt.textContent = isManual ? (mode === 'dark' ? 'Gelap' : 'Terang') : 'Auto';
  }

  function updateClock() {
    const el = document.getElementById('realtimeClockLabel');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString('id-ID', {
      weekday: 'long', day: '2-digit', month: 'short', year: 'numeric'
    }) + ' • ' + now.toLocaleTimeString('id-ID');
  }

  function playTone(freqs, durations, type = 'sine') {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      let start = audioCtx.currentTime;
      freqs.forEach((f, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f, start);
        gain.gain.setValueAtTime(0.08, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + durations[idx]);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + durations[idx]);
        start += durations[idx] * 0.85;
      });
    } catch (e) {}
  }

  function playSuccess() { playTone([523.25, 659.25, 783.99], [0.14, 0.14, 0.28], 'triangle'); }
  function playRemedial() { playTone([392.00, 329.63], [0.18, 0.3], 'sine'); }
  function playWarning() { playTone([660, 660], [0.12, 0.16], 'square'); }

  return { init, playSuccess, playRemedial, playWarning };
})();

document.addEventListener('DOMContentLoaded', () => ThemeAudio.init());