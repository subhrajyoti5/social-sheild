/**
 * SocialShield IndexedDB Database Module
 * Handles all persistent storage for accounts, relationships, and actions.
 */

const DB_NAME = 'socialshield';
const DB_VERSION = 1;

const STORES = {
  ACCOUNTS: 'accounts',
  RELATIONSHIPS: 'relationships',
  ACTIONS: 'actions',
  IMPORTS: 'imports'
};

class Database {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORES.ACCOUNTS)) {
          const accountStore = db.createObjectStore(STORES.ACCOUNTS, { keyPath: 'id' });
          accountStore.createIndex('username', 'username', { unique: true });
          accountStore.createIndex('status', 'status', { unique: false });
          accountStore.createIndex('degree', 'degree', { unique: false });
          accountStore.createIndex('source', 'source', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.RELATIONSHIPS)) {
          const relStore = db.createObjectStore(STORES.RELATIONSHIPS, {
            keyPath: 'id',
            autoIncrement: true
          });
          relStore.createIndex('from', 'from', { unique: false });
          relStore.createIndex('to', 'to', { unique: false });
          relStore.createIndex('type', 'type', { unique: false });
          relStore.createIndex('fromTo', ['from', 'to'], { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.ACTIONS)) {
          const actionStore = db.createObjectStore(STORES.ACTIONS, {
            keyPath: 'id',
            autoIncrement: true
          });
          actionStore.createIndex('accountId', 'accountId', { unique: false });
          actionStore.createIndex('type', 'type', { unique: false });
          actionStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.IMPORTS)) {
          db.createObjectStore(STORES.IMPORTS, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  /** Create a transaction and return the object store. */
  _store(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  /** Wrap an IDBRequest in a Promise. */
  _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Accounts ──────────────────────────────────────────────

  async addAccount(account) {
    return this._req(this._store(STORES.ACCOUNTS, 'readwrite').put(account));
  }

  async addAccounts(accounts) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.ACCOUNTS, 'readwrite');
      const store = tx.objectStore(STORES.ACCOUNTS);
      let added = 0;
      let skipped = 0;

      tx.oncomplete = () => resolve({ added, skipped });
      tx.onerror = () => reject(tx.error);

      for (const account of accounts) {
        const req = store.put(account);
        req.onsuccess = () => added++;
        req.onerror = (e) => { skipped++; e.preventDefault(); };
      }
    });
  }

  async getAccount(id) {
    return this._req(this._store(STORES.ACCOUNTS).get(id));
  }

  async getAccountByUsername(username) {
    const index = this._store(STORES.ACCOUNTS).index('username');
    return this._req(index.get(username));
  }

  async getAllAccounts() {
    return this._req(this._store(STORES.ACCOUNTS).getAll());
  }

  async getAccountsByStatus(status) {
    const index = this._store(STORES.ACCOUNTS).index('status');
    return this._req(index.getAll(status));
  }

  async getAccountsByDegree(degree) {
    const index = this._store(STORES.ACCOUNTS).index('degree');
    return this._req(index.getAll(degree));
  }

  async updateAccount(id, updates) {
    const existing = await this.getAccount(id);
    if (!existing) throw new Error(`Account ${id} not found`);
    const updated = { ...existing, ...updates, id };
    return this._req(this._store(STORES.ACCOUNTS, 'readwrite').put(updated));
  }

  async deleteAccount(id) {
    return this._req(this._store(STORES.ACCOUNTS, 'readwrite').delete(id));
  }

  // ─── Relationships ────────────────────────────────────────

  async addRelationship(relationship) {
    return this._req(this._store(STORES.RELATIONSHIPS, 'readwrite').put(relationship));
  }

  async addRelationships(relationships) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.RELATIONSHIPS, 'readwrite');
      const store = tx.objectStore(STORES.RELATIONSHIPS);
      let added = 0;

      tx.oncomplete = () => resolve({ added });
      tx.onerror = () => reject(tx.error);

      for (const rel of relationships) {
        store.put(rel);
        added++;
      }
    });
  }

  async getRelationshipsFrom(accountId) {
    const index = this._store(STORES.RELATIONSHIPS).index('from');
    return this._req(index.getAll(accountId));
  }

  async getRelationshipsTo(accountId) {
    const index = this._store(STORES.RELATIONSHIPS).index('to');
    return this._req(index.getAll(accountId));
  }

  async getAllRelationships() {
    return this._req(this._store(STORES.RELATIONSHIPS).getAll());
  }

  async getRelationship(fromId, toId) {
    const index = this._store(STORES.RELATIONSHIPS).index('fromTo');
    return this._req(index.get([fromId, toId]));
  }

  // ─── Actions ──────────────────────────────────────────────

  async addAction(action) {
    return this._req(
      this._store(STORES.ACTIONS, 'readwrite').put({
        ...action,
        timestamp: action.timestamp || Date.now()
      })
    );
  }

  async getActionsByAccount(accountId) {
    const index = this._store(STORES.ACTIONS).index('accountId');
    return this._req(index.getAll(accountId));
  }

  async getAllActions() {
    return this._req(this._store(STORES.ACTIONS).getAll());
  }

  async getActionsByType(type) {
    const index = this._store(STORES.ACTIONS).index('type');
    return this._req(index.getAll(type));
  }

  // ─── Imports ──────────────────────────────────────────────

  async addImportLog(importLog) {
    return this._req(
      this._store(STORES.IMPORTS, 'readwrite').put({
        ...importLog,
        timestamp: importLog.timestamp || Date.now()
      })
    );
  }

  async getImportLogs() {
    return this._req(this._store(STORES.IMPORTS).getAll());
  }

  // ─── Statistics ───────────────────────────────────────────

  async getStats() {
    const accounts = await this.getAllAccounts();
    const relationships = await this.getAllRelationships();
    const actions = await this.getAllActions();

    const byDegree = { 1: 0, 2: 0, 3: 0 };
    const byStatus = {};

    for (const account of accounts) {
      if (account.degree >= 1 && account.degree <= 3) {
        byDegree[account.degree]++;
      }
      byStatus[account.status] = (byStatus[account.status] || 0) + 1;
    }

    return {
      totalAccounts: accounts.length,
      totalRelationships: relationships.length,
      totalActions: actions.length,
      byDegree,
      byStatus,
      pendingReview: byStatus['pending_review'] || 0,
      excluded: byStatus['excluded'] || 0
    };
  }

  // ─── Clear all data ───────────────────────────────────────

  async clearAll() {
    const names = Object.values(STORES);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(names, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const name of names) tx.objectStore(name).clear();
    });
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }
}

export { Database, STORES, DB_NAME };

