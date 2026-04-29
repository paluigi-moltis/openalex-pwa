// ============================================
// IndexedDB Database Layer — Dexie.js
// ============================================

// Dexie is loaded globally via CDN in index.html
const Dexie = window.Dexie;

// ---------- Schema ----------
const db = new Dexie('OpenAlexLibrary');
db.version(1).stores({
  works: '++id, doi, openalexId, title, publication_year, cited_by_count, date_added',
  authors: '++id, name',
  workAuthors: '[workId+authorId], workId, authorId, position',
  workKeywords: '[workId+keyword], workId, keyword',
  workTags: '[workId+tag], workId, tag',
  workRelationships: '[workId+relatedId+relationship], workId, relatedId, relationship',
  settings: 'key'
});

// ---------- Helper: enrich a work with relations ----------

async function enrichWork(work) {
  const authors = await db.workAuthors
    .where('workId').equals(work.id)
    .sortBy('position');

  const authorDetails = [];
  for (const wa of authors) {
    const author = await db.authors.get(wa.authorId);
    if (author) {
      authorDetails.push({ ...author, position: wa.position });
    }
  }

  const keywords = (await db.workKeywords
    .where('workId').equals(work.id)
    .toArray())
    .map(r => r.keyword);

  const tags = (await db.workTags
    .where('workId').equals(work.id)
    .toArray())
    .map(r => r.tag);

  const relationships = await db.workRelationships
    .where('workId').equals(work.id)
    .toArray();

  return {
    ...work,
    authors: authorDetails,
    keywords,
    tags,
    relationships,
    hasBibtex: !!work.bibtex
  };
}

// ---------- 1. addWork ----------

async function addWork(workDict) {
  // Check for duplicate by openalexId
  if (workDict.openalexId) {
    const existing = await db.works.where('openalexId').equals(workDict.openalexId).first();
    if (existing) return existing.id;
  }

  // Insert the work
  const workId = await db.works.add({
    doi: workDict.doi || null,
    openalexId: workDict.openalexId || null,
    title: workDict.title || '',
    publication_year: workDict.publication_year || null,
    type: workDict.type || null,
    cited_by_count: workDict.cited_by_count || 0,
    relevance_score: workDict.relevance_score || null,
    abstract: workDict.abstract || '',
    journal: workDict.journal || null,
    bibtex: null,
    notes: null,
    date_added: new Date().toISOString()
  });

  // Authors
  if (Array.isArray(workDict.authors)) {
    for (const a of workDict.authors) {
      // Upsert author by openalex id if available, otherwise by name
      let authorId;
      if (a.id) {
        const existing = await db.authors.get(Number(a.id));
        if (existing) {
          authorId = existing.id;
        } else {
          authorId = await db.authors.add({
            name: a.name || '',
            orcid: a.orcid || null
          });
        }
      } else {
        // No numeric id — just add by name
        authorId = await db.authors.add({
          name: a.name || '',
          orcid: a.orcid || null
        });
      }

      await db.workAuthors.add({
        workId,
        authorId,
        position: a.position ?? 0
      });
    }
  }

  // Keywords
  if (Array.isArray(workDict.keywords)) {
    for (const kw of workDict.keywords) {
      await db.workKeywords.add({ workId, keyword: kw });
    }
  }

  // Related works and referenced works
  const relItems = [
    ...(workDict.related_works || []).map(r => ({ ...r, _defaultRel: 'related' })),
    ...(workDict.referenced_works || []).map(r => ({ ...r, _defaultRel: 'references' }))
  ];

  for (const rel of relItems) {
    await db.workRelationships.add({
      workId,
      relatedId: rel.id,
      relationship: rel.relationship || rel._defaultRel || 'related'
    });
  }

  return workId;
}

// ---------- 2. removeWork ----------

