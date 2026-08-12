// AI Relay · background service worker

importScripts('lib/session-store.js');

const sessionStore = globalThis.AIRelaySessionStore;
const SESSION_STORAGE_KEY = 'airelay.sessions.v1';
let persistenceQueue = Promise.resolve();

if (!sessionStore) throw new Error('AIRelaySessionStore is unavailable');

function readAllSessions() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SESSION_STORAGE_KEY], (result) => {
      resolve(result[SESSION_STORAGE_KEY] || {});
    });
  });
}

function writeAllSessions(map) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [SESSION_STORAGE_KEY]: map }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function isConversationIgnored(convId) {
  if (!convId) return Promise.resolve(false);
  return new Promise((resolve) => {
    chrome.storage.local.get(['airelay.ignoredConvs'], (result) => {
      resolve((result['airelay.ignoredConvs'] || []).includes(convId));
    });
  });
}

async function persistConversation(message) {
  const { operation, detail, meta } = message || {};
  if (!detail?.platform || (!detail?.convId && operation === 'history')) return;
  if (operation !== 'capture' && operation !== 'history') return;
  if (await isConversationIgnored(detail.convId)) return;
  const map = await readAllSessions();
  const apply = operation === 'history' ? sessionStore.handleHistory : sessionStore.handleCapture;
  await writeAllSessions(apply(map, detail, meta || {}));
}

async function deleteConversation(key) {
  if (!key) return false;
  const map = await readAllSessions();
  if (!(key in map)) return false;
  delete map[key];
  await writeAllSessions(map);
  return true;
}

function enqueuePersistence(job, sendResponse) {
  persistenceQueue = persistenceQueue.catch(() => {}).then(job);
  persistenceQueue.then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: String(error?.message || error) })
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'airelay:persist') {
    enqueuePersistence(() => persistConversation(message), sendResponse);
    return true;
  }
  if (message?.type === 'airelay:delete-session') {
    enqueuePersistence(() => deleteConversation(message.key), sendResponse);
    return true;
  }
  if (message?.type === 'airelay:clear-sessions') {
    enqueuePersistence(() => writeAllSessions({}), sendResponse);
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
