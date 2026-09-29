/**
 * Excel serial date → YYYY-MM-DD (1900 date system, epoch 1899-12-30, which absorbs Excel's
 * 1900 leap-year bug for any date after 1 March 1900). Pure, no SheetJS needed.
 */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 61) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
