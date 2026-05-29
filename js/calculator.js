/**
 * calculator.js
 * Core calculator state machine.
 * Manages the expression string, display updates, operator logic,
 * scientific functions, history integration, and numeral display.
 * Does NOT touch the DOM directly — calls provided callbacks.
 */

'use strict';

const Calculator = (() => {

  class CalcState {
    constructor(options = {}) {
      this.expression     = options.expression     || '';
      this.displayResult  = options.displayResult  || '0';
      this.mode           = options.mode           || 'basic';
      this.numeralSystem  = options.numeralSystem  || 'western';
      this.language       = options.language       || 'en';
      this.theme          = options.theme          || 'light';
      this.hasError       = false;
      this.justEvaluated  = false; // true after pressing =
      this.openParens     = 0;     // track unmatched open parens
      this.lastResult     = null;  // numeric value of last result
      this._expressionForDisplay = ''; // version with display operators
    }
  }

  /**
   * Sanitise and prepare expression for the parser.
   * Converts display operators back to ASCII, handles implicit multiplication.
   */
  function prepareForParsing(expr) {
    return expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/π/g, 'pi')
      .replace(/\bmod\b/gi, '%')
      .trim();
  }

  /**
   * Count open vs close parens to decide if we should auto-close.
   */
  function countParens(expr) {
    let open = 0;
    for (const ch of expr) {
      if (ch === '(') open++;
      else if (ch === ')') open--;
    }
    return open; // positive = more opens than closes
  }

  /**
   * Get the last character of the expression (ignoring whitespace).
   */
  function lastChar(expr) {
    return expr.trimEnd().slice(-1);
  }

  /**
   * Determine if the expression ends with a number or closing paren.
   */
  function endsWithNumberOrClose(expr) {
    const ch = lastChar(expr);
    return /[0-9.πe)!]/.test(ch);
  }

  /**
   * Format number for display (respects significant digits, avoids FP noise).
   */
  function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return 'Error';
    if (!isFinite(num)) return num > 0 ? 'Infinity' : '-Infinity';
    const abs = Math.abs(num);
    if (abs === 0) return '0';
    if (abs >= 1e15 || (abs < 1e-7 && abs > 0)) {
      return num.toExponential(10).replace(/\.?0+(e)/, '$1');
    }
    return parseFloat(num.toPrecision(12)).toString();
  }

  // ─── Factory function ─────────────────────────────────────────────────

  function create(initialOptions = {}) {
    const state = new CalcState(initialOptions);

    // ── Helpers ──────────────────────────────────────────────────────────

    function getDisplayExpression() {
      // Replace internal operators with prettier display versions
      return state.expression
        .replace(/\*/g, '×')
        .replace(/\//g, '÷')
        .replace(/(?<![eE])-/g, '−')  // minus but not exponent sign
        .replace(/−−/g, '−');          // simplify double negatives in display
    }

    function getDisplayResult() {
      if (state.hasError) return state.displayResult;
      return Numerals.formatResult(
        state.lastResult !== null ? state.lastResult : parseFloat(state.displayResult || '0'),
        state.numeralSystem
      );
    }

    function isRomanDecimal() {
      if (state.numeralSystem !== 'roman') return false;
      if (state.lastResult === null) return false;
      const n = state.lastResult;
      return !Number.isInteger(n) || n <= 0 || n > 3999;
    }

    // ── Input handlers ────────────────────────────────────────────────────

    /**
     * Handle digit input (0-9).
     */
    function inputDigit(digit) {
      if (state.hasError) clear();
      if (state.justEvaluated) {
        // Start fresh expression with this digit
        state.expression = digit;
        state.justEvaluated = false;
        state.lastResult = null;
      } else {
        state.expression += digit;
      }
    }

    /**
     * Handle decimal point.
     */
    function inputDecimal() {
      if (state.hasError) clear();
      if (state.justEvaluated) {
        state.expression = '0.';
        state.justEvaluated = false;
        state.lastResult = null;
        return;
      }
      // Find the current number being entered (after last operator)
      const match = state.expression.match(/[0-9.]*$/);
      const currentNum = match ? match[0] : '';
      if (currentNum.includes('.')) return; // already has decimal
      if (currentNum === '' || lastChar(state.expression) === '(') {
        state.expression += '0.';
      } else {
        state.expression += '.';
      }
    }

    /**
     * Handle operator input (+, -, *, /).
     */
    function inputOperator(op) {
      if (state.hasError) { clear(); return; }

      // Map display operators to internal
      const opMap = { '×': '*', '÷': '/', '−': '-', '+': '+', '-': '-', '*': '*', '/': '/' };
      const internalOp = opMap[op] || op;

      if (state.justEvaluated && state.lastResult !== null) {
        // Continue from result
        state.expression = formatNumber(state.lastResult) + internalOp;
        state.justEvaluated = false;
      } else if (state.expression === '') {
        // Allow leading minus
        if (internalOp === '-') state.expression = '-';
        return;
      } else {
        const lc = lastChar(state.expression);
        if ('+-*/'.includes(lc)) {
          // Replace last operator unless it's a valid sign context
          if (internalOp === '-' && lc !== '-') {
            state.expression += internalOp;
          } else {
            state.expression = state.expression.trimEnd().slice(0, -1) + internalOp;
          }
          return;
        }
        state.expression += internalOp;
      }
    }

    /**
     * Handle percent.
     */
    function inputPercent() {
      if (state.hasError) { clear(); return; }
      if (state.expression === '') return;
      // Evaluate current expression and divide by 100
      const parseExpr = prepareForParsing(state.expression);
      const { result, error } = Parser.evaluate(parseExpr);
      if (!error && result !== null) {
        const pct = result / 100;
        state.expression = formatNumber(pct);
        state.lastResult = pct;
        state.justEvaluated = false;
      }
    }

    /**
     * Evaluate the current expression.
     */
    function evaluate() {
      if (state.hasError) { clear(); return null; }
      if (state.expression.trim() === '') return null;

      // Auto-close any open parentheses
      let expr = state.expression;
      const openCount = countParens(expr);
      for (let i = 0; i < openCount; i++) expr += ')';

      const parseExpr = prepareForParsing(expr);
      const { result, error } = Parser.evaluate(parseExpr);

      if (error) {
        state.hasError = true;
        state.displayResult = I18n.t(state.language, 
          error.code === 'DIV_ZERO' ? 'errorDivZero' :
          error.code === 'OVERFLOW' ? 'errorOverflow' :
          error.code === 'DOMAIN'   ? 'errorDomain'   : 'errorInvalid'
        );
        state.lastResult = null;
        return null;
      }

      const resultStr = formatNumber(result);
      state.lastResult = result;
      state.displayResult = resultStr;
      state.justEvaluated = true;
      state.hasError = false;

      return { expression: expr, result: resultStr, numericResult: result };
    }

    /**
     * Clear entry (C) — clears the current expression but keeps history.
     */
    function clearEntry() {
      state.expression = '';
      state.displayResult = '0';
      state.lastResult = null;
      state.hasError = false;
      state.justEvaluated = false;
    }

    /**
     * Full clear (AC).
     */
    function clear() {
      clearEntry();
    }

    /**
     * Backspace — remove last character.
     */
    function backspace() {
      if (state.hasError) { clear(); return; }
      if (state.justEvaluated) {
        clear();
        return;
      }
      // Remove the last character, being careful about multi-char functions
      const expr = state.expression;
      if (expr === '') return;

      // Check if expression ends with a function name like 'sin('
      const funcMatch = expr.match(/(sin|cos|tan|asin|acos|atan|log|log2|ln|sqrt|cbrt|exp|pow10|sinh|cosh|tanh|mod|logn|nthroot|)\($/)
      if (funcMatch && funcMatch[1]) {
        state.expression = expr.slice(0, expr.length - funcMatch[0].length);
        return;
      }
      state.expression = expr.slice(0, -1);
    }

    /**
     * Toggle sign of the current number or expression.
     */
    function toggleSign() {
      if (state.hasError) { clear(); return; }
      if (state.expression === '') {
        state.expression = '-';
        return;
      }
      if (state.justEvaluated && state.lastResult !== null) {
        const negated = -state.lastResult;
        state.expression = formatNumber(negated);
        state.lastResult = negated;
        state.displayResult = formatNumber(negated);
        return;
      }
      // Try to negate the last number token
      const match = state.expression.match(/(-?\d*\.?\d+)(\D*)$/);
      if (match) {
        const num = parseFloat(match[1]);
        const negated = -num;
        const newNumStr = formatNumber(negated);
        const prefix = state.expression.slice(0, state.expression.length - match[0].length);
        state.expression = prefix + newNumStr + match[2];
      } else {
        // Wrap in negation
        state.expression = '(-(' + state.expression + '))';
      }
    }

    /**
     * Input a scientific function — appends function name and opening paren.
     */
    function inputFunction(funcName) {
      if (state.hasError) { clear(); }

      if (state.justEvaluated && state.lastResult !== null) {
        // Wrap last result in function
        state.expression = funcName + '(' + formatNumber(state.lastResult);
        state.justEvaluated = false;
        return;
      }

      // If expression ends with a number, insert implicit multiply
      if (state.expression !== '' && endsWithNumberOrClose(state.expression)) {
        state.expression += '*';
      }
      state.expression += funcName + '(';
    }

    /**
     * Input square: wraps current number/expression in pow(x, 2).
     */
    function inputSquare() {
      if (state.hasError) { clear(); return; }
      if (state.expression === '' && state.lastResult !== null) {
        state.expression = formatNumber(state.lastResult);
      }
      if (endsWithNumberOrClose(state.expression)) {
        // Find last number
        const match = state.expression.match(/(-?\d*\.?\d+)$/);
        if (match) {
          const prefix = state.expression.slice(0, -match[0].length);
          state.expression = prefix + 'pow(' + match[0] + ',2)';
        } else {
          state.expression = 'pow(' + state.expression + ',2)';
        }
      }
      state.justEvaluated = false;
    }

    /**
     * Input cube: x³
     */
    function inputCube() {
      if (state.hasError) { clear(); return; }
      if (state.expression === '' && state.lastResult !== null) {
        state.expression = formatNumber(state.lastResult);
      }
      if (endsWithNumberOrClose(state.expression)) {
        const match = state.expression.match(/(-?\d*\.?\d+)$/);
        if (match) {
          const prefix = state.expression.slice(0, -match[0].length);
          state.expression = prefix + 'pow(' + match[0] + ',3)';
        } else {
          state.expression = 'pow(' + state.expression + ',3)';
        }
      }
      state.justEvaluated = false;
    }

    /**
     * Input power: sets up xʸ — expression^(
     */
    function inputPower() {
      if (state.hasError) { clear(); return; }
      if (endsWithNumberOrClose(state.expression) || 
          (state.justEvaluated && state.lastResult !== null)) {
        if (state.justEvaluated) {
          state.expression = formatNumber(state.lastResult);
          state.justEvaluated = false;
        }
        state.expression += '^(';
      }
    }

    /**
     * Input reciprocal: 1/x
     */
    function inputReciprocal() {
      if (state.hasError) { clear(); return; }
      if (state.justEvaluated && state.lastResult !== null) {
        if (state.lastResult === 0) {
          state.hasError = true;
          state.displayResult = I18n.t(state.language, 'errorDivZero');
          return;
        }
        const val = 1 / state.lastResult;
        state.expression = formatNumber(val);
        state.lastResult = val;
        state.displayResult = formatNumber(val);
        return;
      }
      const parseExpr = prepareForParsing(state.expression);
      const { result, error } = Parser.evaluate(parseExpr);
      if (!error && result !== null) {
        if (result === 0) {
          state.hasError = true;
          state.displayResult = I18n.t(state.language, 'errorDivZero');
          return;
        }
        const val = 1 / result;
        state.expression = formatNumber(val);
        state.lastResult = val;
      }
    }

    /**
     * Input square root.
     */
    function inputSqrt() {
      if (state.hasError) { clear(); }
      if (state.justEvaluated && state.lastResult !== null) {
        state.expression = 'sqrt(' + formatNumber(state.lastResult) + ')';
        state.justEvaluated = false;
        return;
      }
      if (state.expression !== '' && endsWithNumberOrClose(state.expression)) {
        state.expression = 'sqrt(' + state.expression + ')';
      } else {
        state.expression += 'sqrt(';
      }
    }

    /**
     * Input cube root.
     */
    function inputCbrt() {
      if (state.hasError) { clear(); }
      if (state.justEvaluated && state.lastResult !== null) {
        state.expression = 'cbrt(' + formatNumber(state.lastResult) + ')';
        state.justEvaluated = false;
        return;
      }
      if (state.expression !== '' && endsWithNumberOrClose(state.expression)) {
        state.expression = 'cbrt(' + state.expression + ')';
      } else {
        state.expression += 'cbrt(';
      }
    }

    /**
     * Input factorial.
     */
    function inputFactorial() {
      if (state.hasError) { clear(); return; }
      if (state.justEvaluated && state.lastResult !== null) {
        const n = Math.round(state.lastResult);
        const parseExpr = n + '!';
        const { result, error } = Parser.evaluate(parseExpr.replace(/(\d+)!/g, (_, d) => {
          let r = 1; for (let i = 2; i <= +d; i++) r *= i; return r;
        }));
        if (!error) {
          state.expression = formatNumber(result);
          state.lastResult = result;
          state.displayResult = formatNumber(result);
        }
        return;
      }
      state.expression += '!';
    }

    /**
     * Input EXP (scientific notation): appends ×10^(
     */
    function inputEXP() {
      if (state.hasError) { clear(); }
      if (state.expression === '') state.expression = '1';
      state.expression += '*pow10(';
    }

    /**
     * Input log base n: logn(x, base)
     */
    function inputLogN() {
      if (state.hasError) { clear(); }
      if (state.justEvaluated && state.lastResult !== null) {
        state.expression = 'logn(' + formatNumber(state.lastResult) + ',';
        state.justEvaluated = false;
        return;
      }
      if (state.expression !== '') {
        state.expression = 'logn(' + state.expression + ',';
      } else {
        state.expression = 'logn(';
      }
    }

    /**
     * Input modulo operator.
     */
    function inputMod() {
      if (state.hasError) { clear(); return; }
      if (state.justEvaluated && state.lastResult !== null) {
        state.expression = formatNumber(state.lastResult) + '%';
        state.justEvaluated = false;
        return;
      }
      if (endsWithNumberOrClose(state.expression)) {
        state.expression += '%';
      }
    }

    /**
     * Input a constant (pi, e).
     */
    function inputConstant(constName) {
      if (state.hasError) { clear(); }
      if (state.justEvaluated) {
        state.expression = constName;
        state.justEvaluated = false;
        return;
      }
      if (state.expression !== '' && endsWithNumberOrClose(state.expression)) {
        state.expression += '*';
      }
      state.expression += constName;
    }

    /**
     * Input open parenthesis.
     */
    function inputOpenParen() {
      if (state.hasError) { clear(); }
      if (state.justEvaluated) {
        state.expression = '(';
        state.justEvaluated = false;
        return;
      }
      if (state.expression !== '' && endsWithNumberOrClose(state.expression)) {
        state.expression += '*(';
      } else {
        state.expression += '(';
      }
    }

    /**
     * Input close parenthesis.
     */
    function inputCloseParen() {
      if (state.hasError) { clear(); return; }
      if (countParens(state.expression) > 0) {
        state.expression += ')';
      }
    }

    /**
     * Set the expression directly (e.g. from history restore).
     */
    function setExpression(expr) {
      state.expression = expr;
      state.hasError = false;
      state.justEvaluated = false;
    }

    /**
     * Set the result directly (from history restore).
     */
    function setResult(resultStr) {
      const num = parseFloat(resultStr);
      state.lastResult = isNaN(num) ? null : num;
      state.displayResult = resultStr;
      state.expression = resultStr;
      state.justEvaluated = true;
    }

    // ── Getters ───────────────────────────────────────────────────────────

    function getState() {
      return {
        expression:    state.expression,
        displayResult: state.displayResult,
        lastResult:    state.lastResult,
        hasError:      state.hasError,
        justEvaluated: state.justEvaluated,
        mode:          state.mode,
        theme:         state.theme,
        language:      state.language,
        numeralSystem: state.numeralSystem
      };
    }

    function getDisplayExpression_public() {
      return getDisplayExpression();
    }

    function getDisplayResult_public() {
      if (state.hasError) return state.displayResult;
      if (state.lastResult !== null) {
        return Numerals.formatResult(state.lastResult, state.numeralSystem);
      }
      if (state.expression === '') return '0';
      // Try to parse partial expression to show live result
      const tryParse = prepareForParsing(state.expression);
      const { result } = Parser.evaluate(tryParse);
      if (result !== null && isFinite(result)) {
        return Numerals.formatResult(result, state.numeralSystem);
      }
      return Numerals.toDisplayNumerals(state.expression, state.numeralSystem);
    }

    function isRomanDecimal_public() {
      return isRomanDecimal();
    }

    // ── Settings setters ──────────────────────────────────────────────────

    function setMode(mode)         { state.mode = mode; }
    function setTheme(theme)       { state.theme = theme; }
    function setLanguage(lang)     { state.language = lang; }
    function setNumeralSystem(sys) { state.numeralSystem = sys; }

    return {
      // Input
      inputDigit,
      inputDecimal,
      inputOperator,
      inputPercent,
      inputFunction,
      inputSquare,
      inputCube,
      inputPower,
      inputReciprocal,
      inputSqrt,
      inputCbrt,
      inputFactorial,
      inputEXP,
      inputLogN,
      inputMod,
      inputConstant,
      inputOpenParen,
      inputCloseParen,
      // Actions
      evaluate,
      clear,
      clearEntry,
      backspace,
      toggleSign,
      setExpression,
      setResult,
      // Getters
      getState,
      getDisplayExpression: getDisplayExpression_public,
      getDisplayResult:     getDisplayResult_public,
      isRomanDecimal:       isRomanDecimal_public,
      // Settings
      setMode,
      setTheme,
      setLanguage,
      setNumeralSystem
    };
  }

  return { create, formatNumber };
})();