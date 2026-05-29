/**
 * parser.js
 * Recursive descent parser / evaluator for mathematical expressions.
 * Supports: +, -, *, /, %, ^, unary minus, functions (sin, cos, tan,
 * asin, acos, atan, log, log2, ln, sqrt, cbrt, abs, ceil, floor,
 * round, exp, pow10, factorial), constants (pi, e), parentheses,
 * implicit multiplication, scientific notation (E), mod operator.
 *
 * NO eval() or Function() is used anywhere.
 */

'use strict';

const Parser = (() => {

  // ─── Tokeniser ───────────────────────────────────────────────────────────

  const TOKEN = {
    NUMBER:   'NUMBER',
    IDENT:    'IDENT',
    PLUS:     'PLUS',
    MINUS:    'MINUS',
    STAR:     'STAR',
    SLASH:    'SLASH',
    PERCENT:  'PERCENT',
    CARET:    'CARET',
    LPAREN:   'LPAREN',
    RPAREN:   'RPAREN',
    COMMA:    'COMMA',
    EOF:      'EOF'
  };

  class CalcError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code || 'INVALID';
    }
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    const src = input.trim();

    while (i < src.length) {
      const ch = src[i];

      // Skip whitespace
      if (/\s/.test(ch)) { i++; continue; }

      // Number: digits, decimal point, optional E/e for sci notation
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i+1] || ''))) {
        let num = '';
        while (i < src.length && /[0-9.]/.test(src[i])) {
          num += src[i++];
        }
        // Scientific notation: 1e10, 1E-5, 1e+3
        if (i < src.length && (src[i] === 'e' || src[i] === 'E')) {
          // make sure it's a number exponent, not 'exp' function
          const next = src[i+1];
          if (/[0-9+\-]/.test(next || '')) {
            num += src[i++]; // e/E
            if (src[i] === '+' || src[i] === '-') num += src[i++];
            while (i < src.length && /[0-9]/.test(src[i])) num += src[i++];
          }
        }
        tokens.push({ type: TOKEN.NUMBER, value: parseFloat(num) });
        continue;
      }

      // Identifier (function names, constants)
      if (/[a-zA-Z_π]/.test(ch)) {
        let id = '';
        while (i < src.length && /[a-zA-Z0-9_π]/.test(src[i])) id += src[i++];
        tokens.push({ type: TOKEN.IDENT, value: id });
        continue;
      }

      switch (ch) {
        case '+': tokens.push({ type: TOKEN.PLUS });    i++; break;
        case '-': tokens.push({ type: TOKEN.MINUS });   i++; break;
        case '×':
        case '*': tokens.push({ type: TOKEN.STAR });    i++; break;
        case '÷':
        case '/': tokens.push({ type: TOKEN.SLASH });   i++; break;
        case '%': tokens.push({ type: TOKEN.PERCENT }); i++; break;
        case '^': tokens.push({ type: TOKEN.CARET });   i++; break;
        case '(': tokens.push({ type: TOKEN.LPAREN });  i++; break;
        case ')': tokens.push({ type: TOKEN.RPAREN });  i++; break;
        case ',': tokens.push({ type: TOKEN.COMMA });   i++; break;
        default:
          throw new CalcError(`Unexpected character: ${ch}`, 'INVALID');
      }
    }

    tokens.push({ type: TOKEN.EOF });
    return tokens;
  }

  // ─── Parser ──────────────────────────────────────────────────────────────

  /**
   * Grammar (in order of increasing precedence):
   *
   * expr        → additive
   * additive    → multiplicative (('+' | '-') multiplicative)*
   * multiplicative → modulo (('*' | '/') modulo)*
   * modulo      → power (('mod' | '%') power)*
   * power       → unary ('^' unary)*          right-associative
   * unary       → '-' unary | postfix
   * postfix     → primary '!' *              (factorial suffix)
   * primary     → NUMBER | IDENT args? | '(' expr ')'
   */

  class ParserState {
    constructor(tokens) {
      this.tokens = tokens;
      this.pos = 0;
    }
    peek() { return this.tokens[this.pos]; }
    consume() { return this.tokens[this.pos++]; }
    expect(type) {
      const tok = this.consume();
      if (tok.type !== type) throw new CalcError(`Expected ${type}, got ${tok.type}`, 'INVALID');
      return tok;
    }
    match(...types) {
      if (types.includes(this.peek().type)) {
        return this.consume();
      }
      return null;
    }
  }

  // Known single-argument functions
  const FUNCTIONS_1 = new Set([
    'sin','cos','tan','asin','acos','atan',
    'log','log2','ln','sqrt','cbrt','abs',
    'ceil','floor','round','exp','pow10',
    'sinh','cosh','tanh','asinh','acosh','atanh',
    'sign','frac'
  ]);

  // Known two-argument functions
  const FUNCTIONS_2 = new Set([
    'pow', 'logn', 'atan2', 'nthroot', 'mod'
  ]);

  // Known constants
  const CONSTANTS = {
    'pi': Math.PI,
    'π':  Math.PI,
    'e':  Math.E,
    'phi': (1 + Math.sqrt(5)) / 2,
    'tau': 2 * Math.PI,
    'inf': Infinity
  };

  function applyFunction1(name, arg) {
    const DEG = Math.PI / 180;
    switch(name) {
      case 'sin':   return Math.sin(arg);
      case 'cos':   return Math.cos(arg);
      case 'tan':   return Math.tan(arg);
      case 'asin':  return Math.asin(arg);
      case 'acos':  return Math.acos(arg);
      case 'atan':  return Math.atan(arg);
      case 'sinh':  return Math.sinh(arg);
      case 'cosh':  return Math.cosh(arg);
      case 'tanh':  return Math.tanh(arg);
      case 'asinh': return Math.asinh(arg);
      case 'acosh': return Math.acosh(arg);
      case 'atanh': return Math.atanh(arg);
      case 'log':   
        if (arg <= 0) throw new CalcError('log domain error', 'DOMAIN');
        return Math.log10(arg);
      case 'log2':  
        if (arg <= 0) throw new CalcError('log2 domain error', 'DOMAIN');
        return Math.log2(arg);
      case 'ln':    
        if (arg <= 0) throw new CalcError('ln domain error', 'DOMAIN');
        return Math.log(arg);
      case 'sqrt':  
        if (arg < 0) throw new CalcError('sqrt domain error', 'DOMAIN');
        return Math.sqrt(arg);
      case 'cbrt':  return Math.cbrt(arg);
      case 'abs':   return Math.abs(arg);
      case 'ceil':  return Math.ceil(arg);
      case 'floor': return Math.floor(arg);
      case 'round': return Math.round(arg);
      case 'exp':   return Math.exp(arg);
      case 'pow10': return Math.pow(10, arg);
      case 'sign':  return Math.sign(arg);
      case 'frac':  return arg - Math.trunc(arg);
      default: throw new CalcError(`Unknown function: ${name}`, 'INVALID');
    }
  }

  function applyFunction2(name, a, b) {
    switch(name) {
      case 'pow':     return Math.pow(a, b);
      case 'logn':    
        if (a <= 0 || b <= 0 || b === 1) throw new CalcError('logn domain error', 'DOMAIN');
        return Math.log(a) / Math.log(b);
      case 'atan2':   return Math.atan2(a, b);
      case 'nthroot': 
        if (b === 0) throw new CalcError('nthroot: n cannot be 0', 'DOMAIN');
        return Math.pow(a, 1/b);
      case 'mod':     
        if (b === 0) throw new CalcError('mod by zero', 'DIV_ZERO');
        return a % b;
      default: throw new CalcError(`Unknown function: ${name}`, 'INVALID');
    }
  }

  function factorial(n) {
    if (!Number.isInteger(n) || n < 0) throw new CalcError('Factorial requires non-negative integer', 'DOMAIN');
    if (n > 170) throw new CalcError('Factorial overflow', 'OVERFLOW');
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  }

  // ─── Parse functions ─────────────────────────────────────────────────────

  function parseExpr(state) {
    return parseAdditive(state);
  }

  function parseAdditive(state) {
    let left = parseMultiplicative(state);
    while (true) {
      const tok = state.peek();
      if (tok.type === TOKEN.PLUS) {
        state.consume();
        left = left + parseMultiplicative(state);
      } else if (tok.type === TOKEN.MINUS) {
        state.consume();
        left = left - parseMultiplicative(state);
      } else break;
    }
    return left;
  }

  function parseMultiplicative(state) {
    let left = parseModulo(state);
    while (true) {
      const tok = state.peek();
      if (tok.type === TOKEN.STAR) {
        state.consume();
        const right = parseModulo(state);
        left = left * right;
      } else if (tok.type === TOKEN.SLASH) {
        state.consume();
        const right = parseModulo(state);
        if (right === 0) throw new CalcError('Division by zero', 'DIV_ZERO');
        left = left / right;
      } else if (tok.type === TOKEN.NUMBER || tok.type === TOKEN.LPAREN ||
                 (tok.type === TOKEN.IDENT && (FUNCTIONS_1.has(tok.value) || FUNCTIONS_2.has(tok.value) || tok.value in CONSTANTS))) {
        // Implicit multiplication: 2π, 2(3+4), 2sin(x)
        const right = parseModulo(state);
        left = left * right;
      } else break;
    }
    return left;
  }

  function parseModulo(state) {
    let left = parsePower(state);
    while (true) {
      const tok = state.peek();
      if (tok.type === TOKEN.PERCENT) {
        state.consume();
        const right = parsePower(state);
        if (right === 0) throw new CalcError('Modulo by zero', 'DIV_ZERO');
        left = left % right;
      } else if (tok.type === TOKEN.IDENT && tok.value === 'mod') {
        state.consume();
        const right = parsePower(state);
        if (right === 0) throw new CalcError('Modulo by zero', 'DIV_ZERO');
        left = left % right;
      } else break;
    }
    return left;
  }

  function parsePower(state) {
    let base = parseUnary(state);
    if (state.peek().type === TOKEN.CARET) {
      state.consume();
      const exp = parseUnary(state); // right-associative handled via recursion
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(state) {
    if (state.peek().type === TOKEN.MINUS) {
      state.consume();
      return -parseUnary(state);
    }
    if (state.peek().type === TOKEN.PLUS) {
      state.consume();
      return parseUnary(state);
    }
    return parsePostfix(state);
  }

  function parsePostfix(state) {
    let val = parsePrimary(state);
    // Handle factorial suffix: 5!
    while (state.peek().type === TOKEN.IDENT && state.peek().value === '!') {
      state.consume();
      val = factorial(val);
    }
    // Also handle ! as a special-cased token — we'll catch it in primary
    return val;
  }

  function parsePrimary(state) {
    const tok = state.peek();

    // Number literal
    if (tok.type === TOKEN.NUMBER) {
      state.consume();
      return tok.value;
    }

    // Parenthesised expression
    if (tok.type === TOKEN.LPAREN) {
      state.consume();
      const val = parseExpr(state);
      state.expect(TOKEN.RPAREN);
      return val;
    }

    // Identifier: function or constant
    if (tok.type === TOKEN.IDENT) {
      state.consume();
      const name = tok.value.toLowerCase();

      // Check for factorial suffix attached as next ident
      // (handled in postfix, but '!' might be parsed as part of ident in some edge cases)

      // Constant
      if (name in CONSTANTS) {
        return CONSTANTS[name];
      }

      // Two-argument function
      if (FUNCTIONS_2.has(name)) {
        state.expect(TOKEN.LPAREN);
        const a = parseExpr(state);
        state.expect(TOKEN.COMMA);
        const b = parseExpr(state);
        state.expect(TOKEN.RPAREN);
        return applyFunction2(name, a, b);
      }

      // One-argument function
      if (FUNCTIONS_1.has(name)) {
        state.expect(TOKEN.LPAREN);
        const a = parseExpr(state);
        state.expect(TOKEN.RPAREN);
        return applyFunction1(name, a);
      }

      throw new CalcError(`Unknown identifier: ${name}`, 'INVALID');
    }

    throw new CalcError(`Unexpected token: ${tok.type}`, 'INVALID');
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Evaluate a mathematical expression string.
   * Returns { result: number, error: null } or { result: null, error: CalcError }
   */
  function evaluate(expression) {
    try {
      if (!expression || expression.trim() === '') {
        return { result: 0, error: null };
      }

      // Pre-process: handle factorial suffix written as 5!
      // Convert "!" suffix to a recognisable token sequence.
      // We'll replace n! with factorial(n) pattern during tokenisation via the postfix parser above,
      // but we also need to handle the "!" character itself:
      let expr = expression
        .replace(/(\d+)\s*!/g, (_, n) => `factorial_call_${n}`)
        .replace(/factorial_call_(\d+)/g, (_, n) => {
          // Compute directly
          return String(factorial(parseInt(n, 10)));
        });

      // Replace display operators with ASCII equivalents
      expr = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')
        .replace(/π/g, 'pi')
        .replace(/\bmod\b/gi, '%');

      const tokens = tokenize(expr);
      const state = new ParserState(tokens);
      const result = parseExpr(state);

      if (state.peek().type !== TOKEN.EOF) {
        throw new CalcError('Unexpected tokens after expression', 'INVALID');
      }

      if (!isFinite(result) && !isNaN(result)) {
        throw new CalcError('Overflow', 'OVERFLOW');
      }
      if (isNaN(result)) {
        throw new CalcError('Domain error', 'DOMAIN');
      }

      return { result, error: null };

    } catch (err) {
      return { result: null, error: err };
    }
  }

  return { evaluate, CalcError };
})();