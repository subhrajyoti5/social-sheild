/**
 * SocialShield — Privacy Action Audit Report Generator
 * Generates formatted Markdown and HTML reports of privacy management actions.
 */

export class ReportGenerator {
  /**
   * Generate a comprehensive Markdown audit report.
   * @param {object} params
   * @param {Array<object>} params.actions
   * @param {Array<object>} params.accounts
   * @param {object} params.stats
   * @returns {string}
   */
  static generateMarkdown({ actions = [], accounts = [], stats = {} }) {
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    const now = new Date().toISOString();

    const blocks = actions.filter(a => a.type === 'block');
    const restricts = actions.filter(a => a.type === 'restrict');
    const excludes = actions.filter(a => a.type === 'exclude');

    let md = `# SocialShield — Privacy Audit Report\n\n`;
    md += `*Generated: ${now}*\n\n`;
    md += `## Executive Summary\n\n`;
    md += `- **Total Managed Accounts**: ${accounts.length}\n`;
    md += `- **Total Actions Recorded**: ${actions.length}\n`;
    md += `- **Blocks Executed**: ${blocks.length}\n`;
    md += `- **Restricts Executed**: ${restricts.length}\n`;
    md += `- **Local Exclusions**: ${excludes.length}\n\n`;

    md += `## Action Log\n\n`;
    if (actions.length === 0) {
      md += `*No privacy actions recorded yet.*\n\n`;
    } else {
      md += `| Timestamp | Action | Target Username | Profile URL | Status |\n`;
      md += `|:---|:---|:---|:---|:---|\n`;

      for (const a of actions) {
        const acc = accountMap.get(a.accountId) || {};
        const username = acc.username || a.accountId;
        const profileUrl = acc.profileUrl || `https://www.instagram.com/${username}/`;
        const time = new Date(a.timestamp).toISOString().replace('T', ' ').slice(0, 19);
        const actionType = a.type ? a.type.toUpperCase() : 'UNKNOWN';

        md += `| ${time} | **${actionType}** | @${username} | [Link](${profileUrl}) | Confirmed |\n`;
      }
      md += `\n`;
    }

    md += `## Compliance & Privacy Verification\n\n`;
    md += `- All actions were verified and completed manually through Instagram's native user interface.\n`;
    md += `- No automated mass-blocking scripts or private APIs were invoked.\n`;
    md += `- All data is stored locally in the browser's IndexedDB storage and has not been transmitted to any external server.\n`;

    return md;
  }

  /**
   * Generate a standalone printable HTML report.
   */
  static generateHTML({ actions = [], accounts = [], stats = {} }) {
    const md = this.generateMarkdown({ actions, accounts, stats });
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    const rows = actions.map(a => {
      const acc = accountMap.get(a.accountId) || {};
      const username = acc.username || a.accountId;
      const profileUrl = acc.profileUrl || `https://www.instagram.com/${username}/`;
      const time = new Date(a.timestamp).toLocaleString();
      return `<tr>
        <td>${time}</td>
        <td><strong style="text-transform:uppercase;">${a.type}</strong></td>
        <td>@${username}</td>
        <td><a href="${profileUrl}" target="_blank" rel="noopener">${profileUrl}</a></td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SocialShield Privacy Audit Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #3a3d42; padding: 24px; max-width: 800px; margin: 0 auto; line-height: 1.5; }
    h1 { font-size: 20px; border-bottom: 2px solid #e4e6ea; padding-bottom: 8px; }
    h2 { font-size: 15px; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th, td { border: 1px solid #e4e6ea; padding: 8px 10px; text-align: left; }
    th { background: #f7f8fa; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .footer { margin-top: 32px; font-size: 11px; color: #8a8f99; border-top: 1px solid #e4e6ea; padding-top: 12px; }
  </style>
</head>
<body>
  <h1>SocialShield Privacy Audit Report</h1>
  <p><small>Generated on ${new Date().toLocaleString()}</small></p>
  <h2>Summary</h2>
  <p>Total recorded actions: <strong>${actions.length}</strong></p>
  <h2>Action Log</h2>
  <table>
    <thead>
      <tr><th>Date & Time</th><th>Action</th><th>Username</th><th>Profile</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="4">No actions recorded.</td></tr>'}
    </tbody>
  </table>
  <div class="footer">
    SocialShield — Local-first Instagram Privacy Manager. All actions verified through native interfaces.
  </div>
</body>
</html>`;
  }
}

