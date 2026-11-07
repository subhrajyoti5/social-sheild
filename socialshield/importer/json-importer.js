/**
 * SocialShield — JSON Importer
 * Parses JSON files: relationship lists, account lists, Instagram exports,
 * and SocialShield graph exports.
 */

import {
  parseRelationshipBatch,
  parseInstagramExport
} from '../graph/relationship-parser.js';
import {
  deduplicateAccounts,
  deduplicateRelationships,
  normaliseUsername,
  generateAccountId,
  buildProfileUrl
} from '../graph/deduplicate.js';

/* ── Format detection ────────────────────────────────────── */

function detectFormat(data) {
  if (data.relationships_followers || data.relationships_following) return 'instagram_export';
  if (Array.isArray(data) && data.length > 0 && data[0].string_list_data) return 'instagram_followers_list';
  if (data.accounts && data.relationships) return 'socialshield_export';
  if (Array.isArray(data) && data.length > 0) {
    const f = data[0];
    if (f.from || f.source_user || f.follower) return 'relationship_list';
    if (f.username || f.user || f.name) return 'account_list';
  }
  if (data.followers || data.following) return 'follower_following_lists';
  return 'unknown';
}

/* ── Public API ──────────────────────────────────────────── */

/**
 * Import a JSON file.
 * @param {File}     file
 * @param {object}   [options]
 * @param {string}   [options.contextUsername]
 * @param {function} [options.onProgress]
 * @returns {Promise<object>}
 */
export async function importJSON(file, options = {}) {
  const { contextUsername = null, onProgress = null } = options;
  const t0 = Date.now();

  const text = await _readFile(file);
  if (!text || !text.trim()) return _fail('File is empty');
  if (text.length > 50 * 1024 * 1024) return _fail('File exceeds 50 MB limit');

  let data;
  try { data = JSON.parse(text); }
  catch (e) { return _fail(`Invalid JSON: ${e.message}`); }

  if (onProgress) onProgress({ phase: 'detecting', total: 0, processed: 0 });

  const format = detectFormat(data);
  let accounts = [];
  let relationships = [];
  let errors = [];
  let totalRecords = 0;

  switch (format) {

    /* ── Instagram export (official download) ─────────── */
    case 'instagram_export':
    case 'instagram_followers_list': {
      if (!contextUsername) return _fail('Instagram export requires your username. Please provide your Instagram username.', format);
      const r = parseInstagramExport(
        format === 'instagram_followers_list' ? data : data,
        contextUsername
      );
      accounts = r.accounts;
      relationships = r.relationships;
      errors = r.errors;
      totalRecords = accounts.length;
      break;
    }

    /* ── SocialShield re-import ───────────────────────── */
    case 'socialshield_export':
      accounts = (data.accounts || []).map(a => ({ ...a, source: a.source || 'socialshield_import' }));
      relationships = data.relationships || [];
      totalRecords = accounts.length + relationships.length;
      break;

    /* ── Generic relationship list ────────────────────── */
    case 'relationship_list': {
      const r = parseRelationshipBatch(data, 'json_import');
      accounts = r.accounts;
      relationships = r.relationships;
      errors = r.errors.map(e => e.error);
      totalRecords = data.length;
      break;
    }

    /* ── Generic account list ─────────────────────────── */
    case 'account_list': {
      accounts = data.map(item => {
        const u = normaliseUsername(item.username || item.user || item.name || item.handle);
        if (!u) return null;
        return {
          id: generateAccountId(u), username: u,
          profileUrl: buildProfileUrl(u), source: 'json_import',
          status: 'pending_review', evidence: [], degree: null,
          discoveredAt: Date.now()
        };
      }).filter(Boolean);
      totalRecords = data.length;

      if (contextUsername) {
        const cn = normaliseUsername(contextUsername);
        if (cn) {
          const cid = generateAccountId(cn);
          for (const a of accounts) {
            relationships.push({ from: cid, to: a.id, type: 'unknown', source: 'json_import' });
          }
          accounts.push({
            id: cid, username: cn, profileUrl: buildProfileUrl(cn),
            source: 'json_import', status: 'pending_review',
            evidence: [], degree: 0, discoveredAt: Date.now()
          });
        }
      }
      break;
    }

    /* ── { followers: [...], following: [...] } format ── */
    case 'follower_following_lists': {
      if (!contextUsername) return _fail('This format requires your username as context.', format);
      const cn = normaliseUsername(contextUsername);
      const cid = generateAccountId(cn);

      const _push = (list, relType) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
          const u = normaliseUsername(typeof item === 'string' ? item : item.username);
          if (!u) continue;
          const aid = generateAccountId(u);
          accounts.push({
            id: aid, username: u, profileUrl: buildProfileUrl(u),
            source: 'json_import', status: 'pending_review',
            evidence: [], degree: null, discoveredAt: Date.now()
          });
          relationships.push({
            from: relType === 'followed_by' ? aid : cid,
            to: relType === 'followed_by' ? cid : aid,
            type: relType, source: 'json_import'
          });
        }
      };

      _push(data.followers, 'followed_by');
      _push(data.following, 'follows');

      accounts.push({
        id: cid, username: cn, profileUrl: buildProfileUrl(cn),
        source: 'json_import', status: 'pending_review',
        evidence: [], degree: 0, discoveredAt: Date.now()
      });
      totalRecords = (data.followers || []).length + (data.following || []).length;
      break;
    }

    default:
      return _fail(
        'Unrecognised JSON format. Expected: relationship list, account list, Instagram export, or SocialShield export.',
        format
      );
  }

  const dedupA = deduplicateAccounts(accounts);
  const dedupR = deduplicateRelationships(relationships);

  return {
    success: true, format,
    accounts: dedupA.accounts,
    relationships: dedupR.relationships,
    stats: {
      total: totalRecords,
      valid: dedupA.accounts.length,
      invalid: errors.length,
      duplicatesRemoved: dedupA.duplicatesRemoved + dedupR.duplicatesRemoved,
      accountsFound: dedupA.accounts.length,
      relationshipsFound: dedupR.relationships.length
    },
    errors,
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

function _fail(error, format) {
  return {
    success: false, error, format,
    stats: { total: 0, valid: 0, invalid: 0, duplicatesRemoved: 0 }
  };
}

export { detectFormat };

