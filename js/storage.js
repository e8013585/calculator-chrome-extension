/**
 * storage.js
 * Wrapper around chrome.storage.local for all persistence needs.
 * Provides typed getters/setters for each stored value.
 */

'use strict';

const Storage = (() => {

  const KEYS = {
    EXPRESSION:     'calc_expression',
    RESULT:         'calc_result',
    MODE:           'calc_mode',           // 'basic' | 'scientific'
    THEME:          'calc_theme',          // 'light' | 'dark' | 'contrast'
    LANGUAGE:       'calc_language',       // language code string
    NUMERAL_SYSTEM: 'calc_numeral_system', // numeral system key string
    HISTORY:        'calc_history'         // array of {expression, result, timestamp}
  };

  const DEFAULTS = {
    [KEYS.EXPRESSION]:     '',
    [KEYS.RESULT]:         '0',
    [KEYS.MODE]:           'basic',
    [KEYS.THEME]:          'light',
    [KEYS.LANGUAGE]:       'en',
    [KEYS.NUMERAL_SYSTEM]: 'western',
    [KEYS.HISTORY]:        []
  };

  /**
   * Load all stored values, merging with defaults.
   * Returns a Promise resolving to the state object.
   */
  function loadAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(Object.values(KEYS), (items) => {
        const state = {};
        for (const [key, storageKey] of Object.entries(KEYS)) {
          state[key.toLowerCase()] = (items[storageKey] !== undefined)
            ? items[storageKey]
            : DEFAULTS[storageKey];
        }
        // Ensure history is always an array
        if (!Array.isArray(state.history)) state.history = [];
        resolve(state);
      });
    });
  }

  /**
   * Save an object of key→value pairs to chrome.storage.local.
   * Keys should be from KEYS.
   */
  function save(updates) {
    const toSave = {};
    for (const [k, v] of Object.entries(updates)) {
      // Accept both the constant name and the storage key directly
      const storageKey = KEYS[k.toUpperCase()] || k;
      toSave[storageKey] = v;
    }
    return new Promise((resolve) => {
      chrome.storage.local.set(toSave, resolve);
    });
  }

  /**
   * Add a history entry. Keeps only the last 20 entries.
   */
  async function addHistory(expression, result) {
    const stored = await new Promise(resolve => {
      chrome.storage.local.get(KEYS.HISTORY, items => {
        resolve(items[KEYS.HISTORY] || []);
      });
    });

    const entry = {
      expression: expression,
      result: result,
      timestamp: Date.now()
    };

    // Prepend new entry, keep only last 20
    const updated = [entry, ...stored].slice(0, 20);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [KEYS.HISTORY]: updated }, () => resolve(updated));
    });
  }

  /**
   * Clear all history entries.
   */
  function clearHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [KEYS.HISTORY]: [] }, resolve);
    });
  }

  /**
   * Get just the history array.
   */
  function getHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.get(KEYS.HISTORY, (items) => {
        const h = items[KEYS.HISTORY];
        resolve(Array.isArray(h) ? h : []);
      });
    });
  }

  /**
   * Save the current session state (expression, result, mode, theme, lang, numeral).
   */
  function saveSession(state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({
        [KEYS.EXPRESSION]:     state.expression     || '',
        [KEYS.RESULT]:         state.result         || '0',
        [KEYS.MODE]:           state.mode           || 'basic',
        [KEYS.THEME]:          state.theme          || 'light',
        [KEYS.LANGUAGE]:       state.language       || 'en',
        [KEYS.NUMERAL_SYSTEM]: state.numeralSystem  || 'western'
      }, resolve);
    });
  }

  return {
    KEYS,
    DEFAULTS,
    loadAll,
    save,
    addHistory,
    clearHistory,
    getHistory,
    saveSession
  };
})();