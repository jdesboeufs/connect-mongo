# AGENTS GUIDE

Welcome! This file keeps lightweight coordination notes for anyone (human or AI) hacking on `connect-mongo`.

## Current Focus

1. Follow `docs/PLANS.md` for the prioritized maintenance backlog.
2. When picking up a task, append a short status note under the relevant section in `docs/PLANS.md` (e.g. `- [started YYYY-MM-DD] <task>`), then remove or update it when you finish.

## Workflow Expectations

- Run `yarn install && yarn build && yarn test` locally before opening or updating a PR unless the change is docs-only.
- Record any assumptions, surprises, or TODOs at the bottom of the touched file(s) in `// TODO(agent): ...` comments or in `docs/PLANS.md`.
- When working on a task, always follow PLAN, EDIT and REVIEW steps.
- When working on a task, always check if CHANGELOG.md or README.md need updates. If encounter breaking changes, add a note to CHANGELOG.md and also create separate migration docs if needed.
- Use `git commit --amend` to tidy up your commits before pushing, and prefer small, focused PRs that address a single task.
- Use context7 or web search to find relevant code snippets, tests, or docs that relate to the task at hand.

## Communication

- Prefer concise commit messages referencing the plan item, e.g. `fix: stabilize clear() semantics (plan#2)`.
- For complex changes, request a human review to ensure the change aligns with project goals and also ask for clarification on any ambiguous points in the plan.

Thanks for helping keep the project healthy!
