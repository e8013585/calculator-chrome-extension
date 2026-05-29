/**
 * popup.js
 * Main UI controller for the Calc extension popup.
 * Wires together: DOM events, calculator state, storage, i18n, numerals.
 * Handles: button clicks, keyboard input, theme switching, panel toggling,
 *          history rendering, settings, display updates, persistence.
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   DOM ELEMENT REFERENCES
═══════════════════════════════════════════════════════════════════════════ */
const DOM = {
  body:              document.getElementById('app-body'),
  wrapper:           document.getElementById('app-wrapper'),
  // Display
  displayExpression: document.getElementById('display-expression'),
  displayResult:     document.getElementById('display-result'),
  romanNote:         document.getElementById('roman-note'),
  // Top bar
  btnHistoryOpen:    document.getElementById('btn-history'),
  btnModeToggle:     document.getElementById('btn-mode-toggle'),
  modeLabel:         document.getElementById('mode-label'),
  btnSettingsOpen:   document.getElementById('btn-settings'),
  btnBackspace:      document.getElementById('btn-backspace'),
  btnCopy:           document.getElementById('btn-copy'),
  themeBtns:         document.querySelectorAll('.theme-btn'),
  // Buttons
  calcButtons:       document.getElementById('calc-buttons'),
  sciSection:        document.getElementById('sci-section'),
  basicSection:      document.getElementById('basic-section'),
  btnClear:          document.getElementById('btn-clear'),
  // History panel
  historyPanel:      document.getElementById('history-panel'),
  historyList:       document.getElementById('history-list'),
  historyTitleLabel: document.getElementById('history-title-label'),
  btnHistoryClear:   document.getElementById('btn-history-clear'),
  btnHistoryClose:   document.getElementById('btn-history-close'),
  // Settings panel
  settingsPanel:     document.getElementById('settings-panel'),
  settingsTitleLabel:document.getElementById('settings-title-label'),
  btnSettingsClose:  document.getElementById('btn-settings-close'),
  labelTheme:        document.getElementById('label-theme'),
  labelLanguage:     document.getElementById('label-language'),
  labelNumerals:     document.getElementById('label-numerals'),
  settingsThemeBtns: document.querySelectorAll('.settings-theme-btn'),
  selectLanguage:    document.getElementById('select-language'),
  selectNumerals:    document.getElementById('select-numerals'),
  // Overlay
  panelOverlay:      document.getElementById('panel-overlay'),
};

/* ═══════════════════════════════════════════════════════════════════════════
   APPLICATION STATE
═══════════════════════════════════════════════════════════════════════════ */
let calc = null;         // Calculator instance
let appState = {
  mode:          'basic',
  theme:         'light',
  language:      'en',
  numeralSystem: 'western',
  historyOpen:   false,
  settingsOpen:  false,
};

/* ═══════════════════════════════════════════════════════════════════════════
   INITIALISATION
═══════════════════════════════════════════════════════════════════════════ */
async function init() {
  // Load persisted state
  const stored = await Storage.loadAll();

  appState.mode          = stored.mode          || 'basic';
  appState.theme         = stored.theme         || 'light';
  appState.language      = stored.language      || 'en';
  appState.numeralSystem = stored.numeral_system || stored.numeralSystem || 'western';

  // Create calculator instance with stored session
  calc = Calculator.create({
    expression:    stored.expression    || '',
    displayResult: stored.result        || '0',
    mode:          appState.mode,
    theme:         appState.theme,
    language:      appState.language,
    numeralSystem: appState.numeralSystem,
  });

  // Restore last numeric result if available
  if (stored.result && stored.result !== '0') {
    const num = parseFloat(stored.result);
    if (!isNaN(num)) {
      calc.setResult(stored.result);
    }
  }

  // Populate dropdowns
  populateLanguageDropdown();
  populateNumeralDropdown();

  // Apply stored selections to dropdowns
  DOM.selectLanguage.value = appState.language;
  DOM.selectNumerals.value = appState.numeralSystem;

  // Apply theme, mode, language
  applyTheme(appState.theme);
  applyMode(appState.mode);
  applyLanguage(appState.language);

  // Render display
  updateDisplay();

  // Attach all event listeners
  attachButtonListeners();
  attachDisplayListeners();
  attachTopBarListeners();
  attachPanelListeners();
  attachSettingsListeners();
  attachKeyboardListener();

  // Focus the window so keyboard events work immediately
  window.focus();
}

