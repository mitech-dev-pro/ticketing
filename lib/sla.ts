// SLA maths (D-01 to D-04). Implemented in Phase 2 as pure functions that take `now`
// and a calendar (24x7 or business hours + Holiday rows) as arguments:
// computeDueAt, computeFirstResponseDueAt, percentElapsed, slaState.
// Deadlines are createdAt + target + pausedMs on the ticket's calendar; the clock
// pauses only in Awaiting requester (D-03).

export {};
