// PWA: регистрация service worker и предложение установить приложение.
let deferred = null;
let shownOnce = false;

const ua = navigator.userAgent;
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/i.test(ua);
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.navigator.standalone === true;

export const canInstall = () => !isStandalone();

export function initPWA() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    const btn = document.querySelector('#instAction');
    if (btn) btn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    hideInstall();
  });
  document.querySelector('#instLater').onclick = () => hideInstall();
  document.querySelector('#instAction').onclick = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* пользователь закрыл окно */ }
      deferred = null;
      hideInstall();
    } else {
      // Браузер ещё не готов показать системное окно — показываем ручную инструкцию.
      setMode('manual');
    }
  };
  // При открытии сразу предлагаем установить (если ещё не установлено).
  if (!isStandalone()) setTimeout(() => showInstall(false), 900);
}

function setMode(mode) {
  const m = document.querySelector('#install');
  m.dataset.mode = mode;
}

export function showInstall(force) {
  if (isStandalone()) return;
  if (shownOnce && !force) return;
  shownOnce = true;
  const m = document.querySelector('#install');
  setMode(isIOS ? 'ios' : deferred || isAndroid ? 'android' : 'desktop');
  document.querySelector('#instAction').classList.toggle('hidden', isIOS);
  m.classList.remove('hidden');
}

export function hideInstall() {
  document.querySelector('#install').classList.add('hidden');
}