/* ═══════════════════════════════════════════════════════════════════════════
   DISPLAY UPDATE
═══════════════════════════════════════════════════════════════════════════ */
function updateDisplay() {
  const state = calc.getState();

  // Expression line
  const exprDisplay = calc.getDisplayExpression();
  DOM.displayExpression.textContent = exprDisplay
    ? Numerals.toDisplayNumerals(exprDisplay, appState.numeralSystem)
    : '';

  // Result line
  let resultText;
  if (state.hasError) {
    resultText = state.displayResult;
    DOM.displayResult.classList.add('error-state');
  } else {
    DOM.displayResult.classList.remove('error-state');
    resultText = calc.getDisplayResult();
  }

  DOM.displayResult.textContent = resultText;

  // Roman numeral note
  if (calc.isRomanDecimal()) {
    DOM.romanNote.textContent = I18n.t(appState.language, 'romanDecimalNote');
    DOM.romanNote.style.display = 'block';
  } else {
    DOM.romanNote.style.display = 'none';
  }

  // Auto-shrink result font
  autoShrinkResult(resultText);

  // Update clear button label: AC when expression is empty, C otherwise
  updateClearBtn();
}

function autoShrinkResult(text) {
  const len = (text || '').length;
  DOM.displayResult.classList.remove('shrink-1', 'shrink-2', 'shrink-3');
  if (len > 20) DOM.displayResult.classList.add('shrink-3');
  else if (len > 14) DOM.displayResult.classList.add('shrink-2');
  else if (len > 10) DOM.displayResult.classList.add('shrink-1');
}

function updateClearBtn() {
  const state = calc.getState();
  const isEmpty = !state.expression && !state.hasError;
  DOM.btnClear.textContent = isEmpty
    ? I18n.t(appState.language, 'btnAllClear')
    : I18n.t(appState.language, 'btnClear');
}

function flashResult() {
  DOM.displayResult.classList.remove('shake');
  // Trigger reflow
  void DOM.displayResult.offsetWidth;
}

