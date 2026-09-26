# Triage labels

The local tracker records these roles as a `Status:` value for triage issues.

| Role              | Local status      | Meaning                       |
| ----------------- | ----------------- | ----------------------------- |
| `needs-triage`    | `needs-triage`    | Maintainer evaluation needed  |
| `needs-info`      | `needs-info`      | Waiting on reporter           |
| `ready-for-agent` | `ready-for-agent` | Fully specified and AFK-ready |
| `ready-for-human` | `ready-for-human` | Needs human implementation    |
| `wontfix`         | `wontfix`         | Will not be actioned          |

Wayfinder tickets use their own open/closed status and a `wayfinder:<type>` label.
