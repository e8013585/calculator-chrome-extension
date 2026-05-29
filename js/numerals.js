/**
 * numerals.js
 * Numeral system conversion utilities.
 * toDisplayNumerals(str, system)   — convert Western Arabic digits to target system
 * fromDisplayNumerals(str, system) — convert target system digits back to Western Arabic
 */

'use strict';

const Numerals = (() => {

  // Each entry: [systemKey, displayName, digit array 0-9]
  const SYSTEMS = {
    western:       { name: 'Western Arabic',        digits: ['0','1','2','3','4','5','6','7','8','9'] },
    eastern_arabic:{ name: 'Eastern Arabic',        digits: ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'] },
    persian:       { name: 'Persian / Farsi',       digits: ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'] },
    devanagari:    { name: 'Devanagari',             digits: ['०','१','२','३','४','५','६','७','८','९'] },
    bengali:       { name: 'Bengali',               digits: ['০','১','২','৩','৪','৫','৬','৭','৮','৯'] },
    gujarati:      { name: 'Gujarati',              digits: ['૦','૧','૨','૩','૪','૫','૬','૭','૮','૯'] },
    gurmukhi:      { name: 'Gurmukhi / Punjabi',    digits: ['੦','੧','੨','੩','੪','੫','੬','੭','੮','੯'] },
    odia:          { name: 'Odia',                  digits: ['୦','୧','୨','୩','୪','୫','୬','୭','୮','୯'] },
    tamil:         { name: 'Tamil',                 digits: ['௦','௧','௨','௩','௪','௫','௬','௭','௮','௯'] },
    telugu:        { name: 'Telugu',                digits: ['౦','౧','౨','౩','౪','౫','౬','౭','౮','౯'] },
    kannada:       { name: 'Kannada',               digits: ['೦','೧','೨','೩','೪','೫','೬','೭','೮','೯'] },
    malayalam:     { name: 'Malayalam',             digits: ['൦','൧','൨','൩','൪','൫','൬','൭','൮','൯'] },
    sinhala:       { name: 'Sinhala',               digits: ['෦','෧','෨','෩','෪','෫','෬','෭','෮','෯'] },
    tibetan:       { name: 'Tibetan',               digits: ['༠','༡','༢','༣','༤','༥','༦','༧','༨','༩'] },
    myanmar:       { name: 'Myanmar / Burmese',     digits: ['၀','၁','၂','၃','၄','၅','၆','၇','၈','၉'] },
    khmer:         { name: 'Khmer',                 digits: ['០','១','២','៣','៤','៥','៦','៧','៨','៩'] },
    thai:          { name: 'Thai',                  digits: ['๐','๑','๒','๓','๔','๕','๖','๗','๘','๙'] },
    lao:           { name: 'Lao',                   digits: ['໐','໑','໒','໓','໔','໕','໖','໗','໘','໙'] },
    mongolian:     { name: 'Mongolian',             digits: ['᠐','᠑','᠒','᠓','᠔','᠕','᠖','᠗','᠘','᠙'] },
    balinese:      { name: 'Balinese',              digits: ['᭐','᭑','᭒','᭓','᭔','᭕','᭖','᭗','᭘','᭙'] },
    javanese:      { name: 'Javanese',              digits: ['꧐','꧑','꧒','꧓','꧔','꧕','꧖','꧗','꧘','꧙'] },
    cham:          { name: 'Cham',                  digits: ['꩐','꩑','꩒','꩓','꩔','꩕','꩖','꩗','꩘','꩙'] },
    limbu:         { name: 'Limbu',                 digits: ['᥆','᥇','᥈','᥉','᥊','᥋','᥌','᥍','᥎','᥏'] },
    meetei:        { name: 'Meetei Mayek',          digits: ['꩐','꩑','꩒','꩓','꩔','꩕','꩖','꩗','꩘','꩙'] },
    lepcha:        { name: 'Lepcha',                digits: ['᱀','᱁','᱂','᱃','᱄','᱅','᱆','᱇','᱈','᱉'] },
    sundanese:     { name: 'Sundanese',             digits: ['᮰','᮱','᮲','᮳','᮴','᮵','᮶','᮷','᮸','᮹'] },
    cjk:           { name: 'CJK',                   digits: ['〇','一','二','三','四','五','六','七','八','九'] },
    roman:         { name: 'Roman Numerals',        digits: null } // Special handling
  };

  // ─── Roman numeral conversion ─────────────────────────────────────────

  function toRoman(n) {
    if (!Number.isInteger(n) || n <= 0 || n > 3999) return null;
    const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
    const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
      while (n >= vals[i]) {
        result += syms[i];
        n -= vals[i];
      }
    }
    return result;
  }

  // ─── Core conversion functions ────────────────────────────────────────

  /**
   * Convert a string containing Western Arabic digits (0-9) to the target numeral system.
   * Non-digit characters (operators, decimal point, parentheses, letters) pass through unchanged.
   */
  function toDisplayNumerals(str, system) {
    if (!system || system === 'western') return str;
    if (system === 'roman') {
      // Try to convert the whole string as an integer
      const num = parseFloat(str);
      if (!isNaN(num) && Number.isInteger(num) && num > 0 && num <= 3999) {
        return toRoman(num);
      }
      // If decimal or out of range, return the original string with a marker
      return str; // UI will show note about roman numerals
    }

    const sys = SYSTEMS[system];
    if (!sys || !sys.digits) return str;

    return str.replace(/[0-9]/g, digit => sys.digits[parseInt(digit, 10)]);
  }

  /**
   * Convert a string containing target numeral system digits back to Western Arabic.
   * Used when receiving display input to convert to computation-ready form.
   */
  function fromDisplayNumerals(str, system) {
    if (!system || system === 'western') return str;
    if (system === 'roman') return str; // Roman is display-only for output

    const sys = SYSTEMS[system];
    if (!sys || !sys.digits) return str;

    // Build reverse lookup
    let result = str;
    for (let i = 0; i < 10; i++) {
      const glyph = sys.digits[i];
      if (glyph && glyph !== String(i)) {
        // Use a global replace for each glyph
        result = result.split(glyph).join(String(i));
      }
    }
    return result;
  }

  /**
   * Get list of all numeral system keys and display names for UI dropdowns.
   */
  function getSystemList() {
    return Object.entries(SYSTEMS).map(([key, val]) => ({
      key,
      name: val.name
    }));
  }

  /**
   * Format a number result for display in the given numeral system.
   * Handles precision, very large/small numbers (sci notation), etc.
   */
  function formatResult(num, system) {
    if (num === null || num === undefined || isNaN(num)) return 'Error';
    if (!isFinite(num)) return num > 0 ? '∞' : '-∞';

    let str;
    // Use toPrecision to limit floating point noise, then clean up trailing zeros
    const abs = Math.abs(num);

    if (abs === 0) {
      str = '0';
    } else if (abs >= 1e15 || (abs < 1e-7 && abs > 0)) {
      // Scientific notation
      str = num.toExponential(10).replace(/\.?0+(e)/, '$1');
    } else {
      // Fixed — limit to 12 significant digits
      str = parseFloat(num.toPrecision(12)).toString();
    }

    if (system === 'roman') {
      const intPart = Math.trunc(num);
      if (Number.isInteger(num) && num > 0 && num <= 3999) {
        return toRoman(intPart);
      }
      // Return western with flag for UI to show note
      return str + '\u200B'; // zero-width space as marker for decimal roman
    }

    return toDisplayNumerals(str, system);
  }

  return {
    toDisplayNumerals,
    fromDisplayNumerals,
    formatResult,
    getSystemList,
    SYSTEMS,
    toRoman
  };
})();