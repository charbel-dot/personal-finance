import { formatAmountInput, type Currency } from '../../shared/money';

/** Characters that carry meaning in an amount; separators are re-inserted by the formatter. */
const isSignificant = (ch: string) => /[\d.-]/.test(ch);
const countSignificant = (text: string) => text.match(/[\d.-]/g)?.length ?? 0;

/**
 * Reads what was just typed into an amount input, returns it formatted with thousands separators
 * and puts the caret back where it belongs (React would otherwise jump it to the end whenever a
 * separator appears or moves). Backspacing over a separator deletes the digit before it.
 *
 * `previous` is the value before this edit; `allowNegative` keeps a leading minus.
 */
export function readAmountInput(
  el: HTMLInputElement,
  previous: string,
  currency: Currency,
  allowNegative = false,
): string {
  let raw = el.value.replace(allowNegative ? /[^\d.,-]/g : /[^\d.,]/g, '');
  let caret = el.selectionStart ?? raw.length;
  const atEnd = caret >= el.value.length;

  // A lone separator removed by backspace would just come back: remove the digit before it instead.
  if (
    raw.length === previous.length - 1 &&
    previous[caret] === ',' &&
    raw === previous.slice(0, caret) + previous.slice(caret + 1)
  ) {
    raw = previous.slice(0, caret - 1) + previous.slice(caret + 1);
    caret -= 1;
  }

  const next = formatAmountInput(raw, currency);
  if (atEnd || next === el.value) return next;

  // Keep the caret after the same number of digits (and dot/minus) as before formatting.
  const want = countSignificant(raw.slice(0, caret));
  let pos = 0;
  for (let seen = 0; pos < next.length && seen < want; pos++) if (isSignificant(next[pos])) seen++;
  requestAnimationFrame(() => {
    if (document.activeElement === el) el.setSelectionRange(pos, pos);
  });
  return next;
}
