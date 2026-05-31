export interface Expense {
  id: string;
  name: string;
  amount: number;
  description: string;
}

export interface Participant {
  name: string;
  totalSpent: number;
}

export interface Debt {
  from: string;
  to: string;
  amount: number;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
}
