// ============================================
// UI rendering — Search tab
// ============================================

import { addWork, isWorkSaved, getSetting } from './db.js';
import { searchWorks } from './api.js';

// ---------- Search state ----------
let searchResults = [];

// ---------- DOM refs ----------
function $(id) { return document.getElementById(id); }

// ---------- performSearch ----------

async function performSearch() {
  const query = $('search-input').value.trim();
  if (!query) return;

  const mode = $('search-mode').value;
  const scope = $('search-scope').value;
  const sort = $('search-sort').value;
  const limit = parseInt($('search-limit').value, 10);

  // Show loading state
  const statusEl = $('search-status');
  statusEl.innerHTML = '<span class="oar-spinner me-2"></span>Searching...';
  $('search-results').innerHTML = '';
  $('search-batch').classList.add('d-none');
  $('search-select-all').checked = false;

  // Disable search button during request
  $('search-btn').disabled = true;

  try {
    // Get settings for API key and email
    const [apiKey, email] = await Promise.all([
      getSetting('apiKey'),
      getSetting('email'),
    ]);

    const response = await searchWorks({ query, mode, scope, sort, limit, apiKey, email });

    if (!response || !response.results.length) {
      statusEl.textContent = 'No results found.';
      searchResults = [];
      return;
    }

    searchResults = response.results;

    // Check which works are already saved
    const savedPromises = searchResults.map(w => isWorkSaved(w.openalexId));
    const savedBooleans = await Promise.all(savedPromises);
    const savedSet = new Set();
    savedBooleans.forEach((saved, i) => {
      if (saved) savedSet.add(searchResults[i].openalexId);
    });

    // Render
    renderSearchResults(searchResults, savedSet);

    // Status
    const total = response.meta?.count ?? searchResults.length;
    statusEl.textContent = `Found ${total.toLocaleString()} results — showing ${searchResults.length}`;

    // Show batch controls
    $('search-batch').classList.remove('d-none');
  } catch (err) {
    console.error('performSearch error:', err);
    statusEl.textContent = 'Search failed. Please try again.';
  } finally {
    $('search-btn').disabled = false;
  }
}

// ---------- renderSearchResults ----------

function renderSearchResults(results, savedSet) {
  const container = $('search-results');
  container.innerHTML = '';

  results.forEach(work => {
    const isSaved = savedSet.has(work.openalexId);
    const card = buildResultCard(work, isSaved);
    container.insertAdjacentHTML('beforeend', card);
  });

  // Attach event listeners to save buttons
  container.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.oar-card');
      const workDict = JSON.parse(card.dataset.workJson);
      await handleSaveWork(workDict, btn);
    });
  });

  // Attach checkbox listeners for individual cards
  container.querySelectorAll('.search-result-check').forEach(cb => {
    cb.addEventListener('change', () => {
      // If unchecking any individual, uncheck select-all
      const allChecks = container.querySelectorAll('.search-result-check');
      const allChecked = [...allChecks].every(c => c.checked);
      $('search-select-all').checked = allChecked;
    });
  });
}

// ---------- buildResultCard ----------

function buildResultCard(work, isSaved) {
  const authors = formatAuthors(work.authors);
  const keywordsHtml = formatKeywords(work.keywords);
  const abstractHtml = work.abstract
    ? `<div class="oar-card-abstract mt-1">${escapeHtml(work.abstract.substring(0, 300))}${work.abstract.length > 300 ? '...' : ''}</div>`
    : '';

  const journalHtml = work.journal
    ? `<div class="oar-card-meta"><i class="bi bi-journal-text me-1"></i>${escapeHtml(work.journal)}</div>`
    : '';

  const doiHtml = work.doi
    ? `<a href="https://doi.org/${escapeHtml(work.doi)}" target="_blank" class="small text-oar-muted text-decoration-none"><i class="bi bi-box-arrow-up-right"></i> DOI</a>`
    : '';

  const openalexUrl = work.openalexId
    ? `https://openalex.org/${encodeURIComponent(work.openalexId)}`
    : '#';

  const scoreHtml = work.relevance_score
    ? ` · <span>Score: ${work.relevance_score}</span>`
    : '';

  const typeHtml = work.type
    ? ` · <span class="text-capitalize">${escapeHtml(work.type)}</span>`
    : '';

  const saveBtnHtml = isSaved
    ? `<button class="btn btn-sm btn-success save-btn" disabled title="Already saved"><i class="bi bi-check-lg"></i></button>`
    : `<button class="btn btn-sm btn-oar-primary save-btn" title="Save to library"><i class="bi bi-bookmark-plus"></i></button>`;

  return `
    <div class="oar-card" data-openalex-id="${escapeHtml(work.openalexId)}" data-work-json="${escapeAttr(JSON.stringify(work))}">
      <div class="d-flex gap-3">
        <!-- Checkbox for batch -->
        <div class="form-check pt-1">
          <input type="checkbox" class="form-check-input search-result-check" ${isSaved ? 'disabled' : ''}>
        </div>

        <!-- Content -->
        <div class="flex-grow-1">
          <div class="oar-card-title">
            <a href="${openalexUrl}" target="_blank" class="text-decoration-none">${escapeHtml(work.title)}</a>
          </div>
          <div class="oar-card-meta">
            <span>${work.publication_year ?? '—'}</span> · <span>${work.cited_by_count.toLocaleString()} citations</span>${scoreHtml}${typeHtml}
          </div>
          ${authors ? `<div class="oar-card-meta">${authors}</div>` : ''}
          ${journalHtml}
          ${keywordsHtml}
          ${abstractHtml}
          <div class="mt-1 d-flex gap-2">
            ${doiHtml}
          </div>
        </div>

        <!-- Save button -->
        <div class="d-flex align-items-start">
          ${saveBtnHtml}
        </div>
      </div>
    </div>
  `;
}

