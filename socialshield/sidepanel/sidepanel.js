/**
 * SocialShield — Side Panel Application Controller
 * Wires up the UI, data import, graph analysis, account management,
 * clipboard operations, CSV export, and privacy action workflows.
 */

import { Database }         from '../storage/database.js';
import { GraphStore }       from '../graph/graph-store.js';
import { bfs }              from '../graph/bfs.js';
import { importCSV }        from '../importer/csv-importer.js';
import { importJSON }       from '../importer/json-importer.js';
import { CandidateManager, CANDIDATE_STATUS } from '../privacy/candidate-manager.js';
import { ActionReview }     from '../privacy/action-review.js';
import { ActionHistory }    from '../privacy/history.js';
import { normaliseUsername, buildProfileUrl } from '../graph/deduplicate.js';
import { GraphVisualizer }  from '../graph/graph-visualizer.js';
import { ReportGenerator }  from '../privacy/report-generator.js';

/* ══════════════════════════════════════════════════════════
   Application State
   ══════════════════════════════════════════════════════════ */

const state = {
  db: null,
  graph: new GraphStore(),
  visualizer: null,
  candidateManager: null,
  actionReview: null,
  actionHistory: null,
  currentView: 'list',      // 'list' | 'graph'
  selectedDepth: 3,
  activeFilter: 'all',
  searchQuery: '',
  selectedIds: new Set(),
  analysisResult: null,
  displayedAccounts: [],    // Current filtered/searched subset
  renderedRange: { start: 0, end: 0 },
  igConnected: false,
  igCurrentProfile: null,
  BATCH_SIZE: 60,           // Lazy-render batch size
};

/* ══════════════════════════════════════════════════════════
   DOM References
   ══════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

const dom = {};

function cacheDom() {
  const ids = [
    'dataStatus', 'btnSettings', 'igStatus', 'igStatusText',
    'targetInput', 'btnPaste', 'btnAnalyse',
    'importArea', 'fileInput', 'btnImport', 'btnImportInfo',
    'importContext', 'contextUsername',
    'importProgress', 'importProgressFill', 'importProgressText',
    'importSummary',
    'statsSection', 'statTotal', 'statDeg1', 'statDeg2', 'statDeg3',
    'statPending', 'statExcluded', 'missingDataNote',
    'filterSection', 'searchInput', 'filterBar',
    'accountListSection', 'accountList', 'listEmpty',
    'btnViewList', 'btnViewGraph', 'graphVisualizerContainer', 'selectAllContainer',
    'selectAllVisible', 'visibleCount',
    'actionBar', 'selectedCount',
    'btnCopyUsernames', 'btnCopyUrls', 'btnExportCSV',
    'btnMarkBlock', 'btnMarkRestrict', 'btnExclude', 'btnClearSelection',
    'actionModal', 'modalTitle', 'modalBody', 'modalClose',
    'modalCancel', 'modalOpenProfile', 'modalConfirm',
    'settingsModal', 'settingsClose',
    'btnViewHistory', 'btnExportGraph', 'btnClearData',
    'historyModal', 'historyClose', 'historyList', 'historyEmpty',
    'btnExportHistory', 'btnReportMD', 'btnReportHTML',
    'importInfoModal', 'importInfoClose',
    'toast'
  ];
  for (const id of ids) dom[id] = $(id);
}

/* ══════════════════════════════════════════════════════════
   Initialization
   ══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  cacheDom();
  await initDatabase();
  bindEvents();
  await refreshDataStatus();
  pollInstagramConnection();
});

async function initDatabase() {
  state.db = new Database();
  await state.db.init();
  state.candidateManager = new CandidateManager(state.db);
  state.actionReview = new ActionReview(state.candidateManager, state.db);
  state.actionHistory = new ActionHistory(state.db);
  state.visualizer = new GraphVisualizer(dom.graphVisualizerContainer, {
    onNodeClick: (node) => {
      if (node && node.username) openProfile(node.username);
    }
  });
  await state.graph.loadFromDatabase(state.db);
}

/* ══════════════════════════════════════════════════════════
   Event Binding
   ══════════════════════════════════════════════════════════ */

