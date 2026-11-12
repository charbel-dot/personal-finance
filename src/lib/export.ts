/** Saves `content` as a file through a temporary link. */
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** RFC 4180 field: quote when needed, double inner quotes; neutralise spreadsheet formulas. */
export function csvField(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows → CSV text (with a BOM so Excel reads UTF-8 names correctly). */
export function toCsv(rows: string[][]): string {
  return '﻿' + rows.map((r) => r.map(csvField).join(',')).join('\r\n');
}
