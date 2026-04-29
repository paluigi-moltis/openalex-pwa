# OpenAlex Research Manager — PWA Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Rebuild the `openalex-pygui` Flet desktop app as a fully client-side Progressive Web App, served from static hosting, with all data (secrets, library, tags, notes) persisted in browser storage.

**Architecture:** Vanilla HTML/CSS/JS (no framework) with IndexedDB via Dexie.js for structured storage, Tailwind CSS for styling, and direct calls to the OpenAlex REST API, doi.org content negotiation, and Crossref API — all from `fetch()` in the browser. The PWA uses a service worker for offline caching of app shell assets. No server-side logic required.

**Tech Stack:**
- HTML5 + CSS3 + Vanilla JavaScript (ES2022, modules)
- Bootstrap 5 (via CDN) + custom CSS variables for theming
- Dexie.js (IndexedDB wrapper) — client-side database
- Web App Manifest + Service Worker — PWA installability
- OpenAlex REST API (`https://api.openalex.org/works?...`)
- doi.org content negotiation + Crossref API — BibTeX retrieval
- No build step required (optional Vite later for bundling)

---

## Phase 1: Project Scaffolding & PWA Shell

### Task 1: Initialize project structure

**Objective:** Create the directory layout and core files for the PWA.

**Files:**
- Create: `index.html`
- Create: `manifest.json`
- Create: `sw.js`
- Create: `css/style.css`
- Create: `js/app.js`
- Create: `js/db.js`
- Create: `js/api.js`
- Create: `js/ui.js`
- Create: `img/icon-192.png` (placeholder)
- Create: `img/icon-512.png` (placeholder)
- Create: `.gitignore`
- Create: `README.md`

**Step 1: Create directory structure**

```
openalex-pwa/
├── index.html          # Main SPA shell
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── css/
│   └── style.css       # Custom styles (beyond Tailwind)
├── js/
│   ├── app.js          # Entry point, routing, tab management
│   ├── db.js           # Dexie database schema & CRUD
│   ├── api.js          # OpenAlex + BibTeX API calls
│   └── ui.js           # DOM manipulation, rendering
└── img/
    ├── icon-192.png    # PWA icon
    └── icon-512.png    # PWA icon
```

**Step 2: Write `manifest.json`**