function bindEvents() {
  // Target input
  dom.targetInput.addEventListener('input', onTargetInputChange);
  dom.btnPaste.addEventListener('click', onPaste);
  dom.btnAnalyse.addEventListener('click', onAnalyse);

  // Depth selector
  for (const btn of document.querySelectorAll('.ss-depth-btn')) {
    btn.addEventListener('click', () => setDepth(Number(btn.dataset.depth)));
  }

  // Import
  dom.btnImport.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', onFileSelected);
  dom.btnImportInfo.addEventListener('click', () => toggleModal('importInfoModal', true));
  dom.importInfoClose.addEventListener('click', () => toggleModal('importInfoModal', false));

  // Drag & drop
  dom.importArea.addEventListener('dragover', (e) => { e.preventDefault(); dom.importArea.classList.add('ss-import-area--dragover'); });
  dom.importArea.addEventListener('dragleave', () => dom.importArea.classList.remove('ss-import-area--dragover'));
  dom.importArea.addEventListener('drop', onFileDrop);

  // Search & filter
  dom.searchInput.addEventListener('input', debounce(onSearch, 150));
  for (const btn of dom.filterBar.querySelectorAll('.ss-filter-btn')) {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  }

  // Selection
  dom.selectAllVisible.addEventListener('change', onSelectAllToggle);

  // Actions
  dom.btnCopyUsernames.addEventListener('click', copyUsernames);
  dom.btnCopyUrls.addEventListener('click', copyUrls);
  dom.btnExportCSV.addEventListener('click', exportCSV);
  dom.btnMarkBlock.addEventListener('click', markSelectedForBlock);
  dom.btnMarkRestrict.addEventListener('click', markSelectedForRestrict);
  dom.btnExclude.addEventListener('click', excludeSelected);
  dom.btnClearSelection.addEventListener('click', clearSelection);

  // Action modal
  dom.modalClose.addEventListener('click', closeActionModal);
  dom.modalCancel.addEventListener('click', closeActionModal);
  dom.modalOpenProfile.addEventListener('click', openActionProfile);
  dom.modalConfirm.addEventListener('click', confirmAction);

  // Settings
  dom.btnSettings.addEventListener('click', () => toggleModal('settingsModal', true));
  dom.settingsClose.addEventListener('click', () => toggleModal('settingsModal', false));
  dom.btnViewHistory.addEventListener('click', showHistory);
  dom.btnExportGraph.addEventListener('click', exportGraphJSON);
  dom.btnClearData.addEventListener('click', clearAllData);

  // History
  dom.historyClose.addEventListener('click', () => toggleModal('historyModal', false));
  dom.btnExportHistory.addEventListener('click', exportHistoryJSON);
  dom.btnReportMD.addEventListener('click', exportReportMD);
  dom.btnReportHTML.addEventListener('click', exportReportHTML);

  // View toggle
  dom.btnViewList.addEventListener('click', () => setView('list'));
  dom.btnViewGraph.addEventListener('click', () => setView('graph'));

  // Lazy loading
  dom.accountList.parentElement.addEventListener('scroll', onListScroll);

  // Instagram messages
  chrome.runtime.onMessage.addListener(onChromeMessage);
}

/* ══════════════════════════════════════════════════════════
   Instagram Connection
   ══════════════════════════════════════════════════════════ */

function pollInstagramConnection() {
  updateInstagramStatus();
  setInterval(updateInstagramStatus, 3000);
}

