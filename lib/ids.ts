// Formats and parses the two public id schemes (D-12). Nothing outside this file
// should build or parse an MLT-/MLA- string.

const TICKET_PREFIX = 'MLT';
const ASSET_PREFIX = 'MLA';
const ASSET_NUMBER_WIDTH = 4;

export function formatTicketId(number: number): string {
  return `${TICKET_PREFIX}-${number}`;
}

/**
 * Accepts a bare ticket number ("24827") or the formatted id ("MLT-24827"),
 * as used in /tickets/24827 and /tickets/MLT-24827. Returns null, never throws,
 * so route handlers can turn an unparseable id into a 404.
 */
export function parseTicketId(input: string): number | null {
  const trimmed = input.trim();
  const match = /^(?:MLT-)?(\d+)$/i.exec(trimmed);
  if (!match) return null;
  const [, digits] = match;
  if (digits === undefined) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function formatAssetId(type: string, number: number): string {
  const padded = String(number).padStart(ASSET_NUMBER_WIDTH, '0');
  return `${ASSET_PREFIX}-${type.toUpperCase()}-${padded}`;
}

export interface ParsedAssetId {
  type: string;
  number: number;
}

export function parseAssetId(input: string): ParsedAssetId | null {
  const trimmed = input.trim();
  const match = /^MLA-([A-Z]+)-(\d+)$/i.exec(trimmed);
  if (!match) return null;
  const [, type, digits] = match;
  if (type === undefined || digits === undefined) return null;
  const number = Number(digits);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return { type: type.toUpperCase(), number };
}
