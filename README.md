# OpenAlex Research Manager

A Progressive Web App for searching [OpenAlex](https://openalex.org) scholarly works, managing a personal research library, and exporting BibTeX citations.

> [!WARNING]
> **Experimental project.** This software is provided with **no warranties**, to be used **at your own risk**. We welcome feedback, collaborators, and pull requests.

> [!NOTE]
> Results are fetched from [OpenAlex](https://openalex.org/). This project is **not affiliated with OpenAlex** — it is merely a helper to support you in managing your bibliography.

## Features

- **Search** — Keyword and semantic search across millions of scholarly works from OpenAlex
- **Library** — Save works with custom tags and notes, organize your research
- **BibTeX** — Fetch BibTeX citations from Crossref and export them
- **Related Works** — Browse related and referenced works for any saved paper
- **Offline-ready** — App shell works offline via service worker
- **Dark Mode** — System, light, and dark theme support with smooth transitions
- **Backup** — Export/import your entire library as JSON for backup and transfer
- **PWA** — Installable on desktop and mobile devices
- **Responsive** — Works great on phones, tablets, and desktops

## Deployment

Static files only — deploy to any static hosting:

- **GitHub Pages**: Push to `gh-pages` branch
- **Netlify**: Drag & drop the project folder
- **Vercel**: `vercel --prod`
- **Local**: `npx serve .` or `python -m http.server`

**Note on caching proxies:** app asset URLs carry a `?v=<version>` suffix (e.g. `css/style.css?v=0.2.0`), and the service worker cache name is versioned too. This busts stale caches held by reverse proxies (nginx/NPM) and browsers. When cutting a release: bump the version in `index.html` (footer + all `?v=` suffixes), in the `js/*.js` import specifiers, and in `sw.js` (`CACHE_NAME`, `CDN_CACHE`, and the `APP_SHELL` list).

## Usage

1. Open the app in your browser (or install as PWA)
2. **Search** for works using keywords or semantic search
3. **Save** interesting works to your library (individually or in batch)
4. **Organize** by adding tags and notes via the edit dialog
5. **Fetch BibTeX** citations from Crossref and export them as `.bib` files
6. **Explore** related and referenced works for deeper research
7. **Configure** API key and email in Settings for better rate limits
8. **Backup** your library by exporting to JSON, or import from a previous backup

## Settings

- **API Key** — Optional OpenAlex API key for higher rate limits. [Register here](https://openalex.org/register).
- **Polite Pool Email** — Your email address, used for Crossref/doi.org requests to get polite pool rate limits.
- **Theme** — Choose between System default, Light, or Dark mode.
- **Data Management** — Export or import your full library as JSON.

## Data Storage

All data is stored locally in your browser's IndexedDB via [Dexie.js](https://dexie.org/):

| Table | Description |
|-------|-------------|
| `works` | Saved works with metadata, abstracts, BibTeX, notes |
| `authors` | Author records (name, ORCID) |
| `workAuthors` | Many-to-many work↔author relationships |
| `workKeywords` | Keywords extracted from OpenAlex |
| `workTags` | User-defined tags |
| `workRelationships` | Related/referenced work links |
| `settings` | App settings (API key, email, theme) |

No data is sent to any server except the OpenAlex and Crossref APIs for search and BibTeX retrieval.

## Tech Stack

- **Vanilla JavaScript** (ES2022 modules, no build step)
- **Bootstrap 5.3** — UI framework and icons
- **Dexie.js** — IndexedDB wrapper for structured local storage
- **OpenAlex REST API** — Scholarly work search and metadata
- **Crossref API** — BibTeX citation retrieval
- **Service Worker** — Offline caching and PWA support

## Project Structure

```
openalex-pwa/
├── index.html          # Main app shell (tabs, modals)
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── css/
│   └── style.css       # Custom styles + theme variables
├── js/
│   ├── db.js           # IndexedDB layer (Dexie.js)
│   ├── api.js          # OpenAlex & Crossref API calls
│   ├── ui.js           # UI rendering (search, library, settings, dialogs)
│   └── app.js          # App entry point, initialization, tab switching
├── img/                # PWA icons
├── LICENSE             # MIT license
└── README.md           # This file
```

## Contributing

Feedback, collaborators, and pull requests are welcome! Visit the [GitHub repository](https://github.com/paluigi-moltis/openalex-pwa) to open an issue or submit a PR.

## License

[MIT](LICENSE) — Copyright (c) 2026 Luigi Palumbo

This project is experimental and provided with no warranties; use it at your own risk. It is not affiliated with OpenAlex — it is merely a helper to support you in managing your bibliography.
