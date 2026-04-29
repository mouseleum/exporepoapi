# Decisions

## 2026-04-29 — Defer live success-path contract verification

Phase 0 contract verification covered error paths and one matched:false PDL response live; Anthropic 200 and PDL matched:true live verification deferred due to credit exhaustion. Risk accepted; mocked tests cover field mapping. Re-verify post-credit-topup as low priority.

## 2026-04-29 — Native flat-config ESLint, no eslint-config-next

We wire React + Next.js lint rules directly via eslint-plugin-react, eslint-plugin-react-hooks, and @next/eslint-plugin-next instead of eslint-config-next, because eslint-config-next's FlatCompat layer hits a circular-reference serialization error under ESLint 10.
