/**
 * SocialShield — Background Service Worker
 * Manages the side panel lifecycle and routes messages between
 * content scripts and the side panel.
 */

// Open the side panel when the toolbar icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.error('SocialShield: failed to open side panel', e);
  }
});

/* ── Message routing ─────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'INSTAGRAM_PROFILE_DETECTED':
      // Forward profile detection to any listening side-panel contexts
      broadcastToSidePanel(message);
      sendResponse({ received: true });
      return true;

    case 'OPEN_INSTAGRAM_PROFILE':
      openInstagramProfile(message.username, message.url)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_ACTIVE_TAB_PROFILE':
      getActiveTabProfile()
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'NAVIGATE_TAB':
      navigateActiveTab(message.url)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
  }
});

/* ── Helpers ─────────────────────────────────────────────── */

async function broadcastToSidePanel(message) {
  try {
    // Chrome ≥116 supports getContexts
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] });
    if (contexts.length > 0) {
      chrome.runtime.sendMessage(message).catch(() => {});
    }
  } catch {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
}

async function openInstagramProfile(username, url) {
  const profileUrl = url || `https://www.instagram.com/${username}/`;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('instagram.com')) {
      await chrome.tabs.update(tab.id, { url: profileUrl });
    } else {
      await chrome.tabs.create({ url: profileUrl });
    }
  } catch {
    await chrome.tabs.create({ url: profileUrl });
  }
}

async function getActiveTabProfile() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('instagram.com')) {
      return { isInstagram: false, username: null };
    }
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_PROFILE' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ isInstagram: true, username: null, error: 'Content script not ready' });
        } else {
          resolve(response || { isInstagram: true, username: null });
        }
      });
    });
  } catch (e) {
    return { isInstagram: false, error: e.message };
  }
}

async function navigateActiveTab(url) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) { await chrome.tabs.update(tab.id, { url }); return { success: true }; }
  return { success: false, error: 'No active tab' };
}

/* ── Install / Update ────────────────────────────────────── */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('SocialShield installed');
  } else if (details.reason === 'update') {
    console.log('SocialShield updated to', chrome.runtime.getManifest().version);
  }
});