```json
{
  "name": "OpenAlex Research Manager",
  "short_name": "OpenAlex",
  "description": "Search OpenAlex, build your research library, and export BibTeX citations.",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#3b82f6",
  "orientation": "any",
  "icons": [
    { "src": "img/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "img/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Step 3: Write minimal `index.html`**

HTML shell with:
- Tailwind CSS via CDN (`<script src="https://cdn.tailwindcss.com">`)
- Dexie.js via CDN (`<script src="https://unpkg.com/dexie@latest/dist/dexie.js">`)
- PWA meta tags (`theme-color`, `viewport`, `apple-touch-icon`)
- Link to `manifest.json`
- Three-tab layout matching Flet app: Search, Library, Settings
- `<script type="module" src="js/app.js"></script>`
- Dark mode support via Tailwind's `class` strategy (toggle `dark` class on `<html>`)

**Step 4: Write minimal `sw.js`**

```js
const CACHE_NAME = 'openalex-pwa-v1';
const ASSETS = ['./index.html', './css/style.css', './js/app.js', './js/db.js', './js/api.js', './js/ui.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
```

**Step 5: Register service worker in `index.html`**

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
</script>
```

**Step 6: Commit**

```bash
git init && git add -A && git commit -m "feat: project scaffolding with PWA shell"
```

---

### Task 2: Create the tab navigation UI

**Objective:** Build the 3-tab navigation bar and tab panels matching the Flet app layout.

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/app.js`

**Step 1: Add tab navigation HTML to `index.html`**

```html
<nav id="tab-bar">
  <button data-tab="search" class="tab-btn active">
    <svg><!-- search icon --></svg> Search
  </button>
  <button data-tab="library" class="tab-btn">
    <svg><!-- library icon --></svg> Library
  </button>
  <button data-tab="settings" class="tab-btn">
    <svg><!-- settings icon --></svg> Settings
  </button>
</nav>

<main>
  <section id="tab-search" class="tab-panel active"><!-- search content --></section>
  <section id="tab-library" class="tab-panel hidden"><!-- library content --></section>
  <section id="tab-settings" class="tab-panel hidden"><!-- settings content --></section>
</main>
```

**Step 2: Add tab switching logic in `js/app.js`**

```js
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: 3-tab navigation (Search, Library, Settings)"
```

---

### Task 3: Implement dark/light theme toggle

**Objective:** Support system, light, and dark theme modes matching the Flet app's Settings.

**Files:**
- Modify: `index.html` (Tailwind config)
- Modify: `css/style.css`
- Modify: `js/app.js`

**Step 1: Configure Tailwind dark mode**

```html
<script>
  tailwind.config = {
    darkMode: 'class',
    // ... other config
  };
</script>
```

**Step 2: Add theme initialization in `js/app.js`**

```js
function initTheme() {
  const saved = localStorage.getItem('theme') || 'system';
  applyTheme(saved);
}

function applyTheme(mode) {
  if (mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: dark/light/system theme support"
```

---

## Phase 2: Database Layer (IndexedDB via Dexie)

### Task 4: Define Dexie database schema

**Objective:** Map the Flet app's SQLite schema to IndexedDB using Dexie.js.

**Files:**
- Modify: `js/db.js`

**Schema mapping from SQLite → IndexedDB:**

| SQLite Table | IndexedDB Table | Indexed Key | Indexes |
|---|---|---|---|
| `works` | `works` | `++id` (auto), `doi` (unique) | `title`, `publication_year`, `cited_by_count`, `date_added` |
| `authors` | `authors` | `++id` | `name` |
| `work_authors` | `workAuthors` | `[workId, authorId]` (compound) | `workId`, `authorId`, `position` |
| `work_keywords` | `workKeywords` | `[workId, keyword]` (compound) | `keyword` |
| `work_tags` | `workTags` | `[workId, tag]` (compound) | `tag` |
| `work_relationships` | `workRelationships` | `[workId, relatedId, relationship]` (compound) | |
| `settings` | `settings` | `key` (primary) | |

**Implementation:**

```js
const db = new Dexie('OpenAlexLibrary');
db.version(1).stores({
  works: '++id, doi, title, publication_year, cited_by_count, date_added, openalexId',
  authors: '++id, name',
  workAuthors: '[workId+authorId], workId, authorId, position',
  workKeywords: '[workId+keyword], workId, keyword',
  workTags: '[workId+tag], workId, tag',
  workRelationships: '[workId+relatedId+relationship], workId, relatedId',
  settings: 'key'
});
```

**Note:** Settings (api_key, email) are stored in IndexedDB instead of localStorage for consistency. The API key is **not** encrypted — this is client-side only, same trust model as the Flet desktop app. We document this limitation.

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: Dexie database schema matching SQLite model"
```

---

### Task 5: Implement database CRUD operations

**Objective:** Create all CRUD methods needed by the UI, mirroring the Flet app's `Database` class.

**Files:**
- Modify: `js/db.js`

**Methods to implement:**

1. `addWork(workDict)` — INSERT work + authors + keywords + relationships; return work ID
2. `removeWork(id)` — DELETE work + cascade (Dexie doesn't auto-cascade, so manual delete of related records)
3. `removeWorks(ids)` — batch remove
4. `listWorks({ search, keyword, tag, sortBy })` — filtered + sorted listing; joins authors, keywords, tags
5. `getWork(id)` — single work with all relations
6. `setBibtex(id, bibtex)` — update bibtex field
7. `setNotes(id, notes)` — update notes field
8. `setAbstract(id, abstract)` — update abstract field
8. `setTags(workId, tags[])` — replace all tags for a work
9. `exportBibtex(ids)` — collect bibtex text for given work IDs
10. `getSetting(key)` / `setSetting(key, value)` — key-value settings
11. `getAllKeywords()` — distinct keywords across all saved works (for filter dropdown)
12. `getAllTags()` — distinct tags across all saved works (for filter dropdown)
13. `isWorkSaved(openalexId)` — check if a work is already in library

**Key implementation details:**
- `addWork()` should use `db.works.put()` (upsert by `doi` or `openalexId`) to avoid duplicates
- `listWorks()` needs manual joins: for each work, query `workAuthors` → `authors`, `workKeywords`, `workTags`
- Sort options: `title`, `publication_year` (desc), `cited_by_count` (desc), `date_added` (desc)
- For the `isWorkSaved()` check used in search results, query by `openalexId`

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: complete IndexedDB CRUD operations"
```

---

## Phase 3: API Layer

### Task 6: Implement OpenAlex search API client

**Objective:** Call OpenAlex REST API directly for keyword and semantic search, replacing `openalex-py`.

**Files:**
- Create: `js/api.js`

**API endpoints and parameters:**

| Search Mode | URL Pattern | Notes |
|---|---|---|
| Default (title+abstract) | `https://api.openalex.org/works?search={query}&sort={sort}&per_page={limit}` | Standard search |
| Title only | `https://api.openalex.org/works?filter=title.search:{query}&sort={sort}&per_page={limit}` | Filter-based |
| Full text | `https://api.openalex.org/works?filter=fulltext.search:{query}&sort={sort}&per_page={limit}` | Filter-based |
| Semantic | `https://api.openalex.org/works?search.semantic={query}&per_page={limit}` | No sort param (relevance only) |

**Sort options:**
- `relevance_score:desc` (default for keyword search)
- `cited_by_count:desc`
- `publication_year:desc`
- `publication_year:asc`

**API key:** Passed as `mailto` parameter or `Authorization` header. From OpenAlex docs:
```
https://api.openalex.org/works?search=...&mailto=youremail@example.com
```

**Methods to implement:**

```js
async function searchWorks({ query, mode, scope, sort, limit, apiKey, email }) {
  let url = 'https://api.openalex.org/works?';
  const params = new URLSearchParams();

  if (mode === 'semantic') {
    params.set('search.semantic', query);
  } else if (scope === 'title') {
    params.set('filter', `title.search:${query}`);
  } else if (scope === 'fulltext') {
    params.set('filter', `fulltext.search:${query}`);
  } else {
    params.set('search', query);
  }

  if (mode !== 'semantic' && sort) params.set('sort', sort);
  if (limit) params.set('per_page', limit);
  if (email) params.set('mailto', email);

  url += params.toString();

  const headers = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`OpenAlex API error: ${resp.status}`);
  const data = await resp.json();
  return data.results.map(workToDict);
}
```

**`workToDict()` — Normalize OpenAlex API response to internal work object:**

```js
function workToDict(w) {
  return {
    openalexId: w.id,
    doi: w.doi || null,
    title: w.title || 'Untitled',
    publication_year: w.publication_year || null,
    type: w.type || null,
    cited_by_count: w.cited_by_count || 0,
    relevance_score: w.relevance_score || null,
    abstract: w.abstract?.replace(/<jats[^>]*>/g, '').replace(/<\/jats>/g, '') || null,
    journal: w.primary_location?.source?.display_name || null,
    authors: (w.authorships || []).map(a => ({
      id: a.author?.id,
      name: a.author?.display_name,
      orcid: a.author?.orcid,
      position: a.author_position || 0
    })),
    keywords: (w.keywords || []).map(k => k.display_name),
    related_works: (w.related_works || []).map(id => ({ id, relationship: 'related' })),
    referenced_works: (w.referenced_works || []).map(id => ({ id, relationship: 'referenced' }))
  };
}
```

**Also implement:**

- `fetchWorkById(openalexId)` — `GET https://api.openalex.org/works/{id}` with retry logic (3 attempts, exponential backoff)
- `fetchRelatedWorks(ids)` — batch fetch by filter `openalex:W123|W456|...` or sequential calls

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: OpenAlex REST API client (search, fetch, related)"
```

---

### Task 7: Implement BibTeX retrieval

**Objective:** Fetch BibTeX from doi.org and Crossref, mirroring the Flet app's two-step fallback.

**Files:**
- Modify: `js/api.js`

**Two-step fallback:**

```js
async function fetchBibtex(doi, email) {
  if (!doi) return null;

  // Step 1: doi.org content negotiation
  const cleanDoi = doi.replace('https://doi.org/', '');
  const headers = {
    'Accept': 'application/x-bibtex',
    'User-Agent': `OpenAlexPWA/1.0 (mailto:${email || 'anonymous'})`
  };

  try {
    const resp = await fetch(`https://doi.org/${cleanDoi}`, {
      headers,
      redirect: 'follow'
    });
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('@')) return text;
    }
  } catch (e) { /* fallback */ }

  // Step 2: Crossref API
  try {
    const resp = await fetch(`https://api.crossref.org/works/${cleanDoi}/transform/application/x-bibtex`, {
      headers,
      redirect: 'follow'
    });
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('@')) return text;
    }
  } catch (e) { /* return null */ }

  return null;
}
```

**CORS note:** doi.org supports CORS. Crossref API also supports CORS. Both should work from browser.

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: BibTeX retrieval (doi.org + Crossref fallback)"
```

