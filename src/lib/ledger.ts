export interface LedgerLineMinor {
  debitAmountMinor: number;
  creditAmountMinor: number;
}

export function validateLedgerInvariant(lines: LedgerLineMinor[]): boolean {
  const debitTotal = lines.reduce((sum, line) => sum + line.debitAmountMinor, 0);
  const creditTotal = lines.reduce((sum, line) => sum + line.creditAmountMinor, 0);
  return debitTotal === creditTotal;
}

export function createLedgerEntryPlaceholder() {
  return {
    message: "Ledger service placeholder"
  };
}
