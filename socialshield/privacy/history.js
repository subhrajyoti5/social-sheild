/**
 * SocialShield — Action History
 * Local audit log of all privacy actions.
 */

export class ActionHistory {
  constructor(database) {
    this.database = database;
  }

  async getAll() {
    const actions = await this.database.getAllActions();
    return actions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  async getByAccount(accountId) {
    const actions = await this.database.getActionsByAccount(accountId);
    return actions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  async getByType(type) {
    const actions = await this.database.getActionsByType(type);
    return actions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  async getSummary() {
    const actions = await this.database.getAllActions();
    const s = { total: actions.length, blocks: 0, restricts: 0, exclusions: 0, recentActions: [] };
    for (const a of actions) {
      if (a.type === 'block') s.blocks++;
      else if (a.type === 'restrict') s.restricts++;
      else if (a.type === 'exclude') s.exclusions++;
    }
    s.recentActions = actions
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 10);
    return s;
  }

  async exportHistory() {
    const actions = await this.getAll();
    return {
      exportedAt: new Date().toISOString(),
      totalActions: actions.length,
      actions: actions.map(a => ({
        ...a,
        timestampISO: new Date(a.timestamp).toISOString()
      }))
    };
  }

  async hasAction(accountId, type) {
    const actions = await this.database.getActionsByAccount(accountId);
    return actions.some(a => a.type === type);
  }

  async getLastAction(accountId) {
    const actions = await this.database.getActionsByAccount(accountId);
    if (actions.length === 0) return null;
    return actions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
  }
}