async function removeWork(id) {
  await db.workAuthors.where('workId').equals(id).delete();
  await db.workKeywords.where('workId').equals(id).delete();
  await db.workTags.where('workId').equals(id).delete();
  await db.workRelationships.where('workId').equals(id).delete();
  await db.works.delete(id);
}

// ---------- 3. removeWorks ----------

async function removeWorks(ids) {
  for (const id of ids) {
    await removeWork(id);
  }
}

// ---------- 4. listWorks ----------

async function listWorks({ search, keyword, tag, sortBy } = {}) {
  let works;

  if (keyword) {
    const keywordWorkIds = (await db.workKeywords
      .where('keyword').equals(keyword)
      .toArray())
      .map(r => r.workId);
    works = await db.works.where('id').anyOf(keywordWorkIds).toArray();
  } else if (tag) {
    const tagWorkIds = (await db.workTags
      .where('tag').equals(tag)
      .toArray())
      .map(r => r.workId);
    works = await db.works.where('id').anyOf(tagWorkIds).toArray();
  } else {
    works = await db.works.toArray();
  }

  // Text search filter
  if (search) {
    const q = search.toLowerCase();
    works = works.filter(w =>
      (w.title && w.title.toLowerCase().includes(q)) ||
      (w.abstract && w.abstract.toLowerCase().includes(q))
    );
  }

  // Sort
  const sortKey = sortBy || 'date_added';
  works.sort((a, b) => {
    switch (sortKey) {
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'publication_year':
        return (b.publication_year || 0) - (a.publication_year || 0);
      case 'cited_by_count':
        return (b.cited_by_count || 0) - (a.cited_by_count || 0);
      case 'date_added':
      default:
        return (b.date_added || '').localeCompare(a.date_added || '');
    }
  });

  // Enrich each work with relations
  const enriched = [];
  for (const w of works) {
    enriched.push(await enrichWork(w));
  }

  return enriched;
}

// ---------- 5. getWork ----------

async function getWork(id) {
  const work = await db.works.get(id);
  if (!work) return null;
  return enrichWork(work);
}

// ---------- 6. setBibtex ----------

async function setBibtex(id, bibtex) {
  await db.works.update(id, { bibtex });
}

// ---------- 7. setNotes ----------

async function setNotes(id, notes) {
  await db.works.update(id, { notes });
}

// ---------- 8. setAbstract ----------

async function setAbstract(id, abstract) {
  await db.works.update(id, { abstract });
}

// ---------- 9. setTags ----------

async function setTags(workId, tags) {
  await db.workTags.where('workId').equals(workId).delete();
  if (Array.isArray(tags)) {
    for (const t of tags) {
      await db.workTags.add({ workId, tag: t });
    }
  }
}

// ---------- 10. exportBibtex ----------

async function exportBibtex(ids) {
  const works = await db.works.where('id').anyOf(ids).toArray();
  const entries = works.map(w => w.bibtex).filter(Boolean);
  return entries.join('\n\n');
}

// ---------- 11. getSetting / setSetting ----------

async function getSetting(key) {
  const row = await db.settings.get(key);
  return row ? row.value : undefined;
}

async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

// ---------- 12. getAllKeywords ----------

async function getAllKeywords() {
  const rows = await db.workKeywords.toArray();
  const set = new Set(rows.map(r => r.keyword));
  return [...set].sort();
}

// ---------- 13. getAllTags ----------

async function getAllTags() {
  const rows = await db.workTags.toArray();
  const set = new Set(rows.map(r => r.tag));
  return [...set].sort();
}

// ---------- 14. isWorkSaved ----------

async function isWorkSaved(openalexId) {
  const count = await db.works.where('openalexId').equals(openalexId).count();
  return count > 0;
}

// ---------- Exports ----------

export {
  db,
  addWork,
  removeWork,
  removeWorks,
  listWorks,
  getWork,
  setBibtex,
  setNotes,
  setAbstract,
  setTags,
  exportBibtex,
  getSetting,
  setSetting,
  getAllKeywords,
  getAllTags,
  isWorkSaved
};
