/**
 * SocialShield — Candidate Manager
 * Manages account status for privacy actions (block / restrict / exclude).
 */

export const CANDIDATE_STATUS = {
  PENDING_REVIEW: 'pending_review',
  BLOCK_CANDIDATE: 'block_candidate',
  RESTRICT_CANDIDATE: 'restrict_candidate',
  EXCLUDED: 'excluded',
  BLOCKED: 'blocked',
  RESTRICTED: 'restricted'
};

export class CandidateManager {
  /** @param {Database} database */
  constructor(database) {
    this.database = database;
  }

  async getCandidatesByStatus(status) {
    return this.database.getAccountsByStatus(status);
  }

  async markForBlock(accountIds) {
    return this._bulkUpdate(accountIds, { status: CANDIDATE_STATUS.BLOCK_CANDIDATE, markedAt: Date.now() });
  }

  async markForRestrict(accountIds) {
    return this._bulkUpdate(accountIds, { status: CANDIDATE_STATUS.RESTRICT_CANDIDATE, markedAt: Date.now() });
  }

  async excludeAccounts(accountIds) {
    const results = { updated: 0, errors: [] };
    for (const id of accountIds) {
      try {
        const account = await this.database.getAccount(id);
        await this.database.updateAccount(id, {
          status: CANDIDATE_STATUS.EXCLUDED,
          previousStatus: account ? account.status : null,
          excludedAt: Date.now()
        });
        results.updated++;
      } catch (e) {
        results.errors.push({ id, error: e.message });
      }
    }
    return results;
  }

  async undoExclusion(accountId) {
    const account = await this.database.getAccount(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);
    if (account.status !== CANDIDATE_STATUS.EXCLUDED) throw new Error('Account is not excluded');
    const restore = account.previousStatus || CANDIDATE_STATUS.PENDING_REVIEW;
    await this.database.updateAccount(accountId, {
      status: restore,
      previousStatus: null,
      excludedAt: null
    });
    return { accountId, restoredStatus: restore };
  }

  async recordBlock(accountId) {
    await this.database.updateAccount(accountId, {
      status: CANDIDATE_STATUS.BLOCKED,
      blockedAt: Date.now()
    });
    await this.database.addAction({
      accountId, type: 'block', timestamp: Date.now(), confirmed: true
    });
  }

  async recordRestrict(accountId) {
    await this.database.updateAccount(accountId, {
      status: CANDIDATE_STATUS.RESTRICTED,
      restrictedAt: Date.now()
    });
    await this.database.addAction({
      accountId, type: 'restrict', timestamp: Date.now(), confirmed: true
    });
  }

  async resetToPending(accountId) {
    await this.database.updateAccount(accountId, {
      status: CANDIDATE_STATUS.PENDING_REVIEW,
      markedAt: null, blockedAt: null, restrictedAt: null,
      excludedAt: null, previousStatus: null
    });
  }

  async getSummary() {
    const accounts = await this.database.getAllAccounts();
    const s = {
      total: accounts.length,
      pendingReview: 0, blockCandidates: 0, restrictCandidates: 0,
      excluded: 0, blocked: 0, restricted: 0
    };
    for (const a of accounts) {
      switch (a.status) {
        case CANDIDATE_STATUS.PENDING_REVIEW:      s.pendingReview++; break;
        case CANDIDATE_STATUS.BLOCK_CANDIDATE:     s.blockCandidates++; break;
        case CANDIDATE_STATUS.RESTRICT_CANDIDATE:  s.restrictCandidates++; break;
        case CANDIDATE_STATUS.EXCLUDED:            s.excluded++; break;
        case CANDIDATE_STATUS.BLOCKED:             s.blocked++; break;
        case CANDIDATE_STATUS.RESTRICTED:          s.restricted++; break;
      }
    }
    return s;
  }

  /* ── internal ──────────────────────────────────────────── */

  async _bulkUpdate(ids, updates) {
    const results = { updated: 0, errors: [] };
    for (const id of ids) {
      try { await this.database.updateAccount(id, updates); results.updated++; }
      catch (e) { results.errors.push({ id, error: e.message }); }
    }
    return results;
  }
}

