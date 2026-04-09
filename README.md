# Internal Doc Review Platform

Internal-network document review platform for one-off Korean document and contract checks.

## Development

```bash
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`.

## Internal Network Run

For internal-network serving, use the production path:

```bash
npm.cmd run build
npm.cmd run start
```

This project now binds to `0.0.0.0:3000` for both `dev` and `start`.

## Note About `spawn EPERM`

In this Codex sandbox environment, `next dev` can fail with `spawn EPERM` because Next.js development mode uses child-process forking internally.

- This is an execution-environment restriction, not an app-code bug.
- `npm.cmd run build` works.
- `npm.cmd run start` works and is the preferred path for actual internal serving.

## Windows Launcher

Use the launcher entrypoint below to open the simple Windows control app without leaving a console window open:

```text
launcher\InternalDocReviewLauncher.vbs
```

The launcher provides:

- `서버 실행`
- `서버 중지`

It controls the server through `scripts/server-control.mjs`, which uses the production route:

- `build`
- `start`
