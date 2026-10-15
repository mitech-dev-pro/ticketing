// Who can see and act on a ticket (D-05 to D-08, docs/PERMISSIONS.md).
// Implemented in Phase 1 against tests/unit/permissions.matrix.ts — `can(action, user,
// ticket, rules)` and `visibleTicketsWhere(user)` must agree for every seed case.
// Every ticket query in the app goes through visibleTicketsWhere(user); never write one
// without it.

export {};
