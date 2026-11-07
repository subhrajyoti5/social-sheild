/**
 * SocialShield — BFS Graph Traversal
 * Breadth-first search with configurable depth (max 3), cycle detection,
 * and relationship-evidence tracking.
 */

import { normaliseUsername } from './deduplicate.js';

/**
 * Run BFS from a start username through the graph.
 *
 * @param {GraphStore} graph
 * @param {string}     startUsername
 * @param {object}     [options]
 * @param {number}     [options.maxDepth=3]    1 | 2 | 3
 * @param {Set<string>}[options.excludedIds]   IDs to skip
 * @param {function}   [options.onProgress]    (info) => void
 * @returns {{ success, startAccount?, accounts, stats, error? }}
 */
export function bfs(graph, startUsername, options = {}) {
  const {
    maxDepth = 3,
    excludedIds = new Set(),
    onProgress = null
  } = options;

  const depth = Math.min(Math.max(1, maxDepth), 3);
  const normalised = normaliseUsername(startUsername);

  if (!normalised) {
    return _empty('Invalid start username');
  }

  const startNode = graph.getNodeByUsername(normalised);
  if (!startNode) {
    return _empty(`Account "${normalised}" not found in graph`);
  }

  const visited = new Set([startNode.id]);
  const discovered = [];
  const stats = { total: 0, byDegree: { 1: 0, 2: 0, 3: 0 } };

  // Seed queue with start node's direct neighbours
  const queue = [];
  for (const nb of graph.getAllNeighbors(startNode.id)) {
    if (!excludedIds.has(nb.account.id)) {
      queue.push({
        id: nb.account.id,
        degree: 1,
        path: [startNode.id],
        evidence: [_evidence(startNode, nb)]
      });
    }
  }

  while (queue.length > 0) {
    const cur = queue.shift();
    if (visited.has(cur.id) || excludedIds.has(cur.id)) continue;
    visited.add(cur.id);

    const node = graph.getNode(cur.id);
    if (!node) continue;

    discovered.push({
      ...node,
      degree: cur.degree,
      evidence: cur.evidence,
      path: [...cur.path, cur.id],
      status: node.status || 'pending_review'
    });

    stats.total++;
    if (cur.degree >= 1 && cur.degree <= 3) stats.byDegree[cur.degree]++;

    if (onProgress) {
      onProgress({ discovered: stats.total, currentDegree: cur.degree, currentAccount: node.username });
    }

    // Expand only if within depth budget
    if (cur.degree < depth) {
      for (const nb of graph.getAllNeighbors(cur.id)) {
        if (!visited.has(nb.account.id) && !excludedIds.has(nb.account.id)) {
          queue.push({
            id: nb.account.id,
            degree: cur.degree + 1,
            path: [...cur.path, cur.id],
            evidence: [...cur.evidence, _evidence(node, nb)]
          });
        }
      }
    }
  }

  return {
    success: true,
    startAccount: startNode,
    accounts: discovered,
    stats,
    traversalDepth: depth,
    nodesVisited: visited.size,
    timestamp: Date.now()
  };
}

/**
 * Quick connectivity summary (no full account data).
 */
export function analyseConnectivity(graph, startUsername) {
  const result = bfs(graph, startUsername, { maxDepth: 3 });
  if (!result.success) return result;

  const connectedDegrees = {};
  for (const a of result.accounts) {
    (connectedDegrees[a.degree] ??= []).push(a.username);
  }

  let missingData = null;
  if (graph.getAllNodes().length === 0) {
    missingData = 'No relationship data imported. Import data to discover connections.';
  } else if (result.stats.total === 0) {
    missingData = `No connections found for "${startUsername}". This account may not appear in your imported data.`;
  }

  return {
    success: true,
    startAccount: result.startAccount.username,
    totalConnected: result.stats.total,
    byDegree: result.stats.byDegree,
    connectedDegrees,
    missingData
  };
}

/* ── helpers ──────────────────────────────────────────────── */

function _empty(error) {
  return { success: false, error, accounts: [], stats: { total: 0, byDegree: { 1: 0, 2: 0, 3: 0 } } };
}

function _evidence(fromNode, neighborInfo) {
  return {
    from: fromNode.username,
    to: neighborInfo.account.username,
    type: neighborInfo.relationship.type,
    source: neighborInfo.relationship.source
  };
}

