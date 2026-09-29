import * as XLSX from 'xlsx';
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';

// Old .xls files from Israeli banks store Hebrew in codepage 1255.
XLSX.set_cptable(cptable);

export type Cell = string | number | null;
export type Grid = Cell[][];

/**
 * CSV exports are often windows-1255 rather than UTF-8. Try strict UTF-8 first, fall back to 1255.
 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1255').decode(bytes);
  }
}

function isCsv(fileName: string, bytes: Uint8Array): boolean {
  if (/\.(csv|txt)$/i.test(fileName)) return true;
  // Zip (xlsx) starts with PK, BIFF/OLE (xls) with D0 CF 11 E0. Anything else: treat as text.
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  return !zip && !ole && !/\.xlsx?$/i.test(fileName);
}

/**
 * Reads the first sheet as a grid of raw cells. Numbers stay numbers (dates as Excel serials),
 * text is trimmed. Nothing leaves the device: the file is parsed in memory.
 */
export function readGrid(bytes: Uint8Array, fileName: string): Grid {
  const wb = isCsv(fileName, bytes) ? XLSX.read(decodeText(bytes), { type: 'string', raw: true }) : XLSX.read(bytes, { type: 'array', cellDates: false });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[first]!, { header: 1, raw: true, defval: null, blankrows: true });
  return rows.map((r) => r.map((c) => (typeof c === 'string' ? c.trim() || null : c)));
}

export { excelSerialToIso } from './excelDate';
