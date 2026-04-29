// ============================================
// UI rendering — Search tab
// ============================================

import { addWork, isWorkSaved, getSetting, listWorks, getAllKeywords, getAllTags, removeWork, exportBibtex } from './db.js';
import { searchWorks, fetchBibtex, fetchRelatedWorks } from './api.js';

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

// ============================================
// UI rendering — Library tab
// ============================================

// ---- Library State ----
let libraryWorks = [];

// ---- loadLibrary ----

async function loadLibrary() {
  const search = $('lib-filter-text').value.trim();
  const keyword = $('lib-filter-keyword').value;
  const tag = $('lib-filter-tag').value;
  const sortBy = $('lib-sort').value;

  const statusEl = $('lib-status');
  statusEl.innerHTML = '<span class="oar-spinner me-2"></span>Loading library...';
  $('lib-results').innerHTML = '';

  try {
    // Populate filter dropdowns
    await populateFilterDropdowns();

    const works = await listWorks({ search, keyword, tag, sortBy });
    libraryWorks = works;

    renderLibraryCards(works);
    statusEl.textContent = `${works.length} work${works.length !== 1 ? 's' : ''} in library`;
  } catch (err) {
    console.error('loadLibrary error:', err);
    statusEl.textContent = 'Failed to load library.';
  }
}

// ---- renderLibraryCards ----

