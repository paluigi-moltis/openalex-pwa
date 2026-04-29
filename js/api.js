// ---------------------------------------------------------------------------
// OpenAlex API client + BibTeX retrieval
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.openalex.org/works';

// ---------------------------------------------------------------------------
// 1. searchWorks  – keyword / semantic / title-only / full-text search
// ---------------------------------------------------------------------------

/**
 * Search OpenAlex works.
 *
 * @param {Object}  opts
 * @param {string}  opts.query  – search text
 * @param {'keyword'|'semantic'} [opts.mode='keyword'] – search mode
 * @param {'default'|'title'|'fulltext'} [opts.scope='default'] – search scope
 * @param {string}  [opts.sort='relevance_score:desc']
 * @param {10|25|50} [opts.limit=25]
 * @param {string|null} [opts.apiKey=null]
 * @param {string|null} [opts.email=null]
 * @returns {Promise<{results: Array, meta: Object}|null>}
 */
async function searchWorks({ query, mode = 'keyword', scope = 'default', sort = 'relevance_score:desc', limit = 25, apiKey = null, email = null }) {
  try {
    const params = new URLSearchParams();
    const headers = {};

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    if (mode === 'semantic') {
      params.set('search.semantic', query);
      // OpenAlex semantic search ignores explicit sort
    } else if (scope === 'title') {
      params.set('filter', `title.search:${query}`);
      params.set('sort', sort);
    } else if (scope === 'fulltext') {
      params.set('filter', `fulltext.search:${query}`);
      params.set('sort', sort);
    } else {
      // default scope: title + abstract keyword search
      params.set('search', query);
      params.set('sort', sort);
    }

    params.set('per_page', String(limit));

    if (email) {
      params.set('mailto', email);
    }

    const url = `${BASE_URL}?${params.toString()}`;
    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      console.error(`searchWorks HTTP ${resp.status}`, await resp.text());
      return null;
    }

    const data = await resp.json();

    return {
      results: (data.results || []).map(workToDict),
      meta: data.meta || {},
    };
  } catch (err) {
    console.error('searchWorks error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. workToDict  – normalise an OpenAlex work object
// ---------------------------------------------------------------------------

/**
 * @param {Object} w – raw OpenAlex work object
 * @returns {Object} normalised work dict
 */
function workToDict(w) {
  return {
    openalexId: w.id,
    doi: w.doi || null,
    title: w.title || 'Untitled',
    publication_year: w.publication_year || null,
    type: w.type || null,
    cited_by_count: w.cited_by_count || 0,
    relevance_score: w.relevance_score || null,
    abstract: w.abstract
      ? w.abstract.replace(/<jats[^>]*>/g, '').replace(/<\/jats>/g, '')
      : null,
    journal: w.primary_location?.source?.display_name || null,
    authors: (w.authorships || []).map(a => ({
      id: a.author?.id,
      name: a.author?.display_name,
      orcid: a.author?.orcid,
      position: a.author_position || 0,
    })),
    keywords: (w.keywords || []).map(k => k.display_name),
    related_works: (w.related_works || []).map(id => ({ id, relationship: 'related' })),
    referenced_works: (w.referenced_works || []).map(id => ({ id, relationship: 'referenced' })),
  };
}

// ---------------------------------------------------------------------------
// 3. fetchWorkById  – single work fetch with retry
// ---------------------------------------------------------------------------

/**
 * Fetch a single work by OpenAlex ID with exponential-backoff retry.
 *
 * @param {string}      openalexId
 * @param {string|null} [apiKey=null]
 * @returns {Promise<Object|null>}
 */
async function fetchWorkById(openalexId, apiKey = null) {
  const maxAttempts = 3;
  const delays = [500, 1000, 2000]; // ms

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(delays[attempt - 1]);
      }

      const headers = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const resp = await fetch(`${BASE_URL}/${openalexId}`, { headers });

      if (!resp.ok) {
        console.warn(`fetchWorkById attempt ${attempt + 1} HTTP ${resp.status}`);
        continue; // retry
      }

      return workToDict(await resp.json());
    } catch (err) {
      console.warn(`fetchWorkById attempt ${attempt + 1} error:`, err);
      // retry on network / parse errors
    }
  }

  console.error(`fetchWorkById failed after ${maxAttempts} attempts for ${openalexId}`);
  return null;
}

// ---------------------------------------------------------------------------
// 4. fetchRelatedWorks  – batch fetch multiple works (max 5 concurrent)
// ---------------------------------------------------------------------------

/**
 * Fetch an array of works by their OpenAlex IDs.
 *
 * @param {string[]}    ids
 * @param {string|null} [apiKey=null]
 * @param {function}    [onProgress=null] – called with (current, total)
 * @returns {Promise<Object[]>}
 */
async function fetchRelatedWorks(ids, apiKey = null, onProgress = null) {
  if (!ids.length) return [];

  const CONCURRENCY = 5;
  const results = [];
  let completed = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(id => fetchWorkById(id, apiKey))
    );

    for (const outcome of settled) {
      completed++;
      if (outcome.status === 'fulfilled' && outcome.value !== null) {
        results.push(outcome.value);
      }
    }

    if (onProgress) {
      onProgress(completed, ids.length);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 5. fetchBibtex  – doi.org → Crossref fallback
// ---------------------------------------------------------------------------

/**
 * Retrieve BibTeX for a DOI.
 *
 * @param {string}      doi   – e.g. "10.1234/example" or "https://doi.org/10.1234/example"
 * @param {string|null} [email=null]
 * @returns {Promise<string|null>} BibTeX string or null
 */
async function fetchBibtex(doi, email = null) {
  // Normalise DOI – strip any https://doi.org/ prefix
  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '');
  const userAgent = `OpenAlexPWA/1.0${email ? ` (mailto:${email})` : ''}`;

  // --- Attempt 1: doi.org content negotiation ---
  try {
    const resp = await fetch(`https://doi.org/${cleanDoi}`, {
      headers: {
        'Accept': 'application/x-bibtex',
        'User-Agent': userAgent,
      },
      redirect: 'follow',
    });

    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('@')) {
        return text.trim();
      }
    }
  } catch (err) {
    console.warn('fetchBibtex doi.org attempt failed:', err);
  }

  // --- Attempt 2: Crossref API fallback ---
  try {
    const resp = await fetch(
      `https://api.crossref.org/works/${cleanDoi}/transform/application/x-bibtex`,
      {
        headers: {
          'Accept': 'application/x-bibtex',
          'User-Agent': userAgent,
        },
        redirect: 'follow',
      }
    );

    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('@')) {
        return text.trim();
      }
    }
  } catch (err) {
    console.warn('fetchBibtex Crossref fallback failed:', err);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { searchWorks, fetchWorkById, fetchRelatedWorks, fetchBibtex, workToDict };