---

## Phase 4: Search Tab UI

### Task 8: Build the search form

**Objective:** Create the search input, mode/scope/sort/limit controls matching the Flet app.

**Files:**
- Modify: `index.html`
- Modify: `js/ui.js`

**UI elements:**
- Search text input (expand to fill width)
- "Search" button (primary action)
- Dropdown: Search Mode (Keyword / Semantic)
- Dropdown: Scope (Title+Abstract / Title only / Full text) — disabled when Semantic
- Dropdown: Sort (Relevance / Most cited / Newest / Oldest) — disabled when Semantic
- Dropdown: Results per page (10 / 25 / 50)
- Status text line

**Behavior:**
- When mode changes to "Semantic", disable Scope and Sort dropdowns
- Enter key in search input triggers search
- During search, show loading spinner, disable button

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: search form with mode/scope/sort controls"
```

---

### Task 9: Render search results

**Objective:** Display search results as cards with save functionality, matching the Flet app's result cards.

**Files:**
- Modify: `js/ui.js`

**Card layout per result:**
- Checkbox (for batch save)
- Main content:
  - Title (bold, linked to OpenAlex)
  - Meta line: Year | Citations count | Relevance score | Type
  - Authors (up to 3, then "et al.")
  - Journal name
  - Keyword chips (up to 6)
  - Abstract preview (300 chars, expandable)
  - DOI link (if available)
- Save button (disabled + "Saved" badge if already in library)

**Batch controls (shown when results exist):**
- "Select all" checkbox
- "Save Selected" button

**Functionality:**
- `renderSearchResults(results)` — clear container, create card elements
- Each card checks `db.isWorkSaved(openalexId)` to determine save button state
- Save button calls `db.addWork(workDict)` and updates UI
- "Save Selected" iterates checked cards and saves each

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: search result cards with save/batch-save"
```