// ---------- handleSaveWork ----------

async function handleSaveWork(workDict, btnElement) {
  try {
    btnElement.disabled = true;
    btnElement.innerHTML = '<span class="oar-spinner me-1"></span>';
    btnElement.classList.remove('btn-oar-primary');
    btnElement.classList.add('btn-oar-outline');

    await addWork(workDict);

    // Update button to saved state
    btnElement.innerHTML = '<i class="bi bi-check-lg"></i>';
    btnElement.classList.remove('btn-oar-outline');
    btnElement.classList.add('btn-success');
    btnElement.title = 'Already saved';

    // Disable the checkbox for this card
    const card = btnElement.closest('.oar-card');
    const checkbox = card.querySelector('.search-result-check');
    if (checkbox) {
      checkbox.disabled = true;
      checkbox.checked = false;
    }
  } catch (err) {
    console.error('handleSaveWork error:', err);
    btnElement.disabled = false;
    btnElement.innerHTML = '<i class="bi bi-bookmark-plus"></i>';
    btnElement.classList.remove('btn-oar-outline', 'btn-success');
    btnElement.classList.add('btn-oar-primary');
  }
}

// ---------- handleSaveSelected ----------

async function handleSaveSelected() {
  const container = $('search-results');
  const checkedCards = container.querySelectorAll('.search-result-check:checked');

  if (!checkedCards.length) return;

  const saveBtn = $('search-save-selected');
  const originalHtml = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="oar-spinner me-1"></span>Saving...';

  let savedCount = 0;

  for (const cb of checkedCards) {
    const card = cb.closest('.oar-card');
    const workDict = JSON.parse(card.dataset.workJson);
    const saveBtnEl = card.querySelector('.save-btn');

    try {
      await addWork(workDict);

      // Update individual save button
      saveBtnEl.disabled = true;
      saveBtnEl.innerHTML = '<i class="bi bi-check-lg"></i>';
      saveBtnEl.classList.remove('btn-oar-primary');
      saveBtnEl.classList.add('btn-success');
      saveBtnEl.title = 'Already saved';

      // Disable checkbox
      cb.checked = false;
      cb.disabled = true;

      savedCount++;
    } catch (err) {
      console.error('handleSaveSelected error for work:', workDict.openalexId, err);
    }
  }

  // Uncheck select-all
  $('search-select-all').checked = false;

  // Restore batch save button
  saveBtn.disabled = false;
  saveBtn.innerHTML = originalHtml;

  // Update status
  const statusEl = $('search-status');
  const prev = statusEl.textContent;
  statusEl.textContent = `Saved ${savedCount} work${savedCount !== 1 ? 's' : ''} to library.`;
  setTimeout(() => { statusEl.textContent = prev; }, 3000);
}

// ---------- toggleSemanticControls ----------

function toggleSemanticControls(mode) {
  const scopeSelect = $('search-scope');
  const sortSelect = $('search-sort');
  const scopeCol = $('scope-col');
  const sortCol = $('sort-col');

  if (mode === 'semantic') {
    scopeSelect.disabled = true;
    sortSelect.disabled = true;
    scopeCol.style.opacity = '0.5';
    sortCol.style.opacity = '0.5';
  } else {
    scopeSelect.disabled = false;
    sortSelect.disabled = false;
    scopeCol.style.opacity = '1';
    sortCol.style.opacity = '1';
  }
}

// ---------- Helpers ----------

function formatAuthors(authors) {
  if (!authors || !authors.length) return '';
  const maxAuthors = 3;
  const names = authors.slice(0, maxAuthors).map(a => a.name).filter(Boolean);
  let result = names.join(', ');
  if (authors.length > maxAuthors) {
    result += ' et al.';
  }
  return escapeHtml(result);
}

function formatKeywords(keywords) {
  if (!keywords || !keywords.length) return '';
  const maxKeywords = 6;
  const chips = keywords
    .slice(0, maxKeywords)
    .map(kw => `<span class="oar-chip oar-chip-keyword">${escapeHtml(kw)}</span>`)
    .join('');
  return `<div class="mt-1">${chips}</div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------- Exports ----------

export {
  performSearch,
  renderSearchResults,
  handleSaveWork,
  handleSaveSelected,
  toggleSemanticControls,
};
