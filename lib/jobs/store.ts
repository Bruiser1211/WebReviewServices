import { removeJobTempDir } from "@/lib/jobs/fs";

import type { JobProgressEvent, JobRecord, JobSnapshot } from "./types";

type JobListener = (event: JobProgressEvent) => void;

const jobs = new Map<string, JobRecord>();
const listeners = new Map<string, Set<JobListener>>();
const cleanupTimers = new Map<string, NodeJS.Timeout>();

const toSnapshot = (job: JobRecord): JobSnapshot => {
  const { tempDir, ...snapshot } = job;
  void tempDir;
  return snapshot;
};

const notify = (job: JobRecord) => {
  const event: JobProgressEvent = {
    jobId: job.jobId,
    status: job.status,
    progressMessage: job.progressMessage,
    timestamp: job.updatedAt,
    resultAvailable: job.results.length > 0
  };

  const jobListeners = listeners.get(job.jobId);
  if (!jobListeners) {
    return;
  }

  for (const listener of [...jobListeners]) {
    try {
      listener(event);
    } catch {
      jobListeners.delete(listener);
    }
  }

  if (jobListeners.size === 0) {
    listeners.delete(job.jobId);
  }
};

export const createJobRecord = (job: JobRecord) => {
  jobs.set(job.jobId, job);
  notify(job);
  return job;
};

export const getJobRecord = (jobId: string) => jobs.get(jobId) ?? null;

export const getJobSnapshot = (jobId: string) => {
  const job = getJobRecord(jobId);
  return job ? toSnapshot(job) : null;
};

export const updateJobRecord = (
  jobId: string,
  updater: (job: JobRecord) => JobRecord
) => {
  const current = jobs.get(jobId);
  if (!current) {
    return null;
  }

  const updated = updater(current);
  jobs.set(jobId, updated);
  notify(updated);
  return updated;
};

export const subscribeToJob = (jobId: string, listener: JobListener) => {
  const set = listeners.get(jobId) ?? new Set<JobListener>();
  set.add(listener);
  listeners.set(jobId, set);

  const job = jobs.get(jobId);
  if (job) {
    listener({
      jobId,
      status: job.status,
      progressMessage: job.progressMessage,
      timestamp: job.updatedAt,
      resultAvailable: job.results.length > 0
    });
  }

  return () => {
    const current = listeners.get(jobId);
    if (!current) {
      return;
    }

    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(jobId);
    }
  };
};

export const deleteJobRecord = async (jobId: string) => {
  const timer = cleanupTimers.get(jobId);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(jobId);
  }

  const job = jobs.get(jobId);
  if (!job) {
    return false;
  }

  jobs.delete(jobId);
  listeners.delete(jobId);
  await removeJobTempDir(job.tempDir);
  return true;
};

export const scheduleJobCleanup = (jobId: string, expiresAt: string) => {
  const existing = cleanupTimers.get(jobId);
  if (existing) {
    clearTimeout(existing);
  }

  const delay = Math.max(new Date(expiresAt).getTime() - Date.now(), 1_000);

  const timer = setTimeout(async () => {
    await deleteJobRecord(jobId);
  }, delay);

  cleanupTimers.set(jobId, timer);
};

export const countJobs = () => jobs.size;
