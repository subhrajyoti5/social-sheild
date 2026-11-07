/**
 * SocialShield — CSV Importer
 * Parses CSV files containing relationship or account data.
 */

import { parseRelationshipBatch } from '../graph/relationship-parser.js';
import {
  deduplicateAccounts,
  deduplicateRelationships,
  normaliseUsername,
  generateAccountId,
  buildProfileUrl
} from '../graph/deduplicate.js';

/* ── CSV parsing ─────────────────────────────────────────── */

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    return { headers: [], rows: [], errors: [{ line: 0, error: 'Need header + ≥1 data row' }] };
  }

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCSVLine(lines[i]);
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] ? values[j].trim() : '';
      }
      rows.push(row);
    } catch (e) {
      errors.push({ line: i + 1, error: e.message });
    }
  }
  return { headers, rows, errors };
}

/* ── Column detection ────────────────────────────────────── */

function detectColumnMapping(headers) {
  const mapping = { from: null, to: null, type: null, singleColumn: null };
  const fromA = ['from', 'source', 'source_user', 'follower', 'from_user'];
  const toA = ['to', 'target', 'target_user', 'following', 'to_user', 'followed'];
  const typeA = ['type', 'relationship', 'relation', 'connection_type'];
  const userA = ['username', 'user', 'name', 'handle', 'account'];

  for (const h of headers) {
    if (fromA.includes(h)) mapping.from = h;
    if (toA.includes(h)) mapping.to = h;
    if (typeA.includes(h)) mapping.type = h;
  }
  if (headers.length === 1) mapping.singleColumn = headers[0];
  if (!mapping.from && !mapping.to) {
    for (const h of headers) { if (userA.includes(h)) { mapping.singleColumn = h; break; } }
  }
  return mapping;
}

/* ── Public API ──────────────────────────────────────────── */

/**
 * Import a CSV file.
 * @param {File}     file
 * @param {object}   [options]
 * @param {string}   [options.contextUsername]    Your IG username for single-column lists.
 * @param {string}   [options.defaultRelationType='unknown']
 * @param {function} [options.onProgress]
 * @returns {Promise<object>}
 */
export async function importCSV(file, options = {}) {
  const {
    contextUsername = null,
    defaultRelationType = 'unknown',
    onProgress = null
  } = options;
  const t0 = Date.now();

  const text = await _readFile(file);
  if (!text || !text.trim()) return _fail('File is empty');
  if (text.length > 10 * 1024 * 1024) return _fail('File exceeds 10 MB limit');

  const { headers, rows, errors: parseErrors } = parseCSV(text);
  if (rows.length === 0) return _fail('No data rows found in CSV');

  const mapping = detectColumnMapping(headers);
  if (onProgress) onProgress({ phase: 'parsing', total: rows.length, processed: 0 });

  const records = [];
  const accountList = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (mapping.singleColumn) {
      const username = row[mapping.singleColumn];
      if (username) {
        accountList.push({ username, source: 'csv_import' });
        if (contextUsername) {
          records.push({ from: contextUsername, to: username, type: defaultRelationType });
        }
      }
    } else if (mapping.from && mapping.to) {
      records.push({
        from: row[mapping.from],
        to: row[mapping.to],
        type: row[mapping.type] || defaultRelationType
      });
    } else {
      const vals = Object.values(row);
      if (vals.length >= 2) {
        records.push({ from: vals[0], to: vals[1], type: vals[2] || defaultRelationType });
      }
    }

    if (onProgress && i % 100 === 0) {
      onProgress({ phase: 'parsing', total: rows.length, processed: i });
    }
  }

  if (onProgress) onProgress({ phase: 'processing', total: rows.length, processed: rows.length });

  let parsedResult;
  if (records.length > 0) {
    parsedResult = parseRelationshipBatch(records, 'csv_import');
  } else {
    parsedResult = {
      relationships: [],
      accounts: accountList.map(a => ({
        id: generateAccountId(a.username),
        username: normaliseUsername(a.username),
        profileUrl: buildProfileUrl(a.username),
        source: a.source,
        status: 'pending_review',
        evidence: [],
        degree: null,
        discoveredAt: Date.now()
      })).filter(a => a.username),
      errors: [],
      stats: { total: accountList.length, valid: accountList.length, invalid: 0 }
    };
  }

  const dedupA = deduplicateAccounts(parsedResult.accounts);
  const dedupR = deduplicateRelationships(parsedResult.relationships);

  return {
    success: true,
    accounts: dedupA.accounts,
    relationships: dedupR.relationships,
    stats: {
      total: rows.length,
      valid: parsedResult.stats.valid || dedupA.accounts.length,
      invalid: parsedResult.stats.invalid || 0,
      duplicatesRemoved: dedupA.duplicatesRemoved + dedupR.duplicatesRemoved,
      accountsFound: dedupA.accounts.length,
      relationshipsFound: dedupR.relationships.length
    },
    errors: [...parseErrors, ...parsedResult.errors],
    columnMapping: mapping,
    duration: Date.now() - t0
  };
}

/* ── Helpers ─────────────────────────────────────────────── */

function _readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function _fail(error) {
  return {
    success: false,
    error,
    stats: { total: 0, valid: 0, invalid: 0, duplicatesRemoved: 0 }
  };
}

export { parseCSV, parseCSVLine, detectColumnMapping };

