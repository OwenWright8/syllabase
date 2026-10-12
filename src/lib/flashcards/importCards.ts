// Turning pasted text into cards: Quizlet's export ("term<TAB>definition", one
// card per line) by default, and any other separators you choose.

export type TermSeparator = "tab" | "comma" | "dash" | "custom";
export type CardSeparator = "newline" | "semicolon" | "blank-line" | "custom";

export interface ImportOptions {
  between: TermSeparator;
  betweenCustom?: string;
  cards: CardSeparator;
  cardsCustom?: string;
}

export const DEFAULT_IMPORT: ImportOptions = { between: "tab", cards: "newline" };

export interface ImportResult {
  cards: Array<{ term: string; definition: string }>;
  /** Entries that had no separator, or an empty side, and were left out. */
  skipped: string[];
}

function termSeparator(options: ImportOptions): string | null {
  switch (options.between) {
    case "tab":
      return "\t";
    case "comma":
      return ",";
    case "dash":
      return " - ";
    case "custom":
      return options.betweenCustom ? options.betweenCustom : null;
  }
}

function splitEntries(text: string, options: ImportOptions): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  switch (options.cards) {
    case "newline":
      return normalized.split("\n");
    case "semicolon":
      return normalized.split(";");
    case "blank-line":
      return normalized.split(/\n\s*\n/);
    case "custom":
      return options.cardsCustom ? normalized.split(options.cardsCustom) : [normalized];
  }
}

export function parseImport(text: string, options: ImportOptions = DEFAULT_IMPORT): ImportResult {
  const separator = termSeparator(options);
  const result: ImportResult = { cards: [], skipped: [] };
  if (!separator) return result;
  for (const raw of splitEntries(text, options)) {
    const entry = raw.trim();
    if (!entry) continue;
    const at = entry.indexOf(separator);
    if (at < 0) {
      result.skipped.push(entry);
      continue;
    }
    const term = entry.slice(0, at).trim();
    const definition = entry.slice(at + separator.length).trim();
    if (!term || !definition) {
      result.skipped.push(entry);
      continue;
    }
    result.cards.push({ term: term.slice(0, 1000), definition: definition.slice(0, 4000) });
  }
  return result;
}
