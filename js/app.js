// ============================================
// OpenAlex Research Manager — App Entry Point
// ============================================

import { db } from './db.js';

/**
 * Apply theme to the document.
 * @param {'light'|'dark'|'system'} mode
 */
function applyTheme(mode) {
  const html = document.documentElement;

  if (mode === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else if (mode === 'light') {
    html.setAttribute('data-theme', 'light');
  } else {
    // 'system' — follow OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
}

/**
 * Initialize theme from stored settings (default: 'system').
 */
async function initTheme() {
  try {
    const setting = await db.settings.get('theme');
    const mode = setting ? setting.value : 'system';
    applyTheme(mode);
  } catch {
    // DB not ready yet, fall back to system
    applyTheme('system');
  }
}

/**
 * Listen for OS theme preference changes.
 */
function watchSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', async () => {
    try {
      const setting = await db.settings.get('theme');
      const mode = setting ? setting.value : 'system';
      if (mode === 'system') {
        applyTheme('system');
      }
    } catch {
      applyTheme('system');
    }
  });
}

/**
 * Set up tab switching logic.
 */
function initTabs() {
  const tabButtons = document.querySelectorAll('[data-bs-toggle="oar-tab"]');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      // Deactivate all tabs and panels
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      // Activate clicked tab and corresponding panel
      btn.classList.add('active');
      const panel = document.getElementById(targetId);
      if (panel) {
        panel.classList.add('active');
      }
    });
  });
}

/**
 * Register the service worker.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('[SW] Registered:', reg.scope);
    }).catch(err => {
      console.warn('[SW] Registration failed:', err);
    });
  }
}

/**
 * Main initialization — runs on DOMContentLoaded.
 */
async function init() {
  // Prevent flash of unstyled theme
  document.documentElement.classList.add('no-transition');

  // Initialize theme
  await initTheme();
  watchSystemTheme();

  // Set up tabs
  initTabs();

  // Register service worker
  registerServiceWorker();

  // Re-enable transitions after a tick
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-transition');
    });
  });

  console.log('[App] OpenAlex Research Manager initialized');
}

document.addEventListener('DOMContentLoaded', init);

// Export for use by other modules
export { applyTheme, initTheme };