---

### Task 10: Wire search form to API + render results

**Objective:** Connect the search form to `api.searchWorks()` and render results.

**Files:**
- Modify: `js/app.js`
- Modify: `js/ui.js`

**Flow:**
1. User clicks Search (or presses Enter)
2. Read form values (query, mode, scope, sort, limit)
3. Read settings from DB (apiKey, email)
4. Show loading state
5. Call `searchWorks()`
6. On success: render results, show count
7. On error: show error message

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: wire search form to OpenAlex API"
```

---

## Phase 5: Library Tab UI

### Task 11: Build library filters

**Objective:** Create text filter, keyword filter, and tag filter dropdowns.

**Files:**
- Modify: `index.html`
- Modify: `js/ui.js`

**UI elements:**
- Text search input (filter by title/abstract within library)
- Keyword dropdown (populated from `db.getAllKeywords()`)
- Tag dropdown (populated from `db.getAllTags()`)
- Refresh button (re-populate filters from DB)
- Sort dropdown: Title / Year / Citations / Date added

**Behavior:**
- All filters are combinable (AND logic)
- Changing any filter re-renders the library list
- Dropdowns repopulated on tab switch (data may have changed)

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: library filter controls (text, keyword, tag, sort)"
```

---

### Task 12: Render library work cards

