# Income And Expenses

The monthly finance module is implemented in `finance.js` and `finance-model.js`.

It supports income, expenses, refunds, internal account transfers, installment splitting, recurring items, custom categories, total and per-category budgets, account balances, month comparison, search, filters, CSV export, and validated JSON backup/restore.

Finance data uses a separate encrypted file through `src/main/services/finance-store.js`. The module does not read or modify salary data. Import replaces finance data only, after explicit confirmation.

Run `node tests/finance-model.test.js` for calculation/date/backup validation and `node tests/finance-store.test.js` for encrypted persistence.