async function updateInstagramStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_PROFILE' });
    if (response && response.isInstagram) {
      state.igConnected = true;
      dom.igStatus.className = 'ss-ig-status ss-ig-status--connected';
      if (response.username) {
        state.igCurrentProfile = response.username;
        dom.igStatus.className = 'ss-ig-status ss-ig-status--profile';
        dom.igStatusText.textContent = `Viewing @${response.username}`;
      } else {
        state.igCurrentProfile = null;
        dom.igStatusText.textContent = 'Instagram connected';
      }
    } else {
      state.igConnected = false;
      state.igCurrentProfile = null;
      dom.igStatus.className = 'ss-ig-status';
      dom.igStatusText.textContent = 'Open Instagram to connect';
    }
  } catch {
    state.igConnected = false;
    dom.igStatus.className = 'ss-ig-status';
    dom.igStatusText.textContent = 'Open Instagram to connect';
  }
}

function onChromeMessage(message) {
  if (message.type === 'INSTAGRAM_PROFILE_DETECTED') {
    const data = message.data;
    state.igConnected = true;
    if (data.isProfile && data.username) {
      state.igCurrentProfile = data.username;
      dom.igStatus.className = 'ss-ig-status ss-ig-status--profile';
      dom.igStatusText.textContent = `Viewing @${data.username}`;
    } else {
      state.igCurrentProfile = null;
      dom.igStatus.className = 'ss-ig-status ss-ig-status--connected';
      dom.igStatusText.textContent = 'Instagram connected';
    }
  }
}

/* ══════════════════════════════════════════════════════════
   Target Account & Analysis
   ══════════════════════════════════════════════════════════ */

function onTargetInputChange() {
  const val = dom.targetInput.value.trim();
  dom.btnAnalyse.disabled = !val;
}

async function onPaste() {
  try {
    const text = await navigator.clipboard.readText();
    dom.targetInput.value = text;
    onTargetInputChange();
  } catch {
    toast('Unable to read clipboard', 'error');
  }
}

function setDepth(d) {
  state.selectedDepth = d;
  for (const btn of document.querySelectorAll('.ss-depth-btn')) {
    btn.classList.toggle('ss-depth-btn--active', Number(btn.dataset.depth) === d);
  }
}

async function onAnalyse() {
  const input = dom.targetInput.value.trim();
  const username = normaliseUsername(input);

  if (!username) {
    toast('Enter a valid Instagram username or profile URL', 'error');
    return;
  }

  dom.btnAnalyse.disabled = true;
  dom.btnAnalyse.textContent = 'Analysing…';

  try {
    // Reload graph from DB to get latest data
    await state.graph.loadFromDatabase(state.db);

    const result = bfs(state.graph, username, {
      maxDepth: state.selectedDepth,
      excludedIds: new Set()
    });

    state.analysisResult = result;

    if (result.success) {
      // Persist degree info to DB
      for (const account of result.accounts) {
        try {
          await state.db.updateAccount(account.id, { degree: account.degree, evidence: account.evidence });
        } catch { /* account may not exist in DB yet */ }
      }

      updateStats(result);
      state.displayedAccounts = [...result.accounts];
      state.selectedIds.clear();
      renderAccountList();
      showSections(true);
    } else {
      toast(result.error || 'Analysis failed', 'error');
      showMissingDataNote(result.error);
    }
  } catch (e) {
    toast(`Analysis error: ${e.message}`, 'error');
  } finally {
    dom.btnAnalyse.disabled = false;
    dom.btnAnalyse.textContent = 'Analyse';
  }
}

function updateStats(result) {
  dom.statTotal.textContent = result.stats.total;
  dom.statDeg1.textContent = result.stats.byDegree[1] || 0;
  dom.statDeg2.textContent = result.stats.byDegree[2] || 0;
  dom.statDeg3.textContent = result.stats.byDegree[3] || 0;

  const pending = result.accounts.filter(a => a.status === 'pending_review').length;
  const excluded = result.accounts.filter(a => a.status === 'excluded').length;
  dom.statPending.textContent = pending;
  dom.statExcluded.textContent = excluded;
}

