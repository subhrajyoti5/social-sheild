import { CandidateManager, CANDIDATE_STATUS } from '../privacy/candidate-manager.js';
import { ActionReview } from '../privacy/action-review.js';
import { ActionHistory } from '../privacy/history.js';

// In-memory mock of the Database class for testing
class MockDatabase {
  constructor() {
    this.accounts = new Map();
    this.relationships = [];
    this.actions = [];
  }

  async addAccount(a) { this.accounts.set(a.id, { ...a }); return a; }
  async getAccount(id) { return this.accounts.get(id) || null; }
  async getAllAccounts() { return Array.from(this.accounts.values()); }
  async getAccountsByStatus(status) {
    return Array.from(this.accounts.values()).filter(a => a.status === status);
  }
  async updateAccount(id, updates) {
    const existing = this.accounts.get(id);
    if (!existing) throw new Error(`Not found: ${id}`);
    const updated = { ...existing, ...updates, id };
    this.accounts.set(id, updated);
    return updated;
  }
  async addAction(action) {
    const a = { ...action, id: this.actions.length + 1 };
    this.actions.push(a);
    return a;
  }
  async getAllActions() { return [...this.actions]; }
  async getActionsByAccount(id) { return this.actions.filter(a => a.accountId === id); }
  async getActionsByType(type) { return this.actions.filter(a => a.type === type); }
}

export async function runPrivacyTests(test) {
  await test('CandidateManager marks accounts for block, restrict, and exclude', async (assert) => {
    const db = new MockDatabase();
    await db.addAccount({ id: 'acc1', username: 'user1', status: CANDIDATE_STATUS.PENDING_REVIEW });
    await db.addAccount({ id: 'acc2', username: 'user2', status: CANDIDATE_STATUS.PENDING_REVIEW });

    const manager = new CandidateManager(db);

    // Mark for block
    await manager.markForBlock(['acc1']);
    const acc1 = await db.getAccount('acc1');
    assert.equal(acc1.status, CANDIDATE_STATUS.BLOCK_CANDIDATE);

    // Mark for restrict
    await manager.markForRestrict(['acc2']);
    const acc2 = await db.getAccount('acc2');
    assert.equal(acc2.status, CANDIDATE_STATUS.RESTRICT_CANDIDATE);

    // Exclude
    await manager.excludeAccounts(['acc1']);
    const acc1Excluded = await db.getAccount('acc1');
    assert.equal(acc1Excluded.status, CANDIDATE_STATUS.EXCLUDED);
    assert.equal(acc1Excluded.previousStatus, CANDIDATE_STATUS.BLOCK_CANDIDATE);

    // Undo exclusion
    await manager.undoExclusion('acc1');
    const acc1Restored = await db.getAccount('acc1');
    assert.equal(acc1Restored.status, CANDIDATE_STATUS.BLOCK_CANDIDATE);
  });

  await test('ActionReview enforces confirmation and prevents duplicate blocks', async (assert) => {
    const db = new MockDatabase();
    await db.addAccount({ id: 'acc1', username: 'user1', profileUrl: 'https://ig/user1', status: 'pending_review' });

    const manager = new CandidateManager(db);
    const review = new ActionReview(manager, db);

    // Prepare block
    const prep = await review.prepareBlockAction('acc1');
    assert.equal(prep.canProceed, true);
    assert.equal(prep.type, 'block');
    assert.ok(review.hasPendingAction());

    // Confirm
    const confirmed = await review.confirmAction();
    assert.equal(confirmed.success, true);
    assert.equal(review.hasPendingAction(), false);

    // Account should now be marked blocked
    const acc = await db.getAccount('acc1');
    assert.equal(acc.status, 'blocked');

    // Attempting to block again should be rejected
    const secondPrep = await review.prepareBlockAction('acc1');
    assert.equal(secondPrep.canProceed, false);
    assert.ok(secondPrep.warning.includes('already been marked as blocked'));
  });

  await test('ActionHistory logs actions and produces accurate audit summary', async (assert) => {
    const db = new MockDatabase();
    await db.addAccount({ id: 'acc1', username: 'user1', status: 'pending_review' });
    const manager = new CandidateManager(db);
    const history = new ActionHistory(db);

    await manager.recordBlock('acc1');
    await manager.recordRestrict('acc1');

    const all = await history.getAll();
    assert.equal(all.length, 2);

    const summary = await history.getSummary();
    assert.equal(summary.total, 2);
    assert.equal(summary.blocks, 1);
    assert.equal(summary.restricts, 1);

    const hasBlock = await history.hasAction('acc1', 'block');
    assert.equal(hasBlock, true);

    const exportData = await history.exportHistory();
    assert.equal(exportData.totalActions, 2);
    assert.ok(exportData.actions[0].timestampISO);
  });
}
