import { promises as fs } from "node:fs";
import path from "node:path";

import { writeTextArtifact } from "@/lib/jobs/fs";

import type { JobRecord } from "./types";

type ExtractionResult = {
  extractedText: string;
  imagePaths: string[];
  warnings: string[];
  artifacts: string[];
};

const extractPdfText = async (filePath: string) => {
  const pdfParseModule = await import("pdf-parse");
  const pdfParse = pdfParseModule.default;
  const buffer = await fs.readFile(filePath);
  const result = await pdfParse(buffer);
  return result.text?.trim() ?? "";
};

const truncateForPrompt = (text: string, maxChars: number) => {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n\n[중략: 문서가 길어 앞부분 위주로 전달됨]`;
};

export const extractJobInputs = async (job: JobRecord): Promise<ExtractionResult> => {
  const warnings: string[] = [];
  const artifacts: string[] = [];
  const textBlocks: string[] = [];
  const imagePaths: string[] = [];

  for (const file of job.sourceFiles) {
    const extension = path.extname(file.name).toLowerCase();

    if (extension === ".pdf") {
      try {
        const pdfText = await extractPdfText(file.path);

        if (pdfText.length < 120) {
          warnings.push(
            `${file.name}: 추출된 텍스트가 매우 짧습니다. 스캔본이면 OCR이 별도로 필요할 수 있습니다.`
          );
        }

        const normalized = truncateForPrompt(pdfText, 20_000);
        textBlocks.push(`## PDF: ${file.name}\n${normalized}`);
        artifacts.push(await writeTextArtifact(job.tempDir, `${file.storedName}.txt`, normalized));
      } catch (error) {
        warnings.push(
          `${file.name}: PDF 텍스트 추출에 실패했습니다. 원인: ${
            error instanceof Error ? error.message : "알 수 없는 오류"
          }`
        );
      }
      continue;
    }

    if (file.mimeType.startsWith("image/")) {
      imagePaths.push(file.path);
      warnings.push(`${file.name}: 이미지는 원본을 첨부해 분석합니다.`);
      continue;
    }

    warnings.push(`${file.name}: 지원되지 않는 형식이어서 분석에서 제외되었습니다.`);
  }

  const extractedText = textBlocks.join("\n\n").trim();

  if (!extractedText && imagePaths.length === 0) {
    warnings.push("분석 가능한 텍스트나 이미지가 준비되지 않았습니다.");
  }

  return {
    extractedText,
    imagePaths,
    warnings,
    artifacts
  };
};
