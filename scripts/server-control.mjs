import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { access, open } from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const serverRoot = path.join(root, "tmp", "server");
const pidFilePath = path.join(serverRoot, "server.json");
const stdoutPath = path.join(serverRoot, "server.out.log");
const stderrPath = path.join(serverRoot, "server.err.log");
const npmCommand = process.platform === "win32" ? "cmd.exe" : "npm";
const host = "0.0.0.0";
const port = 3000;

const command = process.argv[2];

const ensureServerRoot = async () => {
  await mkdir(serverRoot, { recursive: true });
};

const fileExists = async (targetPath) => {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const readPidFile = async () => {
  if (!(await fileExists(pidFilePath))) {
    return null;
  }

  try {
    const content = await readFile(pidFilePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
};

const removePidFile = async () => {
  if (await fileExists(pidFilePath)) {
    await rm(pidFilePath, { force: true });
  }
};

const isProcessRunning = (pid) => {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const healthUrl = `http://127.0.0.1:${port}/api/health`;

const checkHealth = async () => {
  try {
    const response = await fetch(healthUrl, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
};

const emit = (payload, exitCode = 0) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(exitCode);
};

const buildProject = async () => {
  await ensureServerRoot();

  const stdoutHandle = await open(stdoutPath, "a");
  const stderrHandle = await open(stderrPath, "a");

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        npmCommand,
        process.platform === "win32"
          ? ["/d", "/s", "/c", "npm.cmd run build"]
          : ["run", "build"],
        {
        cwd: root,
        windowsHide: true,
        stdio: ["ignore", stdoutHandle.fd, stderrHandle.fd]
        }
      );

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`Build failed with exit code ${code ?? "unknown"}.`));
      });
    });
  } finally {
    await stdoutHandle.close();
    await stderrHandle.close();
  }
};

const waitForHealthyServer = async (timeoutMs) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await checkHealth()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
};

const startServer = async () => {
  await ensureServerRoot();

  const current = await readPidFile();
  if (current && isProcessRunning(current.pid)) {
    emit({
      ok: true,
      status: "running",
      pid: current.pid,
      url: `http://localhost:${port}`
    });
  }

  await buildProject();

  const stdoutHandle = await open(stdoutPath, "a");
  const stderrHandle = await open(stderrPath, "a");

  const child = spawn(
    npmCommand,
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm.cmd run start"]
      : ["run", "start"],
    {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", stdoutHandle.fd, stderrHandle.fd]
    }
  );

  child.unref();
  await stdoutHandle.close();
  await stderrHandle.close();

  const pidRecord = {
    pid: child.pid,
    host,
    port,
    startedAt: new Date().toISOString()
  };

  await writeFile(pidFilePath, JSON.stringify(pidRecord, null, 2), "utf8");

  const healthy = await waitForHealthyServer(20000);
  if (!healthy) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    await removePidFile();
    emit(
      {
        ok: false,
        status: "failed",
        message: "서버를 시작했지만 health check에 응답하지 않았습니다.",
        logs: {
          stdout: stdoutPath,
          stderr: stderrPath
        }
      },
      1
    );
  }

  emit({
    ok: true,
    status: "running",
    pid: child.pid,
    url: `http://localhost:${port}`,
    networkUrl: `http://<내부망 IP>:${port}`
  });
};

const stopServer = async () => {
  const current = await readPidFile();
  if (!current || !isProcessRunning(current.pid)) {
    await removePidFile();
    emit({
      ok: true,
      status: "stopped",
      message: "중지할 서버가 없습니다."
    });
  }

  const stopResult = spawnSync("taskkill", ["/PID", String(current.pid), "/T", "/F"], {
    windowsHide: true
  });

  const stopped = !isProcessRunning(current.pid);
  await removePidFile();

  if (!stopped && stopResult.status !== 0) {
    emit(
      {
        ok: false,
        status: "failed",
        message: "서버 중지 중 오류가 발생했습니다."
      },
      1
    );
  }

  emit({
    ok: true,
    status: "stopped",
    message: "서버를 중지했습니다."
  });
};

const getStatus = async () => {
  const current = await readPidFile();
  const running = current ? isProcessRunning(current.pid) : false;
  const healthy = running ? await checkHealth() : false;

  if (!current || !running) {
    await removePidFile();
    emit({
      ok: true,
      status: "stopped",
      running: false
    });
  }

  emit({
    ok: true,
    status: healthy ? "running" : "starting",
    running: true,
    pid: current.pid,
    url: `http://localhost:${port}`,
    healthy
  });
};

if (command === "start") {
  await startServer();
}

if (command === "stop") {
  await stopServer();
}

if (command === "status") {
  await getStatus();
}

emit(
  {
    ok: false,
    status: "failed",
    message: "지원되지 않는 명령입니다. start, stop, status 중 하나를 사용하세요."
  },
  1
);