function showMissingDataNote(msg) {
  if (msg) {
    dom.missingDataNote.textContent = msg;
    dom.missingDataNote.hidden = false;
  } else {
    dom.missingDataNote.hidden = true;
  }
}

function showSections(show) {
  dom.statsSection.hidden = !show;
  dom.filterSection.hidden = !show;
  dom.accountListSection.hidden = !show;
  dom.actionBar.hidden = !show;
}

/* ══════════════════════════════════════════════════════════
   Data Import
   ══════════════════════════════════════════════════════════ */

async function onFileSelected(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  dom.importContext.hidden = false;
  await importFiles(files);
  dom.fileInput.value = '';
}

function onFileDrop(e) {
  e.preventDefault();
  dom.importArea.classList.remove('ss-import-area--dragover');
  const files = Array.from(e.dataTransfer.files).filter(
    f => f.name.endsWith('.csv') || f.name.endsWith('.json')
  );
  if (files.length === 0) {
    toast('Only CSV and JSON files are supported', 'error');
    return;
  }
  dom.importContext.hidden = false;
  importFiles(files);
}

async function importFiles(files) {
  dom.importProgress.hidden = false;
  dom.importSummary.hidden = true;
  dom.importProgressFill.style.width = '0%';

  const contextUser = dom.contextUsername.value.trim() || null;
  let totalAccounts = 0;
  let totalRelationships = 0;
  let totalErrors = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    dom.importProgressText.textContent = `Importing ${file.name}… (${i + 1}/${files.length})`;
    dom.importProgressFill.style.width = `${((i) / files.length) * 100}%`;

    let result;
    try {
      if (file.name.endsWith('.csv')) {
        result = await importCSV(file, {
          contextUsername: contextUser,
          onProgress: (p) => {
            if (p.total > 0) {
              const pct = ((i + p.processed / p.total) / files.length) * 100;
              dom.importProgressFill.style.width = `${pct}%`;
            }
          }
        });
      } else if (file.name.endsWith('.json')) {
        result = await importJSON(file, {
          contextUsername: contextUser,
          onProgress: (p) => {
            dom.importProgressText.textContent = `Processing ${file.name}… (${p.phase})`;
          }
        });
      }
    } catch (e) {
      toast(`Error importing ${file.name}: ${e.message}`, 'error');
      totalErrors++;
      continue;
    }

    if (!result || !result.success) {
      toast(`Import failed for ${file.name}: ${result?.error || 'Unknown error'}`, 'error');
      totalErrors++;
      continue;
    }

    // Store in database
    if (result.accounts.length > 0) {
      await state.db.addAccounts(result.accounts);
      totalAccounts += result.stats.accountsFound || result.accounts.length;
    }
    if (result.relationships.length > 0) {
      await state.db.addRelationships(result.relationships);
      totalRelationships += result.stats.relationshipsFound || result.relationships.length;
    }

    // Log the import
    await state.db.addImportLog({
      filename: file.name,
      format: result.format || 'csv',
      accountsImported: result.accounts.length,
      relationshipsImported: result.relationships.length,
      errors: result.errors?.length || 0,
      timestamp: Date.now()
    });
  }

  dom.importProgressFill.style.width = '100%';
  dom.importProgressText.textContent = 'Import complete';

  // Reload graph
  await state.graph.loadFromDatabase(state.db);

  // Show summary
  dom.importSummary.innerHTML = `
    <strong>${totalAccounts}</strong> accounts · 
    <strong>${totalRelationships}</strong> relationships imported
    ${totalErrors > 0 ? ` · <span style="color:var(--ss-danger)">${totalErrors} error(s)</span>` : ''}
  `;
  dom.importSummary.hidden = false;

  setTimeout(() => { dom.importProgress.hidden = true; }, 2000);
  await refreshDataStatus();
}

