/**
 * SocialShield — Relationship Parser
 * Converts raw imported data into standardised graph edges and account stubs.
 */

import {
  normaliseUsername,
  generateAccountId,
  buildProfileUrl
} from './deduplicate.js';

/* ── Relationship type constants ───────────────────────────── */

export const RELATIONSHIP_TYPES = {
  FOLLOWS: 'follows',
  FOLLOWED_BY: 'followed_by',
  MUTUAL: 'mutual',
  UNKNOWN: 'unknown'
};

/* ── Internal helpers ──────────────────────────────────────── */

function parseRelationshipType(typeStr) {
  if (!typeStr) return RELATIONSHIP_TYPES.UNKNOWN;
  const t = String(typeStr).toLowerCase().trim();
  if (['follows', 'following', 'follow'].includes(t)) return RELATIONSHIP_TYPES.FOLLOWS;
  if (['followed_by', 'follower', 'followed'].includes(t)) return RELATIONSHIP_TYPES.FOLLOWED_BY;
  if (['mutual', 'mutual_follow', 'friends', 'mutual_following'].includes(t)) return RELATIONSHIP_TYPES.MUTUAL;
  return RELATIONSHIP_TYPES.UNKNOWN;
}

function createAccountStub(username, source) {
  return {
    id: generateAccountId(username),
    username,
    profileUrl: buildProfileUrl(username),
    source,
    status: 'pending_review',
    evidence: [],
    degree: null,
    discoveredAt: Date.now()
  };
}

/* ── Public API ────────────────────────────────────────────── */

/**
 * Parse a single raw relationship record.
 * Accepts various field names (from/source_user/follower → from, etc.)
 */
export function parseRelationship(record, source = 'user_import') {
  const fromUsername = normaliseUsername(
    record.from || record.source_user || record.follower
  );
  const toUsername = normaliseUsername(
    record.to || record.target_user || record.following
  );

  if (!fromUsername || !toUsername) {
    return { valid: false, error: 'Invalid username(s)', record };
  }
  if (fromUsername === toUsername) {
    return { valid: false, error: 'Self-relationship', record };
  }

  return {
    valid: true,
    relationship: {
      from: generateAccountId(fromUsername),
      to: generateAccountId(toUsername),
      fromUsername,
      toUsername,
      type: parseRelationshipType(record.type || record.relationship || record.relation),
      source,
      timestamp: record.timestamp || Date.now()
    },
    accounts: [
      createAccountStub(fromUsername, source),
      createAccountStub(toUsername, source)
    ]
  };
}

/**
 * Parse a batch of raw records and return aggregated results.
 */
export function parseRelationshipBatch(records, source = 'user_import') {
  const results = {
    relationships: [],
    accounts: [],
    errors: [],
    stats: { total: records.length, valid: 0, invalid: 0 }
  };

  for (const record of records) {
    const parsed = parseRelationship(record, source);
    if (parsed.valid) {
      results.relationships.push(parsed.relationship);
      results.accounts.push(...parsed.accounts);
      results.stats.valid++;
    } else {
      results.errors.push(parsed);
      results.stats.invalid++;
    }
  }

  return results;
}

/**
 * Parse an Instagram data-download export (JSON).
 * Supports the official "followers_and_following" structures.
 */
export function parseInstagramExport(data, ownerUsername) {
  const results = { relationships: [], accounts: [], errors: [] };
  const owner = normaliseUsername(ownerUsername);
  if (!owner) { results.errors.push('Invalid owner username'); return results; }

  function extractUsername(entry) {
    if (typeof entry === 'string') return normaliseUsername(entry);
    if (entry.string_list_data) {
      for (const item of entry.string_list_data) {
        if (item.value) return normaliseUsername(item.value);
        if (item.href) {
          const m = item.href.match(/instagram\.com\/([^/]+)/);
          if (m) return normaliseUsername(m[1]);
        }
      }
    }
    return normaliseUsername(entry.username || entry.value || entry.name || null);
  }

  function processEntries(entries, relType) {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      const username = extractUsername(entry);
      if (!username) continue;
      const from = relType === 'followed_by' ? username : owner;
      const to = relType === 'followed_by' ? owner : username;
      const parsed = parseRelationship({ from, to, type: relType }, 'instagram_export');
      if (parsed.valid) {
        results.relationships.push(parsed.relationship);
        results.accounts.push(...parsed.accounts);
      }
    }
  }

  // Followers
  processEntries(data.relationships_followers, 'followed_by');
  if (Array.isArray(data) && data.length > 0 && !data.relationships_followers) {
    processEntries(data, 'followed_by');
  }

  // Following
  processEntries(data.relationships_following, 'follows');

  return results;
}