function shakeError() {
  DOM.displayResult.classList.remove('shake');
  void DOM.displayResult.offsetWidth;
  DOM.displayResult.classList.add('shake');
  setTimeout(() => DOM.displayResult.classList.remove('shake'), 400);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CALCULATOR ACTIONS
═══════════════════════════════════════════════════════════════════════════ */
function handleAction(action, data = {}) {
  const prevError = calc.getState().hasError;

  switch (action) {
    case 'digit':
      calc.inputDigit(data.digit);
      break;

    case 'decimal':
      calc.inputDecimal();
      break;

    case 'operator':
      calc.inputOperator(data.op);
      break;

    case 'equals':
      handleEquals();
      return; // handleEquals manages its own flow

    case 'clear':
      calc.clear();
      break;

    case 'backspace':
      calc.backspace();
      break;

    case 'toggle-sign':
      calc.toggleSign();
      break;

    case 'percent':
      calc.inputPercent();
      break;

    case 'sqrt':
      calc.inputSqrt();
      break;

    case 'square':
      calc.inputSquare();
      break;

    case 'cube':
      calc.inputCube();
      break;

    case 'cbrt':
      calc.inputCbrt();
      break;

    case 'reciprocal':
      calc.inputReciprocal();
      break;

    case 'factorial':
      calc.inputFactorial();
      break;

    case 'power':
      calc.inputPower();
      break;

    case 'logn':
      calc.inputLogN();
      break;

    case 'mod':
      calc.inputMod();
      break;

    case 'exp-notation':
      calc.inputEXP();
      break;

    case 'openparen':
      calc.inputOpenParen();
      break;

    case 'closeparen':
      calc.inputCloseParen();
      break;

    case 'fn':
      calc.inputFunction(data.fn);
      break;

    case 'const':
      calc.inputConstant(data.const);
      break;

    default:
      console.warn('Unknown action:', action);
      return;
  }

  // Check for newly introduced error
  const newError = calc.getState().hasError;
  if (newError && !prevError) shakeError();

  updateDisplay();
  saveSession();
}

async function handleEquals() {
  // Visual pulse on equals button
  const equalsBtn = DOM.calcButtons.querySelector('[data-action="equals"]');
  if (equalsBtn) {
    equalsBtn.classList.remove('pulse');
    void equalsBtn.offsetWidth;
    equalsBtn.classList.add('pulse');
    setTimeout(() => equalsBtn.classList.remove('pulse'), 200);
  }

  const state = calc.getState();
  if (state.expression.trim() === '' || state.hasError) {
    if (state.hasError) { calc.clear(); updateDisplay(); saveSession(); }
    return;
  }

  const evalResult = calc.evaluate();

  if (evalResult) {
    // Add to history
    await Storage.addHistory(evalResult.expression, evalResult.result);
  } else {
    const errorState = calc.getState();
    if (errorState.hasError) shakeError();
  }

  updateDisplay();
  saveSession();
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUTTON EVENT LISTENERS
═══════════════════════════════════════════════════════════════════════════ */
function attachButtonListeners() {
  DOM.calcButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('.calc-btn');
    if (!btn) return;

    const action = btn.dataset.action;
    if (!action) return;

    // Gather data attributes
    const data = {
      digit:  btn.dataset.digit,
      op:     btn.dataset.op,
      fn:     btn.dataset.fn,
      const:  btn.dataset.const,
    };

    handleAction(action, data);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   DISPLAY LISTENERS
═══════════════════════════════════════════════════════════════════════════ */
function attachDisplayListeners() {
  DOM.btnBackspace.addEventListener('click', () => {
    handleAction('backspace');
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOP BAR LISTENERS
═══════════════════════════════════════════════════════════════════════════ */
function attachTopBarListeners() {
  // History toggle
  DOM.btnHistoryOpen.addEventListener('click', () => {
    openPanel('history');
  });

  // Mode toggle
  DOM.btnModeToggle.addEventListener('click', () => {
    const newMode = appState.mode === 'basic' ? 'scientific' : 'basic';
    applyMode(newMode);
    calc.setMode(newMode);
    saveSession();
  });

  // Settings toggle
  DOM.btnSettingsOpen.addEventListener('click', () => {
    openPanel('settings');
  });

  // Theme buttons (top bar)
  DOM.themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      saveSession();
    });
  });

  // Copy button
  DOM.btnCopy.addEventListener('click', () => {
    copyToClipboard();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANEL LISTENERS (History & Settings)
═══════════════════════════════════════════════════════════════════════════ */
function attachPanelListeners() {
  // History close
  DOM.btnHistoryClose.addEventListener('click', () => closePanel('history'));

  // History clear
  DOM.btnHistoryClear.addEventListener('click', async () => {
    await Storage.clearHistory();
    renderHistory([]);
  });

  // Settings close
  DOM.btnSettingsClose.addEventListener('click', () => closePanel('settings'));

  // Overlay click closes any open panel
  DOM.panelOverlay.addEventListener('click', () => {
    closePanel('history');
    closePanel('settings');
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS LISTENERS
═══════════════════════════════════════════════════════════════════════════ */
function attachSettingsListeners() {
  // Settings theme buttons
  DOM.settingsThemeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      saveSession();
    });
  });

  // Language select
  DOM.selectLanguage.addEventListener('change', () => {
    const lang = DOM.selectLanguage.value;
    appState.language = lang;
    calc.setLanguage(lang);
    applyLanguage(lang);
    updateDisplay();
    saveSession();
  });

  // Numeral system select
  DOM.selectNumerals.addEventListener('change', () => {
    const sys = DOM.selectNumerals.value;
    appState.numeralSystem = sys;
    calc.setNumeralSystem(sys);
    updateDisplay();
    saveSession();
    // Re-render history with new numeral system
    Storage.getHistory().then(h => renderHistory(h));
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   KEYBOARD SUPPORT
═══════════════════════════════════════════════════════════════════════════ */
function attachKeyboardListener() {
  document.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(e) {
  // Don't intercept when a panel is open and focus is in a select/input
  if (appState.historyOpen || appState.settingsOpen) {
    if (e.key === 'Escape') {
      if (appState.historyOpen)  closePanel('history');
      if (appState.settingsOpen) closePanel('settings');
    }
    return;
  }

  // Ctrl+C — copy
  if (e.ctrlKey && e.key === 'c') {
    e.preventDefault();
    copyToClipboard();
    return;
  }

  // Prevent browser shortcuts from interfering
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  let action = null;
  let data = {};
  let btnSelector = null;

  switch (e.key) {
    // Digits
    case '0': case 'Numpad0': action = 'digit'; data.digit = '0'; btnSelector = '[data-digit="0"]'; break;
    case '1': case 'Numpad1': action = 'digit'; data.digit = '1'; btnSelector = '[data-digit="1"]'; break;
    case '2': case 'Numpad2': action = 'digit'; data.digit = '2'; btnSelector = '[data-digit="2"]'; break;
    case '3': case 'Numpad3': action = 'digit'; data.digit = '3'; btnSelector = '[data-digit="3"]'; break;
    case '4': case 'Numpad4': action = 'digit'; data.digit = '4'; btnSelector = '[data-digit="4"]'; break;
    case '5': case 'Numpad5': action = 'digit'; data.digit = '5'; btnSelector = '[data-digit="5"]'; break;
    case '6': case 'Numpad6': action = 'digit'; data.digit = '6'; btnSelector = '[data-digit="6"]'; break;
    case '7': case 'Numpad7': action = 'digit'; data.digit = '7'; btnSelector = '[data-digit="7"]'; break;
    case '8': case 'Numpad8': action = 'digit'; data.digit = '8'; btnSelector = '[data-digit="8"]'; break;
    case '9': case 'Numpad9': action = 'digit'; data.digit = '9'; btnSelector = '[data-digit="9"]'; break;

    // Operators
    case '+': case 'NumpadAdd':
      action = 'operator'; data.op = '+'; btnSelector = '[data-op="+"]'; break;
    case '-': case 'NumpadSubtract':
      action = 'operator'; data.op = '-'; btnSelector = '[data-op="-"]'; break;
    case '*': case 'NumpadMultiply':
      action = 'operator'; data.op = '*'; btnSelector = '[data-op="*"]'; break;
    case '/': case 'NumpadDivide':
      e.preventDefault();
      action = 'operator'; data.op = '/'; btnSelector = '[data-op="/"]'; break;

    // Equals / Enter
    case '=': case 'Enter': case 'NumpadEnter':
      action = 'equals'; btnSelector = '[data-action="equals"]'; break;

    // Decimal
    case '.': case ',': case 'NumpadDecimal':
      action = 'decimal'; btnSelector = '[data-action="decimal"]'; break;

    // Clear
    case 'Escape':
      action = 'clear'; btnSelector = '[data-action="clear"]'; break;
    case 'c': case 'C':
      if (!e.ctrlKey) { action = 'clear'; btnSelector = '[data-action="clear"]'; }
      break;
    case 'Delete':
      action = 'clear'; btnSelector = '[data-action="clear"]'; break;

    // Backspace
    case 'Backspace':
      action = 'backspace'; break;

    // Percent
    case '%':
      action = 'percent'; break;
    case 'F1':
      action = 'percent'; break;

    // Square root
    case 'F2':
      action = 'sqrt'; break;

    // Toggle sign
    case 'F3':
      action = 'toggle-sign'; break;

    // Parentheses
    case '(':
      action = 'openparen'; btnSelector = '[data-action="openparen"]'; break;
    case ')':
      action = 'closeparen'; btnSelector = '[data-action="closeparen"]'; break;

    // Power
    case '^':
      action = 'power'; break;

    default:
      return; // Don't prevent default for unrecognised keys
  }

  e.preventDefault();

  if (action) {
    // Flash the corresponding button
    if (btnSelector) {
      const btn = DOM.calcButtons.querySelector(btnSelector);
      if (btn) flashButton(btn);
    }
    handleAction(action, data);
  }
}

function flashButton(btn) {
  btn.classList.add('btn-flash');
  setTimeout(() => btn.classList.remove('btn-flash'), 120);
}

/* ═══════════════════════════════════════════════════════════════════════════
   THEME APPLICATION
═══════════════════════════════════════════════════════════════════════════ */
function applyTheme(theme) {
  // Remove old theme class
  DOM.body.classList.remove('theme-light', 'theme-dark', 'theme-contrast');
  DOM.body.classList.add(`theme-${theme}`);
  appState.theme = theme;
  calc && calc.setTheme(theme);

  // Update top-bar theme buttons
  DOM.themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  // Update settings theme buttons
  DOM.settingsThemeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODE APPLICATION (Basic / Scientific)
═══════════════════════════════════════════════════════════════════════════ */
function applyMode(mode) {
  DOM.body.classList.remove('mode-basic', 'mode-scientific');
  DOM.body.classList.add(`mode-${mode}`);
  appState.mode = mode;

  // Update mode toggle label
  const isScientific = mode === 'scientific';
  DOM.modeLabel.textContent = isScientific
    ? I18n.t(appState.language, 'modeBasic')      // Shows "Basic" (what it will switch TO)
    : I18n.t(appState.language, 'modeScientific'); // Shows "Scientific" (what it will switch TO)
}

/* ═══════════════════════════════════════════════════════════════════════════
   LANGUAGE APPLICATION
═══════════════════════════════════════════════════════════════════════════ */
function applyLanguage(lang) {
  appState.language = lang;
  const t = (key) => I18n.t(lang, key);

  // Panel titles
  DOM.historyTitleLabel.textContent  = t('historyTitle');
  DOM.settingsTitleLabel.textContent = t('settingsTitle');

  // Settings labels
  DOM.labelTheme.textContent    = t('settingsTheme');
  DOM.labelLanguage.textContent = t('settingsLanguage');
  DOM.labelNumerals.textContent = t('settingsNumerals');

  // Settings theme buttons
  document.getElementById('settings-theme-light').textContent    = `☀️ ${t('themeLight')}`;
  document.getElementById('settings-theme-dark').textContent     = `🌙 ${t('themeDark')}`;
  document.getElementById('settings-theme-contrast').textContent = `◑ ${t('themeContrast')}`;

  // History panel footer
  DOM.btnHistoryClear.textContent = t('historyClear');

  // Tooltips
  DOM.btnHistoryOpen.title  = t('tooltipHistory');
  DOM.btnSettingsOpen.title = t('tooltipSettings');
  DOM.btnCopy.title         = t('tooltipCopy');
  DOM.btnModeToggle.title   = t('tooltipMode');

  // Mode label (reflects current mode)
  applyMode(appState.mode);

  // Clear button
  updateClearBtn();

  // Roman note (if visible)
  if (DOM.romanNote.style.display !== 'none') {
    DOM.romanNote.textContent = t('romanDecimalNote');
  }

  // Re-render history list text (empty state message)
  Storage.getHistory().then(h => renderHistory(h));
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANEL MANAGEMENT
═══════════════════════════════════════════════════════════════════════════ */
function openPanel(which) {
  if (which === 'history') {
    // Load and render latest history
    Storage.getHistory().then(h => renderHistory(h));
    DOM.historyPanel.classList.add('open');
    DOM.historyPanel.setAttribute('aria-hidden', 'false');
    appState.historyOpen = true;
  } else if (which === 'settings') {
    DOM.settingsPanel.classList.add('open');
    DOM.settingsPanel.setAttribute('aria-hidden', 'false');
    appState.settingsOpen = true;
  }

  DOM.panelOverlay.classList.add('visible');
  DOM.panelOverlay.setAttribute('aria-hidden', 'false');
}

function closePanel(which) {
  // Move focus away before hiding panel to avoid aria-hidden focus error
  if (DOM[which === 'history' ? 'historyPanel' : 'settingsPanel'].contains(document.activeElement)) {
    document.activeElement.blur();
  }

  if (which === 'history') {
    DOM.historyPanel.classList.remove('open');
    DOM.historyPanel.setAttribute('aria-hidden', 'true');
    appState.historyOpen = false;
  } else if (which === 'settings') {
    DOM.settingsPanel.classList.remove('open');
    DOM.settingsPanel.setAttribute('aria-hidden', 'true');
    appState.settingsOpen = false;
  }

  // Hide overlay only if both panels are closed
  if (!appState.historyOpen && !appState.settingsOpen) {
    DOM.panelOverlay.classList.remove('visible');
    DOM.panelOverlay.setAttribute('aria-hidden', 'true');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   HISTORY RENDERING
═══════════════════════════════════════════════════════════════════════════ */
function renderHistory(history) {
  const list = DOM.historyList;
  list.innerHTML = '';

  if (!history || history.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'history-empty';
    emptyEl.textContent = I18n.t(appState.language, 'historyEmpty');
    list.appendChild(emptyEl);
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');

    // Expression line
    const exprEl = document.createElement('div');
    exprEl.className = 'history-expr';
    exprEl.textContent = Numerals.toDisplayNumerals(
      entry.expression || '',
      appState.numeralSystem
    );

    // Result line
    const resultEl = document.createElement('div');
    resultEl.className = 'history-result';
    const numResult = parseFloat(entry.result);
    resultEl.textContent = isNaN(numResult)
      ? entry.result
      : Numerals.formatResult(numResult, appState.numeralSystem);

    // Timestamp
    const timeEl = document.createElement('div');
    timeEl.className = 'history-time';
    if (entry.timestamp) {
      timeEl.textContent = formatTimestamp(entry.timestamp);
    }

    item.appendChild(exprEl);
    item.appendChild(resultEl);
    item.appendChild(timeEl);

    // Click to restore
    const restore = () => {
      calc.setResult(entry.result);
      updateDisplay();
      saveSession();
      closePanel('history');
    };

    item.addEventListener('click', restore);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        restore();
      }
    });

    list.appendChild(item);
  });
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1)    return 'Just now';
  if (diffMins < 60)   return `${diffMins}m ago`;
  if (diffHours < 24)  return `${diffHours}h ago`;
  if (diffDays < 7)    return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ═══════════════════════════════════════════════════════════════════════════
   DROPDOWN POPULATION
═══════════════════════════════════════════════════════════════════════════ */
function populateLanguageDropdown() {
  const languages = I18n.getLanguageList();
  DOM.selectLanguage.innerHTML = '';
  languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    DOM.selectLanguage.appendChild(opt);
  });
}

function populateNumeralDropdown() {
  const systems = Numerals.getSystemList();
  DOM.selectNumerals.innerHTML = '';
  systems.forEach(sys => {
    const opt = document.createElement('option');
    opt.value = sys.key;
    opt.textContent = sys.name;
    DOM.selectNumerals.appendChild(opt);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIPBOARD
═══════════════════════════════════════════════════════════════════════════ */
function copyToClipboard() {
  const state = calc.getState();
  // Copy the Western Arabic result (not display numerals) for usability
  const textToCopy = state.hasError
    ? ''
    : (state.lastResult !== null
        ? Calculator.formatNumber(state.lastResult)
        : DOM.displayResult.textContent);

  if (!textToCopy) return;

  navigator.clipboard.writeText(textToCopy).then(() => {
    // Visual feedback
    DOM.btnCopy.classList.add('copied');
    // Change icon temporarily to checkmark
    DOM.btnCopy.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>`;
    setTimeout(() => {
      DOM.btnCopy.classList.remove('copied');
      DOM.btnCopy.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>`;
    }, 1500);
  }).catch(() => {
    // Fallback for older/restricted contexts
    try {
      const ta = document.createElement('textarea');
      ta.value = textToCopy;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   PERSISTENCE
═══════════════════════════════════════════════════════════════════════════ */
function saveSession() {
  const state = calc.getState();
  Storage.saveSession({
    expression:    state.expression,
    result:        state.lastResult !== null
                     ? Calculator.formatNumber(state.lastResult)
                     : state.displayResult,
    mode:          appState.mode,
    theme:         appState.theme,
    language:      appState.language,
    numeralSystem: appState.numeralSystem,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   ENTRY POINT
═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);