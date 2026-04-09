import path from "node:path";

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNonNegativeInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const parseNonNegativeFloat = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseFloat(value ?? "");

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export type OpenAIModelPricing = {
  inputPer1MUsd: number;
  cachedInputPer1MUsd: number;
  outputPer1MUsd: number;
};

const sanitizeBaseUrl = (value: string | undefined) =>
  (value?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");

const parseOpenAIModelPricing = (
  value: string | undefined
): Record<string, OpenAIModelPricing> => {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, Partial<OpenAIModelPricing>>;

    return Object.entries(parsed).reduce<Record<string, OpenAIModelPricing>>(
      (acc, [modelName, pricing]) => {
        if (!pricing || typeof pricing !== "object") {
          return acc;
        }

        const inputPer1MUsd =
          typeof pricing.inputPer1MUsd === "number" && Number.isFinite(pricing.inputPer1MUsd)
            ? Math.max(pricing.inputPer1MUsd, 0)
            : 0;
        const cachedInputPer1MUsd =
          typeof pricing.cachedInputPer1MUsd === "number" &&
          Number.isFinite(pricing.cachedInputPer1MUsd)
            ? Math.max(pricing.cachedInputPer1MUsd, 0)
            : 0;
        const outputPer1MUsd =
          typeof pricing.outputPer1MUsd === "number" && Number.isFinite(pricing.outputPer1MUsd)
            ? Math.max(pricing.outputPer1MUsd, 0)
            : 0;

        acc[modelName] = {
          inputPer1MUsd,
          cachedInputPer1MUsd,
          outputPer1MUsd
        };
        return acc;
      },
      {}
    );
  } catch {
    return {};
  }
};

export const appConfig = {
  jobTtlMinutes: parsePositiveInt(process.env.JOB_TTL_MINUTES, 1440),
  maxUploadMb: parsePositiveInt(process.env.MAX_UPLOAD_MB, 25),
  maxFilesPerJob: parsePositiveInt(process.env.MAX_FILES_PER_JOB, 5),
  jobsRoot: path.join(process.cwd(), "tmp", "jobs"),
  feedbackStorePath: process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "InternalDocReviewPlatform", "data", "declarations.json")
    : path.join(process.cwd(), "tmp", "declarations.json"),
  openAiApiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
  openAiApiBaseUrl: sanitizeBaseUrl(process.env.OPENAI_API_BASE_URL),
  openAiRequestTimeoutMs: parsePositiveInt(process.env.OPENAI_REQUEST_TIMEOUT_MS, 1_800_000),
  usageTokenLimitPerJob: parseNonNegativeInt(process.env.USAGE_TOKEN_LIMIT_PER_JOB, 0),
  usageCostLimitUsdPerJob: parseNonNegativeFloat(process.env.USAGE_COST_LIMIT_USD_PER_JOB, 0),
  openAiModelPricing: parseOpenAIModelPricing(process.env.OPENAI_MODEL_PRICING_JSON)
};

export const bytesFromMb = (mb: number) => mb * 1024 * 1024;