async function refreshDataStatus() {
  const stats = await state.db.getStats();
  if (stats.totalAccounts > 0) {
    dom.dataStatus.textContent = `${stats.totalAccounts} accounts`;
    dom.dataStatus.className = 'ss-badge ss-badge--success';
  } else {
    dom.dataStatus.textContent = 'No data';
    dom.dataStatus.className = 'ss-badge ss-badge--neutral';
  }
}

/* ══════════════════════════════════════════════════════════
   Filtering & Search
   ══════════════════════════════════════════════════════════ */

function setFilter(filter) {
  state.activeFilter = filter;
  for (const btn of dom.filterBar.querySelectorAll('.ss-filter-btn')) {
    btn.classList.toggle('ss-filter-btn--active', btn.dataset.filter === filter);
  }
  applyFilterAndSearch();
}

function onSearch() {
  state.searchQuery = dom.searchInput.value.trim().toLowerCase();
  applyFilterAndSearch();
}

function applyFilterAndSearch() {
  if (!state.analysisResult || !state.analysisResult.accounts) return;

  let accounts = state.analysisResult.accounts;

  // Apply filter
  if (state.activeFilter !== 'all') {
    const degreeFilters = ['1', '2', '3'];
    if (degreeFilters.includes(state.activeFilter)) {
      accounts = accounts.filter(a => a.degree === Number(state.activeFilter));
    } else {
      accounts = accounts.filter(a => a.status === state.activeFilter);
    }
  }

  // Apply search
  if (state.searchQuery) {
    accounts = accounts.filter(a =>
      a.username.includes(state.searchQuery)
    );
  }

  state.displayedAccounts = accounts;
  state.renderedRange = { start: 0, end: 0 };
  renderAccountList();
}

/* ══════════════════════════════════════════════════════════
   Account List Rendering (Lazy / Virtual)
   ══════════════════════════════════════════════════════════ */

function renderAccountList() {
  dom.accountList.innerHTML = '';
  state.renderedRange = { start: 0, end: 0 };

  if (state.displayedAccounts.length === 0) {
    dom.listEmpty.hidden = false;
    dom.visibleCount.textContent = '0';
    updateSelectionUI();
    return;
  }

  dom.listEmpty.hidden = true;
  dom.visibleCount.textContent = state.displayedAccounts.length;
  renderBatch(0, Math.min(state.BATCH_SIZE, state.displayedAccounts.length));
  updateSelectionUI();
}

function renderBatch(start, end) {
  const fragment = document.createDocumentFragment();
  for (let i = start; i < end && i < state.displayedAccounts.length; i++) {
    fragment.appendChild(createAccountRow(state.displayedAccounts[i]));
  }
  dom.accountList.appendChild(fragment);
  state.renderedRange.end = end;
}

function onListScroll() {
  const container = dom.accountList.parentElement;
  const scrollBottom = container.scrollTop + container.clientHeight;
  const scrollHeight = container.scrollHeight;

  if (scrollHeight - scrollBottom < 100 && state.renderedRange.end < state.displayedAccounts.length) {
    const nextEnd = Math.min(state.renderedRange.end + state.BATCH_SIZE, state.displayedAccounts.length);
    renderBatch(state.renderedRange.end, nextEnd);
  }
}

