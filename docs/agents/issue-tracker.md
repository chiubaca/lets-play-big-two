# Issue tracker: Local Markdown

Issues and plans for this repo live as Markdown files in `.scratch/`.

## Conventions

- One effort per directory: `.scratch/<feature-slug>/`.
- A PRD, when needed, is `.scratch/<feature-slug>/PRD.md`.
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Triage state is a `Status:` line near the top of each issue file (see `triage-labels.md`).
- Comments and conversation history append under `## Comments`.
- To publish an issue, create a file in that effort's directory. To fetch it, read the path.

## Wayfinding operations

- The canonical map is `.scratch/<feature-slug>/map.md`, with `Labels: wayfinder:map` and a stable title. Its child tickets live under `.scratch/<feature-slug>/issues/` with sequential numbers and a `Parent: ../map.md` line.
- Each ticket has `Title:`, `Status: open|closed`, `Labels: wayfinder:<type>`, `Assignee: unassigned|<developer>`, and `Blocked by:` fields above its `## Question`. The file path is its identity; display its linked title rather than a bare number.
- A ticket is claimed by setting `Assignee:` to the developer before work. An open, unassigned child whose `Blocked by:` paths all point to closed tickets is on the frontier. Query by listing the child issue files and reading only their metadata first.
- Wire blocking edges after creating all tickets, using relative file paths in `Blocked by:` (comma-separated; `none` when unblocked). The same convention applies to subsequently added tickets.
- Resolve with an answer under `## Comments` headed `### Resolution`, then set `Status: closed` and add a linked one-line gist under the map's `## Decisions so far`. Keep full answers in the ticket, not the map.
- If a ticket is out of scope, close it and link it under the map's `## Out of scope` instead of `## Decisions so far`.
