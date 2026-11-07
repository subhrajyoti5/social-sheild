/**
 * SocialShield — Account Deduplication & Username Utilities
 */

/**
 * Normalise an Instagram username.
 * Handles @-prefixes, profile URLs, whitespace, and case.
 * Returns null for invalid usernames.
 */
export function normaliseUsername(input) {
  if (!input || typeof input !== 'string') return null;

  let username = input.trim().toLowerCase();

  // Extract from Instagram URL
  const urlMatch = username.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-z0-9._]+)\/?/i
  );
  if (urlMatch) username = urlMatch[1].toLowerCase();

  // Remove leading @
  username = username.replace(/^@+/, '');
  // Remove trailing slashes
  username = username.replace(/\/+$/, '');

  // Instagram usernames: letters, digits, periods, underscores — max 30 chars
  if (!/^[a-z0-9._]{1,30}$/.test(username)) return null;

  return username;
}

/** Check whether a string resolves to a valid Instagram username. */
export function isValidUsername(username) {
  return normaliseUsername(username) !== null;
}

/** Build a canonical profile URL. */
export function buildProfileUrl(username) {
  const n = normaliseUsername(username);
  return n ? `https://www.instagram.com/${n}/` : null;
}

/** Generate a deterministic ID from a normalised username. */
export function generateAccountId(username) {
  const n = normaliseUsername(username);
  if (!n) return null;
  let hash = 0;
  for (let i = 0; i < n.length; i++) {
    hash = ((hash << 5) - hash) + n.charCodeAt(i);
    hash = hash & hash;
  }
  return `ig_${n}_${Math.abs(hash).toString(36)}`;
}

/**
 * Deduplicate an array of account objects by normalised username.
 * Merges evidence from duplicates into the first-seen record.
 */
export function deduplicateAccounts(accounts) {
  const seen = new Map();
  const results = [];
  let duplicatesRemoved = 0;

  for (const account of accounts) {
    const n = normaliseUsername(account.username);
    if (!n) continue;

    if (seen.has(n)) {
      const existing = seen.get(n);
      // Merge evidence
      if (Array.isArray(account.evidence) && account.evidence.length > 0) {
        existing.evidence = [...(existing.evidence || []), ...account.evidence];
      }
      if (account.source && !existing.source) existing.source = account.source;
      duplicatesRemoved++;
    } else {
      const deduped = {
        ...account,
        username: n,
        profileUrl: buildProfileUrl(n),
        id: account.id || generateAccountId(n)
      };
      seen.set(n, deduped);
      results.push(deduped);
    }
  }

  return { accounts: results, duplicatesRemoved, totalProcessed: accounts.length };
}

/**
 * Deduplicate relationship edges (from+to+type key).
 */
export function deduplicateRelationships(relationships) {
  const seen = new Set();
  const results = [];
  let duplicatesRemoved = 0;

  for (const rel of relationships) {
    const key = `${rel.from}|${rel.to}|${rel.type}`;
    if (seen.has(key)) {
      duplicatesRemoved++;
    } else {
      seen.add(key);
      results.push(rel);
    }
  }

  return { relationships: results, duplicatesRemoved };
}

