import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { appConfig } from "@/lib/config";

import type { CodexModel, ReasoningEffort } from "@/lib/codex/options";
import type { ReviewResult, TaskUsageResult } from "@/lib/jobs/types";

type CodexExecParams = {
  cwd: string;
  prompt: string;
  outputFilePath: string;
  imagePaths: string[];
  model: CodexModel;
  reasoningEffort: ReasoningEffort;
};

type CodexExecOutput = {
  review: ReviewResult;
  usage: TaskUsageResult;
};

const emptyUsageResult = (): TaskUsageResult => ({
  tokens: {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedPromptTokens: 0,
    reasoningTokens: 0
  },
  cost: {
    inputUsd: 0,
    cachedInputUsd: 0,
    outputUsd: 0,
    totalUsd: 0
  }
});

export class CodexExecError extends Error {
  readonly statusCode: number | null;
  readonly details: string;
  readonly responseBody: string;
  readonly requestModel: string;
  readonly endpoint: string;
  readonly summary: string | null;

  constructor({
    details,
    responseBody,
    requestModel
  }: {
    details: string;
    responseBody: string;
    requestModel: string;
  }) {
    super("codex exec 실행이 실패했습니다.");

    this.name = "CodexExecError";
    this.statusCode = null;
    this.details = details;
    this.responseBody = responseBody;
    this.requestModel = requestModel;
    this.endpoint = "codex exec";
    this.summary = details.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
  }

  toLogString() {
    return [
      `Error: ${this.message}`,
      `Model: ${this.requestModel}`,
      `Command: ${this.endpoint}`,
      this.details ? `DETAILS\n${this.details}` : null,
      this.responseBody ? `OUTPUT\n${this.responseBody}` : null
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}

const resolveCodexExecutable = () => {
  const explicitPath = process.env.CODEX_CLI_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  return process.platform === "win32" ? "codex.cmd" : "codex";
};

const runCodexProcess = async ({
  cwd,
  prompt,
  outputFilePath,
  imagePaths,
  model,
  reasoningEffort
}: CodexExecParams) => {
  const schemaPath = path.join(process.cwd(), "schemas", "review-result.schema.json");

  const args = [
    "exec",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputFilePath,
    "--model",
    model,
    "--config",
    `model_reasoning_effort="${reasoningEffort}"`,
    "-"
  ];

  for (const imagePath of imagePaths) {
    args.splice(args.length - 1, 0, "--image", imagePath);
  }

  const codexExecutable = resolveCodexExecutable();

  await new Promise<void>((resolve, reject) => {
    const needsShell =
      process.platform === "win32" && /\.(cmd|bat)$/i.test(codexExecutable.trim());

    const child = spawn(codexExecutable, args, {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: needsShell
    });

    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;

    const timeoutHandle = setTimeout(() => {
      killedByTimeout = true;
      child.kill();
    }, appConfig.openAiRequestTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(
        new CodexExecError({
          details: `codex 실행 파일을 시작하지 못했습니다: ${error.message}`,
          responseBody: stderr || stdout,
          requestModel: model
        })
      );
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);

      if (killedByTimeout) {
        reject(
          new CodexExecError({
            details: `codex exec 요청 제한 시간(${Math.round(appConfig.openAiRequestTimeoutMs / 1000)}초)을 초과했습니다.`,
            responseBody: stderr || stdout,
            requestModel: model
          })
        );
        return;
      }

      if (code !== 0) {
        reject(
          new CodexExecError({
            details: `codex exec 종료 코드: ${code ?? "unknown"}`,
            responseBody: stderr || stdout,
            requestModel: model
          })
        );
        return;
      }

      resolve();
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
};

export const runCodexExec = async (params: CodexExecParams): Promise<CodexExecOutput> => {
  await runCodexProcess(params);

  let review: ReviewResult;
  try {
    const raw = await fs.readFile(params.outputFilePath, "utf8");
    review = JSON.parse(raw) as ReviewResult;
  } catch (error) {
    throw new Error(
      `codex exec 결과 파일을 읽거나 파싱하지 못했습니다. ${error instanceof Error ? error.message : ""}`.trim()
    );
  }

  return {
    review,
    usage: emptyUsageResult()
  };
};
