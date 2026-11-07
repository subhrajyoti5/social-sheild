/**
 * SocialShield — In-Memory Graph Store
 * Adjacency-list graph backed by IndexedDB for persistence.
 */

import { normaliseUsername } from './deduplicate.js';
import { RELATIONSHIP_TYPES } from './relationship-parser.js';

export class GraphStore {
  constructor() {
    /** @type {Map<string, object>} id → account */
    this.nodes = new Map();
    /** @type {Array<object>} */
    this.edges = [];
    /** @type {Map<string, Array<object>>} id → outgoing edges */
    this.adjacencyOut = new Map();
    /** @type {Map<string, Array<object>>} id → incoming edges */
    this.adjacencyIn = new Map();
    /** @type {Map<string, string>} username → id */
    this.usernameIndex = new Map();
  }

  /* ── Persistence ────────────────────────────────────────── */

  async loadFromDatabase(database) {
    const [accounts, relationships] = await Promise.all([
      database.getAllAccounts(),
      database.getAllRelationships()
    ]);
    this.clear();
    for (const a of accounts) this.addNode(a);
    for (const r of relationships) this.addEdge(r.from, r.to, r.type, r.source);
    return { nodes: this.nodes.size, edges: this.edges.length };
  }

  /* ── Core mutations ─────────────────────────────────────── */

  clear() {
    this.nodes.clear();
    this.edges = [];
    this.adjacencyOut.clear();
    this.adjacencyIn.clear();
    this.usernameIndex.clear();
  }

  /** Add or merge a node. Returns true when node is new. */
  addNode(account) {
    if (!account.id || !account.username) return false;
    if (this.nodes.has(account.id)) {
      this.nodes.set(account.id, { ...this.nodes.get(account.id), ...account });
      return false;
    }
    this.nodes.set(account.id, { ...account });
    this.usernameIndex.set(account.username, account.id);
    if (!this.adjacencyOut.has(account.id)) this.adjacencyOut.set(account.id, []);
    if (!this.adjacencyIn.has(account.id)) this.adjacencyIn.set(account.id, []);
    return true;
  }

  /** Add a directed edge. Returns false on duplicate. */
  addEdge(fromId, toId, type = RELATIONSHIP_TYPES.UNKNOWN, source = 'unknown') {
    const existing = this.adjacencyOut.get(fromId) || [];
    if (existing.some(e => e.to === toId && e.type === type)) return false;

    const edge = { from: fromId, to: toId, type, source };
    this.edges.push(edge);
    if (!this.adjacencyOut.has(fromId)) this.adjacencyOut.set(fromId, []);
    this.adjacencyOut.get(fromId).push(edge);
    if (!this.adjacencyIn.has(toId)) this.adjacencyIn.set(toId, []);
    this.adjacencyIn.get(toId).push(edge);

    // Mutual ⇒ add reverse edge if absent
    if (type === RELATIONSHIP_TYPES.MUTUAL) {
      const rev = (this.adjacencyOut.get(toId) || []);
      if (!rev.some(e => e.to === fromId && e.type === type)) {
        const re = { from: toId, to: fromId, type, source };
        this.edges.push(re);
        if (!this.adjacencyOut.has(toId)) this.adjacencyOut.set(toId, []);
        this.adjacencyOut.get(toId).push(re);
        if (!this.adjacencyIn.has(fromId)) this.adjacencyIn.set(fromId, []);
        this.adjacencyIn.get(fromId).push(re);
      }
    }
    return true;
  }

  /* ── Queries ────────────────────────────────────────────── */

  getNode(id) { return this.nodes.get(id) || null; }

  getNodeByUsername(username) {
    const n = normaliseUsername(username);
    if (!n) return null;
    const id = this.usernameIndex.get(n);
    return id ? this.nodes.get(id) : null;
  }

  getOutNeighbors(id) {
    return (this.adjacencyOut.get(id) || [])
      .map(e => ({ account: this.nodes.get(e.to), relationship: e }))
      .filter(n => n.account);
  }

  getInNeighbors(id) {
    return (this.adjacencyIn.get(id) || [])
      .map(e => ({ account: this.nodes.get(e.from), relationship: e }))
      .filter(n => n.account);
  }

  getAllNeighbors(id) {
    const out = this.getOutNeighbors(id);
    const seen = new Set(out.map(n => n.account.id));
    const combined = [...out];
    for (const n of this.getInNeighbors(id)) {
      if (!seen.has(n.account.id)) { seen.add(n.account.id); combined.push(n); }
    }
    return combined;
  }

  getRelationshipType(fromId, toId) {
    const out = (this.adjacencyOut.get(fromId) || []).find(e => e.to === toId);
    const inc = (this.adjacencyIn.get(fromId) || []).find(e => e.from === toId);
    if (out && inc) return RELATIONSHIP_TYPES.MUTUAL;
    if (out) return out.type;
    if (inc) return inc.type;
    return null;
  }

  getAllNodes() { return Array.from(this.nodes.values()); }
  getAllEdges() { return [...this.edges]; }
  getStats() { return { nodeCount: this.nodes.size, edgeCount: this.edges.length }; }

  export() {
    return {
      accounts: this.getAllNodes(),
      relationships: this.getAllEdges(),
      exportedAt: new Date().toISOString()
    };
  }
}

