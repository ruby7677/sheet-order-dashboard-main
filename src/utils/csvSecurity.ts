/** CSV quoting alone does not stop spreadsheet formulas. */
export function safeCsvText(value: unknown): string {
  const text=String(value??'');
  // Inspect the first meaningful character, including controls/BOM ignored by importers.
  // eslint-disable-next-line no-control-regex -- Controls are intentionally matched to block spreadsheet formula injection.
  if(/^[\s\u0000-\u001f\u007f\ufeff]*[=+@-]/u.test(text)) {
    return "'"+text;
  }
  return text;
}
export function quoteCsvText(value: unknown): string {
  const text=safeCsvText(value);
  return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
}