function createAccountRow(account) {
  const row = document.createElement('div');
  row.className = 'ss-account' + (state.selectedIds.has(account.id) ? ' ss-account--selected' : '');
  row.dataset.id = account.id;

  const checked = state.selectedIds.has(account.id) ? 'checked' : '';
  const degreeClass = account.degree >= 1 && account.degree <= 3 ? `ss-account__degree--${account.degree}` : '';
  const evidenceSummary = buildEvidenceSummary(account);
  const statusBadge = buildStatusBadge(account);

  row.innerHTML = `
    <input type="checkbox" class="ss-account__check" ${checked}>
    <div class="ss-account__info">
      <div class="ss-account__username">@${escHtml(account.username)}</div>
      <div class="ss-account__meta">
        ${account.degree ? `<span class="ss-account__degree ${degreeClass}">${account.degree}°</span>` : ''}
        <span class="ss-account__source">${escHtml(account.source || '')}</span>
        ${statusBadge}
      </div>
      ${evidenceSummary ? `<div class="ss-account__evidence" title="${escHtml(evidenceSummary)}">${escHtml(evidenceSummary)}</div>` : ''}
    </div>
    <div class="ss-account__actions">
      <button class="ss-account__open-btn" data-username="${escHtml(account.username)}" title="Open profile">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
      </button>
    </div>
  `;

  // Checkbox toggle
  const checkbox = row.querySelector('.ss-account__check');
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    toggleSelection(account.id, checkbox.checked);
    row.classList.toggle('ss-account--selected', checkbox.checked);
  });

  // Row click toggles selection
  row.addEventListener('click', (e) => {
    if (e.target.closest('.ss-account__actions') || e.target.closest('.ss-account__check')) return;
    checkbox.checked = !checkbox.checked;
    toggleSelection(account.id, checkbox.checked);
    row.classList.toggle('ss-account--selected', checkbox.checked);
  });

  // Open profile button
  const openBtn = row.querySelector('.ss-account__open-btn');
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openProfile(account.username);
  });

  return row;
}

function buildEvidenceSummary(account) {
  if (!account.evidence || account.evidence.length === 0) return '';
  const last = account.evidence[account.evidence.length - 1];
  return `via @${last.from} → @${last.to} (${last.type})`;
}

function buildStatusBadge(account) {
  const s = account.status;
  if (!s || s === 'pending_review') return '';
  const classes = {
    block_candidate: 'ss-badge--danger',
    restrict_candidate: 'ss-badge--warning',
    excluded: 'ss-badge--neutral',
    blocked: 'ss-badge--danger',
    restricted: 'ss-badge--warning'
  };
  const labels = {
    block_candidate: 'Block',
    restrict_candidate: 'Restrict',
    excluded: 'Excluded',
    blocked: 'Blocked',
    restricted: 'Restricted'
  };
  return `<span class="ss-account__status ${classes[s] || 'ss-badge--neutral'}">${labels[s] || s}</span>`;
}

/* ══════════════════════════════════════════════════════════
   Selection Management
   ══════════════════════════════════════════════════════════ */

function toggleSelection(id, selected) {
  if (selected) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  updateSelectionUI();
}

function onSelectAllToggle() {
  if (dom.selectAllVisible.checked) {
    for (const a of state.displayedAccounts) state.selectedIds.add(a.id);
  } else {
    for (const a of state.displayedAccounts) state.selectedIds.delete(a.id);
  }
  rerenderSelections();
  updateSelectionUI();
}

function clearSelection() {
  state.selectedIds.clear();
  dom.selectAllVisible.checked = false;
  rerenderSelections();
  updateSelectionUI();
}

function rerenderSelections() {
  for (const row of dom.accountList.querySelectorAll('.ss-account')) {
    const id = row.dataset.id;
    const selected = state.selectedIds.has(id);
    row.classList.toggle('ss-account--selected', selected);
    row.querySelector('.ss-account__check').checked = selected;
  }
}

function updateSelectionUI() {
  const count = state.selectedIds.size;
  dom.selectedCount.textContent = count;
  dom.actionBar.hidden = !state.analysisResult;

  const hasSelection = count > 0;
  dom.btnCopyUsernames.disabled = !hasSelection;
  dom.btnCopyUrls.disabled = !hasSelection;
  dom.btnMarkBlock.disabled = !hasSelection;
  dom.btnMarkRestrict.disabled = !hasSelection;
  dom.btnExclude.disabled = !hasSelection;
}

function getSelectedAccounts() {
  if (!state.analysisResult) return [];
  return state.analysisResult.accounts.filter(a => state.selectedIds.has(a.id));
}

