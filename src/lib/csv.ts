/** Escape one spreadsheet cell, including formulas hidden behind controls or bidi marks. */
export function escapeCsvCell(value: unknown) {
  let text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ');
  if (/^[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
