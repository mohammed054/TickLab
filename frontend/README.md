# TickLab Desktop App

TickLab is a Windows desktop application packaged with Tauri. Its interface is bundled into the native app; users launch TickLab from its desktop shortcut or installer.

## Run the desktop app during development

```powershell
npm ci
npm run tauri:dev
```

`tauri:dev` opens a native TickLab window. Vite runs privately on loopback as Tauri's development asset server; it is not a user-facing launch target.

## Build the Windows app

```powershell
npm run check
npm run tauri:build
```

The installer and executable are produced under `src-tauri/target/release/bundle/` and `src-tauri/target/release/`. Building requires Rust, Cargo, and Visual Studio Build Tools with the MSVC SDK.

## Local data service

The data service is a separate local process and must be running for market-data import. From the repository root:

```powershell
python -m uvicorn backend.data.app.main:app --host 127.0.0.1 --port 8000
```

The native app connects to this loopback service. No browser tab or hosted site is part of the user launch flow.
