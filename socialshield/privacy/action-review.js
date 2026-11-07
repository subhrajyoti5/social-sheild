/**
 * SocialShield — Action Review
 * User-confirmation workflow for block/restrict privacy actions.
 * Every action requires explicit user confirmation and guides the user
 * through Instagram's native interface.
 */

export class ActionReview {
  constructor(candidateManager, database) {
    this.candidateManager = candidateManager;
    this.database = database;
    this.pendingAction = null;
  }

  /** Prepare a block action for user review. */
  async prepareBlockAction(accountId) {
    const account = await this.database.getAccount(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    if (account.status === 'blocked') {
      return { type: 'block', account, canProceed: false,
        warning: 'This account has already been marked as blocked.' };
    }

    this.pendingAction = {
      type: 'block', accountId: account.id,
      username: account.username, profileUrl: account.profileUrl,
      preparedAt: Date.now()
    };

    return {
      type: 'block', account, canProceed: true,
      profileUrl: account.profileUrl,
      instructions: [
        `1. The profile for @${account.username} will be opened in Instagram.`,
        '2. Click the three dots (•••) menu on their profile.',
        '3. Select "Block" from the menu.',
        '4. Confirm the block when Instagram asks.',
        '5. Return here and click "Confirm Completed" to record the action.'
      ],
      warning: `Blocking @${account.username} will prevent them from seeing your profile, posts, and stories.`
    };
  }

  /** Prepare a restrict action for user review. */
  async prepareRestrictAction(accountId) {
    const account = await this.database.getAccount(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    if (account.status === 'restricted') {
      return { type: 'restrict', account, canProceed: false,
        warning: 'This account has already been marked as restricted.' };
    }

    this.pendingAction = {
      type: 'restrict', accountId: account.id,
      username: account.username, profileUrl: account.profileUrl,
      preparedAt: Date.now()
    };

    return {
      type: 'restrict', account, canProceed: true,
      profileUrl: account.profileUrl,
      instructions: [
        `1. The profile for @${account.username} will be opened in Instagram.`,
        '2. Click the three dots (•••) menu on their profile.',
        '3. Select "Restrict" from the menu.',
        '4. Confirm the restriction when Instagram asks.',
        '5. Return here and click "Confirm Completed" to record the action.'
      ],
      warning: `Restricting @${account.username} will hide their comments and limit their interactions with your content.`
    };
  }

  /** Confirm the pending action was completed by the user. */
  async confirmAction() {
    if (!this.pendingAction) throw new Error('No pending action to confirm');
    const a = this.pendingAction;

    if (a.type === 'block') await this.candidateManager.recordBlock(a.accountId);
    else if (a.type === 'restrict') await this.candidateManager.recordRestrict(a.accountId);

    this.pendingAction = null;
    return { success: true, type: a.type, accountId: a.accountId, username: a.username, completedAt: Date.now() };
  }

  /** Cancel the pending action without recording it. */
  cancelAction() {
    const a = this.pendingAction;
    this.pendingAction = null;
    return a;
  }

  getPendingAction() { return this.pendingAction; }
  hasPendingAction() { return this.pendingAction !== null; }
}

