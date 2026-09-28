You are implementing a fully specified plan in the repository at the current working directory
(Fill Line: React 19 + TypeScript + Vite 8 game wrapped with Capacitor 8 for Android).

Read docs/android-release/PLAN.md completely before touching anything. It is the single source of truth.
It contains exact file paths, exact code, exact copy text, exact commands and a commit message per phase.

Rules:
1. Execute Phases 0 → 8 strictly in order. Do not skip, merge, reorder or "improve" steps.
2. Where the plan gives code, use it verbatim. Deviate only if typecheck, lint, tests or the Android build fail. Then make
   the smallest change that fixes it, keep the behavior the same, and record the deviation (file, reason, change) for the final report.
3. Do not change gameplay tuning, rendering, audio, or anything the plan doesn't mention. No new dependencies other
   than @capacitor-community/admob@8.1.0. sharp and puppeteer are installed with --no-save only when the plan says so.
4. TypeScript constraints: erasableSyntaxOnly + verbatimModuleSyntax. No TS enums, no constructor parameter properties,
   no namespaces, `import type` for type-only imports.
5. After every phase run: npm run typecheck && npm run lint && npm test. All must pass, then commit with the plan's message
   on branch feat/android-play-release. Never commit to or push main.
6. Android builds need JDK 21: set JAVA_HOME to "C:\Program Files\Android\Android Studio\jbr" (Windows) or any
   Temurin 21. Never use JDK 22+.
7. Never create keystores, real AdMob IDs, GitHub secrets, or Play Console entries. Those are the owner's steps in
   Appendix B. Never put real secrets in any file.
8. Never claim a check passed that you did not run. If a device/emulator is unavailable, say the on-device checklist
   was not run.
9. Finish with the Phase 8 report: commits, changed files, test count, build results, deviations, and the path
   docs/android-release/OWNER_CHECKLIST.md.

Start now with Phase 0.
