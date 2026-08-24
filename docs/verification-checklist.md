# Integration verification checklist

Run this with a fresh test event, three customer accounts, an organiser account, and one admin account. For fast expiry checks, temporarily set hold and offer TTL variables to `1`, restart the API/worker, then restore them to `10`.

| Scenario | Expected result | Status in this workspace |
| --- | --- | --- |
| QR booking | Confirm a held seat and scan/display QR | Build/unit checked; requires live provider test |
| Email | Configure Resend, confirm booking, inspect email | Requires user’s Resend key/domain |
| Cancellation | Cancel confirmed booking from **My tickets** | Seat becomes AVAILABLE and notification emits |
| Waitlist FIFO | Join two customers to same category, cancel sold seat | First customer gets OFFERED seat/email |
| Offer expiry | Do not accept first offer before TTL | First offer EXPIRED; second gets offer |
| Offer accept | Accept before TTL, then confirm | Seat becomes caller-owned HELD, then BOOKED |
| Hold expiry | Reserve and wait past TTL | Seat becomes AVAILABLE |
| Concurrent hold | Submit same seat from two accounts simultaneously | Exactly one `200`; other receives `409` |
| Live update | Open same event in two browsers | Other browser reflects HELD/BOOKED/AVAILABLE/OFFERED |
| Organiser summary | Request own event summary | Correct seat-state counts, confirmed booking count, revenue |
| Role boundaries | Customer calls venue/summary endpoints; organiser calls other organiser summary | `403` where unauthorized |

Current local evidence: unit tests, production build, and Prisma schema validation pass. The configured Redis hostname cannot currently be resolved from this machine, PostgreSQL connectivity also fails here, and Resend credentials are intentionally absent; therefore the live rows remain pending until working provider connectivity and a verified sender are supplied. `npm run test` and `npm run build` are repeatable local checks.