**Objective:** Display saved works with all actions, matching the Flet app's library cards.

**Files:**
- Modify: `js/ui.js`

**Card layout per saved work:**
- Checkbox (for batch operations)
- Main content:
  - Title
  - Meta line: Year | Citations | Type
  - Authors
  - Journal
  - BibTeX status indicator (✓ icon if present, ✗ if missing)
  - Tag chips (user-defined)
  - Keyword chips (OpenAlex)
  - DOI link + OpenAlex link
- Action buttons:
  - 📄 Fetch BibTeX (single)
  - 🔗 Browse related works
  - 📚 Browse referenced works
  - ✏️ Edit (notes, abstract, tags)
  - 🗑️ Remove

**Batch controls:**
- "Select all" checkbox
- "Export Selected BibTeX" button
- "Fetch All BibTeX" button (bulk fetch for all works missing BibTeX)

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: library cards with action buttons"
```

---

### Task 13: Implement edit dialog

**Objective:** Modal dialog to edit notes, abstract, and tags for a saved work.

**Files:**
- Modify: `index.html` (dialog HTML)
- Modify: `js/ui.js`

**Dialog contents:**
- Notes: `<textarea>` (multiline)
- Abstract: `<textarea>` (multiline, editable)
- Tags: text input with existing-tag suggestion chips below
- Cancel / Save buttons

**Behavior:**
- Load current values from DB
- Tag input: as user types, show matching existing tags as clickable chips
- On save: call `db.setNotes()`, `db.setAbstract()`, `db.setTags()`
- Refresh library display after save

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: edit dialog (notes, abstract, tags)"
```

---

### Task 14: Implement related/referenced works dialog

**Objective:** Modal dialog that fetches and displays related or referenced works.

**Files:**
- Modify: `index.html`
- Modify: `js/ui.js`

**Dialog contents:**
- Title: "Related Works" or "Referenced Works"
- Loading spinner during fetch
- Scrollable list of work cards (simplified: title, year, citations, authors)
- Each card has a Save button
- Close button

**Behavior:**
- On open: read relationship IDs from DB (`work_relationships`), fetch each from OpenAlex API
- Show progress: "Fetching 3/15..."
- Each result has a Save button that calls `db.addWork()`
- Works already saved show "Saved" badge