function renderLibraryCards(works) {
  const container = $('lib-results');
  container.innerHTML = '';

  // Reset batch controls
  $('lib-select-all').checked = false;
  updateExportButton();

  if (!works.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-book"></i>
        <h5 class="mb-2">Your Library</h5>
        <p>Saved works and citations will appear here. Start by searching and saving works.</p>
      </div>`;
    return;
  }

  works.forEach(work => {
    container.insertAdjacentHTML('beforeend', buildLibraryCard(work));
  });

  attachLibraryCardListeners(container);
}

// ---- buildLibraryCard ----

function buildLibraryCard(work) {
  const authors = formatAuthors(work.authors);
  const keywordsHtml = work.keywords && work.keywords.length
    ? `<div class="mt-1">${work.keywords.slice(0, 6).map(kw => `<span class="oar-chip oar-chip-keyword">${escapeHtml(kw)}</span>`).join('')}</div>`
    : '';
  const tagsHtml = work.tags && work.tags.length
    ? `<div class="mt-1">${work.tags.map(t => `<span class="oar-chip oar-chip-tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const bibtexIndicator = work.hasBibtex
    ? '<span class="text-success"><i class="bi bi-check-circle-fill"></i> BibTeX</span>'
    : '<span class="text-danger"><i class="bi bi-x-circle"></i> No BibTeX</span>';

  const journalHtml = work.journal
    ? `<div class="oar-card-meta"><i class="bi bi-journal-text me-1"></i>${escapeHtml(work.journal)}</div>`
    : '';

  const doiHtml = work.doi
    ? `<a href="https://doi.org/${escapeHtml(work.doi)}" target="_blank" class="small text-oar-muted text-decoration-none"><i class="bi bi-box-arrow-up-right"></i> DOI</a>`
    : '';

  const openalexHtml = work.openalexId
    ? `<a href="https://openalex.org/${escapeHtml(work.openalexId)}" target="_blank" class="small text-oar-muted text-decoration-none"><i class="bi bi-box-arrow-up-right"></i> OpenAlex</a>`
    : '';

  const year = work.publication_year ?? '—';
  const citations = (work.cited_by_count ?? 0).toLocaleString();
  const type = work.type ? `<span class="text-capitalize">${escapeHtml(work.type)}</span>` : '';

  return `
    <div class="oar-card" data-work-id="${work.id}">
      <div class="d-flex gap-3">
        <div class="form-check pt-1">
          <input type="checkbox" class="form-check-input lib-check">
        </div>
        <div class="flex-grow-1">
          <div class="oar-card-title">${escapeHtml(work.title || 'Untitled')}</div>
          <div class="oar-card-meta">
            ${year} · ${citations} citations${type ? ' · ' + type : ''} · ${bibtexIndicator}
          </div>
          ${authors ? `<div class="oar-card-meta">${authors}</div>` : ''}
          ${journalHtml}
          ${tagsHtml}
          ${keywordsHtml}
          <div class="mt-1 d-flex gap-3">
            ${doiHtml}
            ${openalexHtml}
          </div>
        </div>
        <div class="d-flex flex-column gap-1">
          <button class="btn btn-sm btn-outline-primary lib-fetch-bibtex" title="Fetch BibTeX" ${work.hasBibtex ? 'disabled' : ''}>
            <i class="bi bi-file-earmark-code"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary lib-related" title="Related works">
            <i class="bi bi-diagram-3"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary lib-referenced" title="Referenced works">
            <i class="bi bi-book"></i>
          </button>
          <button class="btn btn-sm btn-outline-warning lib-edit" title="Edit">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger lib-remove" title="Remove">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </div>
    </div>`;
}

// ---- attachLibraryCardListeners ----

function attachLibraryCardListeners(container) {
  // Checkboxes
  container.querySelectorAll('.lib-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const allChecks = container.querySelectorAll('.lib-check');
      $('lib-select-all').checked = [...allChecks].every(c => c.checked);
      updateExportButton();
    });
  });

  // Fetch BibTeX
  container.querySelectorAll('.lib-fetch-bibtex').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.oar-card');
      handleFetchBibtex(card.dataset.workId, btn);
    });
  });

  // Related works
  container.querySelectorAll('.lib-related').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.oar-card');
      const work = libraryWorks.find(w => String(w.id) === card.dataset.workId);
      if (!work?.openalexId) return;

      btn.disabled = true;
      btn.innerHTML = '<span class="oar-spinner"></span>';
      try {
        const related = await fetchRelatedWorks(work.openalexId);
        if (related && related.length) {
          const names = related.slice(0, 5).map(r => r.title || 'Untitled').join('\n• ');
          alert(`Related works (${related.length}):\n\n• ${names}${related.length > 5 ? '\n...' : ''}`);
        } else {
          alert('No related works found.');
        }
      } catch (err) {
        console.error('Related works error:', err);
        alert('Failed to fetch related works.');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-diagram-3"></i>';
      }
    });
  });

  // Referenced works
  container.querySelectorAll('.lib-referenced').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.oar-card');
      const work = libraryWorks.find(w => String(w.id) === card.dataset.workId);
      if (!work?.openalexId) return;

      btn.disabled = true;
      btn.innerHTML = '<span class="oar-spinner"></span>';
      try {
        const { fetchWorkById } = await import('./api.js');
        const detail = await fetchWorkById(work.openalexId);
        const refs = detail?.referenced_works || [];
        if (refs.length) {
          alert(`Referenced works (${refs.length}):\n\n${refs.slice(0, 10).join('\n')}${refs.length > 10 ? '\n...' : ''}`);
        } else {
          alert('No referenced works found.');
        }
      } catch (err) {
        console.error('Referenced works error:', err);
        alert('Failed to fetch referenced works.');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-book"></i>';
      }
    });
  });

  // Edit
  container.querySelectorAll('.lib-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.oar-card');
      const workId = parseInt(card.dataset.workId, 10);
      const work = libraryWorks.find(w => w.id === workId);
      if (!work) return;

      const newTitle = prompt('Edit title:', work.title || '');
      if (newTitle === null) return; // cancelled

      const { getWork, setAbstract } = await import('./db.js');
      const newAbstract = prompt('Edit abstract:', work.abstract || '');
      if (newAbstract === null) return; // cancelled

      try {
        await import('./db.js').then(db => db.db.works.update(workId, { title: newTitle }));
        if (work.abstract !== newAbstract) {
          await setAbstract(workId, newAbstract);
        }
        await loadLibrary();
      } catch (err) {
        console.error('Edit error:', err);
        alert('Failed to update work.');
      }
    });
  });

  // Remove
  container.querySelectorAll('.lib-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.oar-card');
      handleRemoveWork(card.dataset.workId);
    });
  });
}

// ---- handleFetchBibtex ----

async function handleFetchBibtex(workId, btnElement) {
  const work = libraryWorks.find(w => String(w.id) === String(workId));
  if (!work) return;

  btnElement.disabled = true;
  btnElement.innerHTML = '<span class="oar-spinner"></span>';

  try {
    const email = await getSetting('email');
    const result = await fetchBibtex(work.doi, email);

    if (result) {
      const { setBibtex } = await import('./db.js');
      await setBibtex(parseInt(workId, 10), result);
      btnElement.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i>';
      btnElement.title = 'BibTeX fetched';
      // Update the bibtex indicator in the card
      const indicator = btnElement.closest('.oar-card').querySelector('.text-danger');
      if (indicator) {
        indicator.className = 'text-success';
        indicator.innerHTML = '<i class="bi bi-check-circle-fill"></i> BibTeX';
      }
      // Update local state
      work.hasBibtex = true;
      work.bibtex = result;
    } else {
      btnElement.innerHTML = '<i class="bi bi-exclamation-triangle text-warning"></i>';
      btnElement.title = 'No BibTeX found for this DOI';
      btnElement.disabled = false;
    }
  } catch (err) {
    console.error('handleFetchBibtex error:', err);
    btnElement.innerHTML = '<i class="bi bi-file-earmark-code"></i>';
    btnElement.title = 'Fetch failed — retry';
    btnElement.disabled = false;
  }
}

// ---- handleRemoveWork ----

async function handleRemoveWork(workId) {
  const work = libraryWorks.find(w => String(w.id) === String(workId));
  const title = work?.title || 'this work';
  if (!window.confirm(`Remove "${title}" from your library?`)) return;

  try {
    await removeWork(parseInt(workId, 10));
    await loadLibrary();
  } catch (err) {
    console.error('handleRemoveWork error:', err);
    alert('Failed to remove work.');
  }
}

// ---- handleFetchAllBibtex ----

async function handleFetchAllBibtex() {
  const missing = libraryWorks.filter(w => !w.hasBibtex && w.doi);
  if (!missing.length) {
    alert('All works with DOIs already have BibTeX entries.');
    return;
  }

  const btn = $('lib-fetch-all-bibtex');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  const statusEl = $('lib-status');
  const prevStatus = statusEl.textContent;

  let fetched = 0;
  const total = missing.length;

  for (const work of missing) {
    fetched++;
    statusEl.textContent = `Fetching BibTeX ${fetched}/${total}...`;
    btn.innerHTML = `<i class="bi bi-download me-1"></i> ${fetched}/${total}`;

    try {
      const email = await getSetting('email');
      const result = await fetchBibtex(work.doi, email);
      if (result) {
        const { setBibtex } = await import('./db.js');
        await setBibtex(work.id, result);
        work.hasBibtex = true;
        work.bibtex = result;
      }
    } catch (err) {
      console.error(`Fetch BibTeX error for ${work.doi}:`, err);
    }
  }

  btn.disabled = false;
  btn.innerHTML = originalHtml;

  await loadLibrary();
}

// ---- handleExportBibtex ----

async function handleExportBibtex(ids) {
  try {
    const text = await exportBibtex(ids);
    if (!text.trim()) {
      alert('No BibTeX entries to export. Fetch BibTeX first for the selected works.');
      return;
    }
    downloadBibtex(text);
  } catch (err) {
    console.error('handleExportBibtex error:', err);
    alert('Failed to export BibTeX.');
  }
}

function downloadBibtex(text, filename = 'references.bib') {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- populateFilterDropdowns ----

async function populateFilterDropdowns() {
  const keywordSelect = $('lib-filter-keyword');
  const tagSelect = $('lib-filter-tag');

  const [keywords, tags] = await Promise.all([getAllKeywords(), getAllTags()]);

  // Preserve current selection
  const currentKeyword = keywordSelect.value;
  const currentTag = tagSelect.value;

  // Populate keywords
  keywordSelect.innerHTML = '<option value="">All Keywords</option>';
  keywords.forEach(kw => {
    keywordSelect.insertAdjacentHTML('beforeend',
      `<option value="${escapeAttr(kw)}"${kw === currentKeyword ? ' selected' : ''}>${escapeHtml(kw)}</option>`);
  });

  // Populate tags
  tagSelect.innerHTML = '<option value="">All Tags</option>';
  tags.forEach(t => {
    tagSelect.insertAdjacentHTML('beforeend',
      `<option value="${escapeAttr(t)}"${t === currentTag ? ' selected' : ''}>${escapeHtml(t)}</option>`);
  });
}

// ---- updateExportButton ----

function updateExportButton() {
  const checked = $('lib-results').querySelectorAll('.lib-check:checked');
  $('lib-export-selected').disabled = checked.length === 0;
}

// ---------- Exports ----------

export {
  performSearch,
  renderSearchResults,
  handleSaveWork,
  handleSaveSelected,
  toggleSemanticControls,
  loadLibrary,
  handleFetchAllBibtex,
  handleExportBibtex,
  updateExportButton,
};
