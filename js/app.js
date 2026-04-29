// ============================================
// OpenAlex Research Manager — App Entry Point
// ============================================

import { db } from './db.js';
import {
  performSearch,
  handleSaveSelected,
  toggleSemanticControls,
  loadLibrary,
  handleFetchAllBibtex,
  handleExportBibtex,
  updateExportButton,
  initEditDialog,
  openEditDialog,
  saveEditDialog,
  openRelatedDialog,
} from './ui.js';

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

      // Load library when switching to library tab
      if (targetId === 'tab-library') {
        loadLibrary();
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
 * Set up search tab event bindings.
 */
function initSearch() {
  // Search button click
  document.getElementById('search-btn')?.addEventListener('click', performSearch);

  // Enter key on search input
  document.getElementById('search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch();
    }
  });

  // Mode dropdown → toggle semantic controls
  document.getElementById('search-mode')?.addEventListener('change', (e) => {
    toggleSemanticControls(e.target.value);
  });

  // Select-all checkbox → toggle all result checkboxes
  document.getElementById('search-select-all')?.addEventListener('change', (e) => {
    const checks = document.querySelectorAll('.search-result-check');
    checks.forEach(cb => {
      if (!cb.disabled) {
        cb.checked = e.target.checked;
      }
    });
  });

  // Save selected button
  document.getElementById('search-save-selected')?.addEventListener('click', handleSaveSelected);
}

/**
 * Set up library tab event bindings.
 */
function initLibrary() {
  // Debounce helper
  let debounceTimer;
  function debounce(fn, ms) {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), ms);
    };
  }

  // Filter text → debounced loadLibrary
  document.getElementById('lib-filter-text')?.addEventListener('input', debounce(() => {
    loadLibrary();
  }, 300));

  // Keyword dropdown
  document.getElementById('lib-filter-keyword')?.addEventListener('change', () => loadLibrary());

  // Tag dropdown
  document.getElementById('lib-filter-tag')?.addEventListener('change', () => loadLibrary());

  // Sort dropdown
  document.getElementById('lib-sort')?.addEventListener('change', () => loadLibrary());

  // Refresh button
  document.getElementById('lib-refresh-btn')?.addEventListener('click', () => loadLibrary());

  // Select-all checkbox
  document.getElementById('lib-select-all')?.addEventListener('change', (e) => {
    const checks = document.querySelectorAll('.lib-check');
    checks.forEach(cb => { cb.checked = e.target.checked; });
    updateExportButton();
  });

  // Export selected BibTeX
  document.getElementById('lib-export-selected')?.addEventListener('click', () => {
    const checked = document.querySelectorAll('.lib-check:checked');
    const ids = [...checked].map(cb => parseInt(cb.closest('.oar-card').dataset.workId, 10));
    if (ids.length) handleExportBibtex(ids);
  });

  // Fetch all BibTeX
  document.getElementById('lib-fetch-all-bibtex')?.addEventListener('click', handleFetchAllBibtex);

  // Edit dialog — save button
  document.getElementById('edit-save-btn')?.addEventListener('click', saveEditDialog);
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

  // Set up search tab
  initSearch();

  // Set up library tab
  initLibrary();

  // Initialize edit dialog event listeners
  initEditDialog();

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
