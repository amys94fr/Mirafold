# Contributing to Mirafold

Thanks for thinking about contributing. Mirafold is a one-person project that benefits a lot from outside eyes.

## Reporting issues

Before opening a bug:

1. Make sure you're running the latest commit on `main`.
2. Restart the Python sidecar — many "the UI is stuck" issues come from a stale sidecar after a code change. Either close Mirafold and reopen, or `pnpm tauri:dev` again.
3. Run `curl http://127.0.0.1:8765/health` to confirm the sidecar is responding.
4. Check the dev console: Right-click in the Mirafold window → **Inspect Element** (Tauri dev only).
5. Include your Windows version, Python version, GPU presence (CPU-only is the supported default), and the contents of the relevant section of `%LOCALAPPDATA%\Mirafold\` (you can paste the file list).

## Suggesting features

Open an issue with the `enhancement` label. Describe:

- What problem you're solving (not just the solution).
- A rough sketch of the UX you imagine.
- Whether you'd be open to driving a PR.

Features that fit Mirafold's identity:
- Anything that improves accuracy or speed of the existing ML pipeline.
- Things that work offline.
- Quality-of-life UI: keyboard shortcuts, batch operations, smarter defaults.

Features that probably won't be merged:
- Cloud sync / multi-user.
- Anything that uploads photos to a remote service.
- Web-hosted deployments.

## Pull requests

1. Fork, branch from `main`.
2. Match the existing code style. The Rust crate uses `rustfmt` defaults. The frontend uses `tsc --noEmit` strict — no `any`, no unused vars.
3. Add a brief screenshot in the PR description for UI changes.
4. Keep commits squashed and the message readable. Reference the issue if there is one.
5. Be patient — PRs are reviewed when time allows.

## Development setup

```bash
git clone https://github.com/amys94fr/mirafold.git
cd mirafold
pnpm install
pip install --user -r apps/ml-service/requirements.txt
pnpm tauri:dev
```

First build: 3–5 min for Cargo. After that the incremental build is fast.

### Tips

- **HMR works** for React. Edit a `.tsx` file and watch the Mirafold window update live.
- **Python changes don't HMR.** Kill the sidecar (`Get-NetTCPConnection -LocalPort 8765 -State Listen | Stop-Process -Id $_.OwningProcess`) and the Tauri shell will spawn a fresh one — or just restart Mirafold.
- **Icon changes** require `cargo clean -p mirafold` to re-embed the Windows resource. See [`memory/tauri_icon_rebuild.md`](memory/tauri_icon_rebuild.md) (in the project's claude-memory layer) for the details.
- **Database**: stored at `%LOCALAPPDATA%\Mirafold\library.db`. Delete it to start fresh — Mirafold will re-index on the next scan.

## Layout

```
apps/
  desktop/        Tauri 2 + React 19 + Vite + Tailwind v4
    src/          React app
    src-tauri/    Rust shell, embeds the .ico, spawns the Python sidecar
  ml-service/     Python sidecar (FastAPI)
    mirafold_ml/  All the modules: scanner, hashing, clip_embed, faces,
                  duplicates, exif, geocoding, ops, thumbnails, db, progress
scripts/          Build helpers (icon generator)
```

## Code of conduct

Be civil. Disagreement is welcome, condescension and harassment are not. Maintainers reserve the right to lock or remove threads that go sideways.
