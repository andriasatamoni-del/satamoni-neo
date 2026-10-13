---
name: linear-ticket
description: Draft and create a Linear ticket for satamoni-neo in the team's fixed structure (summary, steps to reproduce, root cause, impact, acceptance criteria…) with exactly one kind label (Bug, Enhancement, Feature) and one or more area labels (FE, BE, Database, Infra). Investigates the code to fill in root cause and file references, shows the draft, and creates the ticket only after the user approves. Use when the user asks to "open a ticket", "file a bug", "create a Linear issue", "log this in Linear", or runs /linear-ticket.
argument-hint: "[what the ticket is about]"
---

# Create a Linear ticket: classify → investigate → draft → approve → create

The argument describes the problem or the work. If it's empty, the ticket is about what was discussed in this conversation. If that's unclear too, ask the user what the ticket is for and stop.

Never create the ticket before the user approves the draft. Never invent facts: what you don't know goes in as `Unknown`.

## 1. Classify

Pick **exactly one kind**:

| Kind | Use when |
|---|---|
| `Bug` | Existing behavior is wrong: crash, bad data, wrong total, broken screen. |
| `Enhancement` | Existing behavior works but should change: faster, clearer, more options. |
| `Feature` | A capability that doesn't exist yet: new screen, endpoint, report, integration. |

Pick **one or more areas**, based on where the change will land (not where the symptom shows):

| Area | Covers |
|---|---|
| `FE` | `frontend/`: pages, storefront, offline cashier mode. |
| `BE` | `backend/src`: contexts, handlers, controllers, events, guards. |
| `Database` | Drizzle tables, migrations in `backend/drizzle/`, constraints, triggers, data fixes. |
| `Infra` | Render, `.github/workflows/`, Docker, backups, env vars, monitoring. |

If the kind is genuinely ambiguous (e.g. "is missing X a bug or a feature?"), ask with AskUserQuestion. Otherwise decide and show it in the draft; the user can correct it there.

## 2. Investigate the code

Fill the technical sections from the repo, not from guesses:

- Find the code involved (Grep/Glob, or an Explore agent for wide searches) and cite it as repo-relative `path:line`. Never write absolute local paths.
- **Bugs:** trace the failing path and state the root cause. Mark it **Confirmed** only if you read the code that produces the behavior (or reproduced it). Otherwise write **Hypothesis:** followed by the leading explanation and what would confirm it.
- **Enhancements / features:** find the context, handlers, pages and tables that will change, so the technical sections name real files.
- Check the project rules in `CLAUDE.md` that the work touches and mention them where relevant: business date (`businessDateSql`, never `::date`), forward-only migrations, `strict` accounting enforcement, `@BranchScoped` / `@BranchResource` on branch-owned endpoints, permission registration in `onModuleInit()`.

Keep investigation proportional: a few targeted searches, not an audit. Don't change any code.

## 3. Draft

Read the template for the kind and fill every section:

- Bug → [templates/bug.md](templates/bug.md)
- Enhancement → [templates/enhancement.md](templates/enhancement.md)
- Feature → [templates/feature.md](templates/feature.md)

Rules:
- **Title:** `<context>: <summary>`, under 80 characters. The context is the bounded context or page (`orders`, `accounting`, `inventory`, `storefront`, `kds`, `ci`…). Bugs describe the symptom ("Sales after midnight count toward the next day"); enhancements and features start with a verb ("Add supplier filter to purchase orders").
- **Every section stays.** If there's no information, write `Unknown` and what would answer it. The one exception: in "Technical approach" / "Technical design", keep only the area subsections that carry a label.
- **Priority:**
  - `Urgent`: money, data loss, security, or the POS is down.
  - `High`: a core flow is broken with no workaround, or anything touching journals, payments or stock.
  - `Medium`: broken with a workaround, or normal planned work.
  - `Low`: polish.
- English for structure and technical text. Quote Arabic UI strings exactly as they appear.
- Acceptance criteria are checkboxes someone can test. Bugs always include "Regression test added". Features with new endpoints always include branch-isolation coverage.

Show the user the full draft: title, kind, areas, priority, then the description markdown. Ask them to approve or edit it. Apply edits and show the draft again until they approve.

## 4. Create in Linear

Load the Linear MCP tools with ToolSearch (query `linear`). The tools are named `mcp__linear__*` (e.g. `list_teams`, `list_issue_labels`, `create_issue_label`, `list_issues`, `create_issue`).

**If the Linear server isn't connected or the tools don't load:** say so, tell the user to reconnect it with `/mcp`, and give them the final draft so nothing is lost. Stop there.

Otherwise:

1. **Team.** List the teams. If there's exactly one, use it. If there are several, ask which one, unless the user already named it.
2. **Duplicates.** Search the team's open issues for the key terms of the title. If a likely duplicate exists, show it and ask whether to continue, comment on it instead, or stop.
3. **Labels.** List the team's and workspace's labels and match the kind and area labels by name, case-insensitively. They may live in label groups named `Kind` and `Area`. If any are missing, list them and ask before creating them. Labels are shared across the workspace. When approved, create them as groups `Kind` and `Area` with these colors: Bug `#C9372C`, Enhancement `#2A6FDB`, Feature `#1F8A52`, FE `#B4499B`, BE `#C47A12`, Database `#2B8A8A`, Infra `#6A5ACD`.
4. **Create** the issue with the approved title and description, the label IDs, and the priority (Linear values: Urgent `1`, High `2`, Medium `3`, Low `4`). Set a project, assignee or cycle only if the user asked for one.
5. **Report** the issue identifier and URL in one line.

## 5. Several tickets at once

When the user describes several problems, split them into one ticket per independent problem. Draft them all, get one approval for the batch (individual edits allowed), then create them in order. If one issue blocks another, link them with a "Blocked by" line in the "Related" section.
