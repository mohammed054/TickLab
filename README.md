# TickLab Radar

Windows desktop app (Electron + TypeScript + React) that watches new Solana DEX launches, scores risk with transparent rules,
and keeps a paper + real decision journal. Research tool only: it never holds keys and never signs or sends transactions.

    npm install
    npm run dev         # development
    npm test            # unit tests (vitest)
    npm run typecheck && npm run lint
    npm run build       # electron-vite build -> out/
    npm run dist        # Windows NSIS installer (run on Windows)
    npm run p0:capture -- --hours 0.05   # Phase 0 scripts, see docs/build-spec/

See `docs/USER-GUIDE.md` for use, `QUESTIONS.md` for open questions, `STATUS.md` for what is done and what needs the owner.
