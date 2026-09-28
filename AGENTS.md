# Agent instructions

Before making a change, read [the development guide](docs/DEVELOPMENT.md) and inspect the source files that own the behavior. Keep changes within the user's requested scope; do not adjust gameplay balance, rendering, audio, or platform behavior as collateral work.

- Keep game rules deterministic and in `src/game/`; keep DOM and React concerns in `src/ui/` and `src/App.tsx`.
- Follow the TypeScript constraints in the development guide, especially `import type`, `erasableSyntaxOnly`, and `verbatimModuleSyntax`.
- Never add real credentials, IDs, keystores, or generated secrets to the repository. Do not read or print GitHub secret values.
- Run the checks that the task requires and report only checks actually run. Do not add dependencies unless requested or needed to fix a verified failure.
- Follow the user's current instructions for branch, commit, push, and pull-request handling. Do not assume a PR is wanted when the user requests a direct push.