**Implementation note:** The Flet app fetches one-by-one with a progress ring. We'll do the same but with `Promise.allSettled()` for parallel fetching with progress tracking.

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: related/referenced works dialog"
```

---

### Task 15: Implement BibTeX export

**Objective:** Export selected or all BibTeX entries as a downloadable `.bib` file.

**Files:**
- Modify: `js/ui.js`

**Flow:**
1. Get selected work IDs (or all works with BibTeX)
2. Call `db.exportBibtex(ids)`
3. Create a Blob and trigger download via `<a download>`

```js
function downloadBibtex(bibtexText, filename = 'references.bib') {
  const blob = new Blob([bibtexText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: BibTeX export as .bib file download"
```

---

## Phase 6: Settings Tab UI

### Task 16: Build settings form

**Objective:** Create the settings panel for API key, email, and theme.

**Files:**
- Modify: `index.html`
- Modify: `js/ui.js`

**UI elements:**
- API Key: password input with show/hide toggle button
- Polite Pool Email: text input
- Theme: dropdown (System / Light / Dark)
- "Save Settings" button
- Status text

**Behavior:**
- On load: populate from `db.getSetting()`
- Show/hide toggle for API key field
- Save: call `db.setSetting()` for each field, apply theme immediately
- Show "Settings saved ✓" confirmation

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: settings form (API key, email, theme)"
```

---

## Phase 7: Polish & PWA Finalization

### Task 17: Responsive design pass

**Objective:** Ensure the app works well on mobile and desktop viewports.

**Files:**
- Modify: `css/style.css`
- Modify: `index.html`

**Requirements:**
- Mobile-first layout with Tailwind responsive classes
- Tab bar adapts to bottom bar on mobile
- Cards stack vertically on narrow screens
- Dialogs are full-screen on mobile, centered modal on desktop
- Search form controls wrap on narrow screens
- Touch-friendly tap targets (min 44px)

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: responsive design for mobile and desktop"
```

---

### Task 18: Error handling & loading states

**Objective:** Add comprehensive error handling, loading indicators, and empty states.

**Files:**
- Modify: `js/ui.js`
- Modify: `js/api.js`

**Requirements:**
- Network error toast/banner for failed API calls
- Loading spinners for: search, BibTeX fetch, related works fetch
- Empty states: "No results found", "Your library is empty", "No BibTeX entries to export"
- Retry logic for `fetchWorkById()` (3 attempts, exponential backoff)
- Graceful handling of missing data fields (null checks everywhere)

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: error handling, loading states, empty states"
```

---

### Task 19: Generate PWA icons and finalize manifest

**Objective:** Create proper PWA icons and ensure installability.

**Files:**
- Modify: `img/icon-192.png`
- Modify: `img/icon-512.png`
- Modify: `manifest.json`
- Modify: `index.html`

**Requirements:**
- Generate icons using SVG or canvas (book/magnifying glass motif)
- Add `apple-touch-icon` meta tag
- Verify manifest has all required fields
- Test PWA installability in Chrome DevTools → Application → Manifest

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: PWA icons and installability"
```

---

### Task 20: Data export/import for backup

**Objective:** Allow users to export and import their entire library as JSON.

**Files:**
- Modify: `js/ui.js`
- Modify: `js/db.js`

**Why:** Since all data lives in the browser, users need a way to back up and transfer their library.

**Implementation:**
- Export: serialize all IndexedDB tables to JSON, download as file
- Import: file input, parse JSON, bulk upsert into IndexedDB
- Add buttons in Settings tab

**Step 1: Commit**

```bash
git add -A && git commit -m "feat: library export/import as JSON backup"
```

---

### Task 21: Final integration testing & README

**Objective:** Test all features end-to-end and write comprehensive documentation.

**Files:**
- Modify: `README.md`

**Test scenarios:**
1. Search works (keyword mode, all scopes)
2. Search works (semantic mode)
3. Sort and limit changes
4. Save individual and batch works
5. Library filtering (text, keyword, tag)
6. Edit notes, abstract, tags
7. Fetch BibTeX (single and batch)
8. Export BibTeX as .bib file
9. Browse related/referenced works
10. Remove works
11. Settings save/load
12. Theme switching
13. PWA install
14. Export/import library backup
15. Offline app shell loading

**Step 1: Commit**

```bash
git add -A && git commit -m "docs: README with usage instructions and feature list"
```

---

## Deployment Options

Once built, the PWA can be deployed to any static hosting:

| Platform | Command / Method |
|---|---|
| GitHub Pages | Push to `gh-pages` branch |
| Netlify | Drag & drop or `netlify deploy` |
| Vercel | `vercel --prod` |
| Cloudflare Pages | Connect repo |
| Local file serving | `npx serve .` or `python -m http.server` |

No server-side runtime needed — pure static files.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Vanilla JS | Small app, no build step, maximum simplicity |
| Database | IndexedDB via Dexie.js | Structured storage, handles relationships, well-tested library |
| Styling | Bootstrap 5 via CDN | Rapid UI, dark mode via CSS variables, responsive grid/components |
| API calls | Direct `fetch()` | No backend needed, OpenAlex has CORS support |
| Secrets storage | IndexedDB | Consistent with library data; NOT encrypted (document limitation) |
| BibTeX fetch | doi.org + Crossref fallback | Same two-step strategy as Flet app |
| Offline support | Service Worker (cache-first) | App shell works offline; API calls need network |
| Backup | JSON export/import | Users can back up their library and transfer between devices |

---

## Scope Boundaries (NOT included)

- ❌ User authentication / cloud sync
- ❌ Encryption of API key in browser storage
- ❌ Server-side rendering or backend API
- ❌ Push notifications
- ❌ Full offline mode (API calls require network)
- ❌ Desktop shortcut creation (handled by browser PWA install)