/* ══════════════════════════════════════════════════════════
   Clipboard & Export
   ══════════════════════════════════════════════════════════ */

async function copyUsernames() {
  const accounts = getSelectedAccounts();
  if (accounts.length === 0) return;
  const text = accounts.map(a => a.username).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast(`${accounts.length} username(s) copied`, 'success');
  } catch {
    toast('Clipboard access denied', 'error');
  }
}

async function copyUrls() {
  const accounts = getSelectedAccounts();
  if (accounts.length === 0) return;
  const text = accounts.map(a => a.profileUrl || buildProfileUrl(a.username)).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast(`${accounts.length} URL(s) copied`, 'success');
  } catch {
    toast('Clipboard access denied', 'error');
  }
}

function exportCSV() {
  const accounts = state.selectedIds.size > 0
    ? getSelectedAccounts()
    : state.displayedAccounts;

  if (accounts.length === 0) { toast('No accounts to export', 'error'); return; }

  const headers = ['username', 'profile_url', 'degree', 'source', 'status', 'evidence'];
  const rows = accounts.map(a => [
    a.username,
    a.profileUrl || buildProfileUrl(a.username),
    a.degree || '',
    a.source || '',
    a.status || '',
    buildEvidenceSummary(a)
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  downloadFile(csv, 'socialshield-export.csv', 'text/csv');
  toast(`Exported ${accounts.length} account(s)`, 'success');
}

/* ══════════════════════════════════════════════════════════
   Privacy Actions
   ══════════════════════════════════════════════════════════ */

async function markSelectedForBlock() {
  const selected = getSelectedAccounts();
  if (selected.length === 0) return;

  if (selected.length === 1) {
    // Single account → open action review modal
    await showActionReview(selected[0].id, 'block');
  } else {
    // Multiple → mark as candidates
    const result = await state.candidateManager.markForBlock(selected.map(a => a.id));
    toast(`${result.updated} account(s) marked for blocking`, 'success');
    await refreshAnalysis();
  }
}

async function markSelectedForRestrict() {
  const selected = getSelectedAccounts();
  if (selected.length === 0) return;

  if (selected.length === 1) {
    await showActionReview(selected[0].id, 'restrict');
  } else {
    const result = await state.candidateManager.markForRestrict(selected.map(a => a.id));
    toast(`${result.updated} account(s) marked for restricting`, 'success');
    await refreshAnalysis();
  }
}

async function excludeSelected() {
  const selected = getSelectedAccounts();
  if (selected.length === 0) return;
  const result = await state.candidateManager.excludeAccounts(selected.map(a => a.id));
  toast(`${result.updated} account(s) excluded`, 'success');
  clearSelection();
  await refreshAnalysis();
}

async function showActionReview(accountId, actionType) {
  let review;
  try {
    if (actionType === 'block') {
      review = await state.actionReview.prepareBlockAction(accountId);
    } else {
      review = await state.actionReview.prepareRestrictAction(accountId);
    }
  } catch (e) {
    toast(e.message, 'error');
    return;
  }

  dom.modalTitle.textContent = `${actionType === 'block' ? 'Block' : 'Restrict'} Account`;

  let bodyHtml = `<div class="ss-review-username">@${escHtml(review.account.username)}</div>`;
  if (review.warning) {
    bodyHtml += `<div class="ss-review-warning">${escHtml(review.warning)}</div>`;
  }
  if (review.canProceed && review.instructions) {
    bodyHtml += '<ol class="ss-review-instructions">';
    for (const step of review.instructions) {
      bodyHtml += `<li>${escHtml(step)}</li>`;
    }
    bodyHtml += '</ol>';
  }

  dom.modalBody.innerHTML = bodyHtml;
  dom.modalOpenProfile.hidden = !review.canProceed;
  dom.modalConfirm.hidden = true;
  dom.modalOpenProfile.dataset.username = review.account.username;

  toggleModal('actionModal', true);
}

async function openActionProfile() {
  const username = dom.modalOpenProfile.dataset.username;
  if (!username) return;
  await openProfile(username);
  dom.modalOpenProfile.hidden = true;
  dom.modalConfirm.hidden = false;
}

async function confirmAction() {
  try {
    const result = await state.actionReview.confirmAction();
    toast(`@${result.username} ${result.type}ed successfully`, 'success');
    closeActionModal();
    clearSelection();
    await refreshAnalysis();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function closeActionModal() {
  state.actionReview.cancelAction();
  toggleModal('actionModal', false);
}

async function refreshAnalysis() {
  if (!state.analysisResult) return;
  // Re-run analysis to refresh statuses
  const username = state.analysisResult.startAccount?.username;
  if (!username) return;

  await state.graph.loadFromDatabase(state.db);
  const result = bfs(state.graph, username, { maxDepth: state.selectedDepth });
  state.analysisResult = result;

  if (result.success) {
    updateStats(result);
    applyFilterAndSearch();
  }
}

/* ══════════════════════════════════════════════════════════
   Instagram Navigation
   ══════════════════════════════════════════════════════════ */

async function openProfile(username) {
  try {
    await chrome.runtime.sendMessage({
      type: 'OPEN_INSTAGRAM_PROFILE',
      username
    });
  } catch {
    // Fallback: open in new tab
    window.open(`https://www.instagram.com/${username}/`, '_blank');
  }
}

/* ══════════════════════════════════════════════════════════
   Settings & History
   ══════════════════════════════════════════════════════════ */

async function showHistory() {
  toggleModal('settingsModal', false);
  const actions = await state.actionHistory.getAll();
  const accounts = await state.db.getAllAccounts();
  const accountMap = new Map(accounts.map(a => [a.id, a]));

  if (actions.length === 0) {
    dom.historyList.innerHTML = '';
    dom.historyEmpty.hidden = false;
  } else {
    dom.historyEmpty.hidden = true;
    dom.historyList.innerHTML = actions.map(a => {
      const acc = accountMap.get(a.accountId);
      const username = acc ? acc.username : a.accountId;
      const time = new Date(a.timestamp).toLocaleString();
      return `
        <div class="ss-history-item">
          <div>
            <span class="ss-history-item__action">${escHtml(a.type)}</span>
            <span>@${escHtml(username)}</span>
          </div>
          <span class="ss-history-item__time">${escHtml(time)}</span>
        </div>
      `;
    }).join('');
  }

  toggleModal('historyModal', true);
}

async function exportGraphJSON() {
  const data = state.graph.export();
  downloadFile(JSON.stringify(data, null, 2), 'socialshield-graph.json', 'application/json');
  toast('Graph data exported', 'success');
}

async function exportHistoryJSON() {
  const data = await state.actionHistory.exportHistory();
  downloadFile(JSON.stringify(data, null, 2), 'socialshield-history.json', 'application/json');
  toast('History exported', 'success');
}

async function clearAllData() {
  if (!confirm('Delete ALL SocialShield data? This cannot be undone.')) return;
  await state.db.clearAll();
  state.graph.clear();
  state.analysisResult = null;
  state.selectedIds.clear();
  state.displayedAccounts = [];
  showSections(false);
  await refreshDataStatus();
  toggleModal('settingsModal', false);
  toast('All data deleted', 'success');
}

/* ══════════════════════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════════════════════ */

function toggleModal(id, show) {
  const el = $(id);
  if (el) el.hidden = !show;
}

function toast(message, type = '') {
  dom.toast.textContent = message;
  dom.toast.className = 'ss-toast' + (type ? ` ss-toast--${type}` : '');
  dom.toast.hidden = false;
  clearTimeout(dom.toast._timer);
  dom.toast._timer = setTimeout(() => { dom.toast.hidden = true; }, 3000);
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

