"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLedgerInvariant = validateLedgerInvariant;
exports.createLedgerEntryPlaceholder = createLedgerEntryPlaceholder;
function validateLedgerInvariant(lines) {
    const debitTotal = lines.reduce((sum, line) => sum + line.debitAmountMinor, 0);
    const creditTotal = lines.reduce((sum, line) => sum + line.creditAmountMinor, 0);
    return debitTotal === creditTotal;
}
function createLedgerEntryPlaceholder() {
    return {
        message: "Ledger service placeholder"
    };
}
