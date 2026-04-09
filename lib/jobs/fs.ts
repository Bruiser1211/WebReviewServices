import { promises as fs } from "node:fs";
import path from "node:path";

import { appConfig } from "@/lib/config";

import type { JobSourceFile } from "./types";

const getArtifactPath = (tempDir: string, fileName: string) => path.join(tempDir, fileName);

export const ensureJobsRoot = async () => {
  await fs.mkdir(appConfig.jobsRoot, { recursive: true });
};

export const createJobTempDir = async (jobId: string) => {
  await ensureJobsRoot();

  const tempDir = path.join(appConfig.jobsRoot, jobId);
  await fs.mkdir(tempDir, { recursive: true });

  return tempDir;
};

export const saveUploadedFile = async (
  tempDir: string,
  file: File,
  index: number
): Promise<JobSourceFile> => {
  const safeBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${String(index).padStart(2, "0")}_${safeBaseName}`;
  const filePath = path.join(tempDir, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await fs.writeFile(filePath, buffer);

  return {
    name: file.name,
    storedName,
    path: filePath,
    mimeType: file.type || "application/octet-stream",
    size: buffer.byteLength
  };
};

export const writeTextArtifact = async (
  tempDir: string,
  fileName: string,
  content: string
) => {
  const artifactPath = getArtifactPath(tempDir, fileName);
  await fs.writeFile(artifactPath, content, "utf8");
  return artifactPath;
};

export const readTextArtifact = async (tempDir: string, fileName: string) => {
  const artifactPath = getArtifactPath(tempDir, fileName);
  return fs.readFile(artifactPath, "utf8");
};

export const removeJobTempDir = async (tempDir: string) => {
  await fs.rm(tempDir, { recursive: true, force: true });
};
