# Who can see and do what

Plain-language version of `lib/permissions.ts`, for review by miLife. Background in
`docs/DECISIONS.md` (D-05 to D-08). Every rule here has at least one test case in
`tests/unit/permissions.matrix.ts`, using real seed people and tickets.

## Words used here

- **Current department**: where the ticket is now (its open journey leg).
- **Handler**: anyone in the current department, head included.
- **Passed through**: the ticket was with a department earlier and has been forwarded on.
- **Mentioned**: a person, or their department, was @mentioned in a reply or note.

## Seeing a ticket

| Who                                     | Normal ticket    | Confidential ticket      |
| --------------------------------------- | ---------------- | ------------------------ |
| Requester                               | Yes              | Yes                      |
| Current assignee                        | Yes              | Yes                      |
| Head of the current department          | Yes              | Yes                      |
| Other members of the current department | Yes (team inbox) | No                       |
| Head of the requester's department      | Yes              | No                       |
| Mentioned person or department          | Yes              | No (cannot be mentioned) |
| Departments it passed through           | Yes, read-only   | No                       |
| Admin                                   | Yes              | Yes                      |
| Anyone else                             | No               | No                       |

The same rule decides every list, count, badge, search result, report and export. There
is no second code path that could show more.

## Doing things

| Action                         | Requester | Handler (member) | Head of current dept     | Mentioned (rule on) | Passed through | Admin                    |
| ------------------------------ | --------- | ---------------- | ------------------------ | ------------------- | -------------- | ------------------------ |
| Reply to requester             | Yes       | Yes              | Yes                      | Yes                 | No             | Yes                      |
| Add internal note              | No        | Yes              | Yes                      | Yes                 | No             | Yes                      |
| Read internal notes            | No        | Yes              | Yes                      | Yes                 | Yes            | Yes                      |
| Change priority or status      | No        | Yes              | Yes                      | No                  | No             | Yes                      |
| Forward (reason required)      | No        | Yes              | Yes                      | No                  | No             | Yes                      |
| Resolve, merge, add sub-ticket | No        | Yes              | Yes                      | No                  | No             | Yes                      |
| Pick up an unassigned ticket   | No        | Yes              | Yes                      | No                  | No             | Yes                      |
| Assign or reassign anyone      | No        | No               | Yes                      | No                  | No             | Yes                      |
| Bulk actions                   | No        | No               | Yes                      | No                  | No             | Yes                      |
| Escalate to next level         | Yes       | Yes              | No (they are the target) | No                  | No             | No (they are the target) |
| Acknowledge level 1            | No        | No               | Yes                      | No                  | No             | Yes                      |
| Acknowledge level 2            | No        | No               | No                       | No                  | No             | Yes                      |
| Turn confidentiality on or off | No        | No               | Yes                      | No                  | No             | Yes                      |
| Rate or reopen when resolved   | Yes       | No               | No                       | No                  | No             | No                       |

Notes:

- With the "Mentioned departments can reply" rule switched off, mentioned people and
  departments can still read the ticket but cannot reply or add notes.
- Resolved and closed tickets cannot be edited; the requester reopens them.
- The head of the requester's department sees the ticket as the requester does: no
  internal notes.
- On a confidential ticket, losing the role loses access. A cleared assignee, or the
  previous head after a forward, can no longer open it.

## Administration

Only admins see Administration (departments, people, SLA, rules, templates, channels,
retention, audit log). Every change there writes an audit-log entry.
