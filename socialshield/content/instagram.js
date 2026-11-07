/**
 * SocialShield — Instagram Content Script
 * Detects Instagram profile pages and communicates with the side panel
 * and background service worker via Chrome messaging.
 *
 * This script does NOT scrape hidden data or use undocumented APIs.
 * It only reads the current page URL.
 */

(function () {
  'use strict';

  const PROFILE_RE = /^https:\/\/www\.instagram\.com\/([a-zA-Z0-9._]+)\/?(\?.*)?$/;
  const NON_PROFILE = new Set([
    'explore', 'reels', 'stories', 'direct', 'accounts',
    'emails', 'p', 'tv', 'reel', 'about', 'legal',
    'developer', 'press', 'api', 'privacy', 'terms',
    'locations', 'nametag', 'session', 'directory'
  ]);

  let currentProfileUsername = null;
  let observer = null;

  function getProfileUsername() {
    const m = window.location.href.match(PROFILE_RE);
    if (m) {
      const u = m[1].toLowerCase();
      return NON_PROFILE.has(u) ? null : u;
    }
    return null;
  }

  function isInstagramPage() {
    return window.location.hostname === 'www.instagram.com';
  }

  function sendProfileUpdate() {
    const username = getProfileUsername();
    if (username === currentProfileUsername) return;
    currentProfileUsername = username;

    chrome.runtime.sendMessage({
      type: 'INSTAGRAM_PROFILE_DETECTED',
      data: {
        username: currentProfileUsername,
        url: window.location.href,
        isProfile: currentProfileUsername !== null,
        timestamp: Date.now()
      }
    }).catch(() => { /* extension context may be invalidated */ });
  }

  /* ── Incoming messages ─────────────────────────────────── */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'GET_CURRENT_PROFILE':
        sendResponse({
          username: getProfileUsername(),
          url: window.location.href,
          isProfile: getProfileUsername() !== null,
          isInstagram: isInstagramPage()
        });
        return true;

      case 'NAVIGATE_TO_PROFILE':
        if (message.username) {
          window.location.href = `https://www.instagram.com/${message.username}/`;
          sendResponse({ success: true });
        } else if (message.url) {
          window.location.href = message.url;
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No username or URL' });
        }
        return true;

      case 'PING':
        sendResponse({ alive: true, isInstagram: isInstagramPage() });
        return true;
    }
  });

  /* ── SPA navigation detection ──────────────────────────── */

  function watchUrlChanges() {
    let lastUrl = window.location.href;
    observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        sendProfileUpdate();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', sendProfileUpdate);
  }

  /* ── Init ──────────────────────────────────────────────── */

  if (!isInstagramPage()) return;
  sendProfileUpdate();
  if (document.body) watchUrlChanges();
  else document.addEventListener('DOMContentLoaded', watchUrlChanges);
})();

