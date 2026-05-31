import { Expense, Debt } from "./types";

/**
 * Minimizes transactions required to settle up balances among participants.
 */
export function calculateDebts(participants: { name: string; totalSpent: number }[]): Debt[] {
  const numParticipants = participants.length;
  if (numParticipants <= 1) return [];

  const total = participants.reduce((acc, p) => acc + p.totalSpent, 0);
  const share = total / numParticipants;

  // Calculate net balances (Spent - Share)
  const balances = participants.map(p => ({
    name: p.name,
    balance: p.totalSpent - share
  }));

  // Separate debtors (balance < 0) and creditors (balance > 0)
  const debtors = balances
    .filter(b => b.balance < -0.01)
    .sort((a, b) => a.balance - b.balance); // Most negative first

  const creditors = balances
    .filter(b => b.balance > 0.01)
    .sort((a, b) => b.balance - a.balance); // Most positive first

  const debts: Debt[] = [];
  let debtorIdx = 0;
  let creditorIdx = 0;

  // Clone to avoid side effects
  const debtorList = debtors.map(d => ({ ...d }));
  const creditorList = creditors.map(c => ({ ...c }));

  while (debtorIdx < debtorList.length && creditorIdx < creditorList.length) {
    const debtor = debtorList[debtorIdx];
    const creditor = creditorList[creditorIdx];

    const oweAmount = Math.min(-debtor.balance, creditor.balance);

    if (oweAmount > 0.01) {
      debts.push({
        from: debtor.name,
        to: creditor.name,
        amount: Number(oweAmount.toFixed(2))
      });
    }

    debtor.balance += oweAmount;
    creditor.balance -= oweAmount;

    if (Math.abs(debtor.balance) < 0.01) {
      debtorIdx++;
    }
    if (Math.abs(creditor.balance) < 0.01) {
      creditorIdx++;
    }
  }

  return debts;
}
