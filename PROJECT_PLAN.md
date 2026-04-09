# Internal Doc Review Platform Plan

## Source of Truth

This file is the working source of truth for the project.

- Project goal, scope, architecture, and sequencing are maintained here first.
- Future work should read this file before implementation or replanning.
- When a major decision changes, update the relevant section and append a note to the change log.

## Current Project Root

- Root path: `C:\Users\USER\.codex\Workspace\internal-doc-review-platform`
- Main planning file: `PROJECT_PLAN.md`
- All further scaffolding and implementation work should start from this folder.

## Project Summary

Build an internal-network web platform that accepts uploaded documents, lets the user choose a review task, runs Codex-based analysis with the existing Korean document and contract skills, shows live progress, and returns a structured review result page.

The platform is not a long-term document archive. It acts as:

- an internal upload and task submission gateway
- a temporary orchestration layer for file processing and Codex execution
- a review viewer for the current job result

## Primary Goals

- Allow internal users to access the service from an internal IP address in a browser.
- Support file uploads for `PDF`, `JPG`, `JPEG`, and `PNG`.
- Let the user choose a task using Korean labels.
- Run the mapped Codex skill flow for the selected task.
- Show stage-based progress while the job runs.
- Render a structured result page with summary, findings, risks, and recommended actions.
- Avoid long-term storage of uploaded source files and analysis outputs.
- Allow the user to save or download the final result artifact for that single job.

## Non-Goals For MVP

- Full user account system or complex role-based access control
- Multi-tenant data isolation across organizations
- Permanent document retention or search over old jobs
- Complex dashboard analytics
- Offline or fully air-gapped model execution
- Replacing the existing Codex skills with a new rules engine

## MVP Exclusions Locked For Now

The following should stay out of the first build unless requirements change explicitly:

- user account and permission management
- permanent job history, search, and archive screens
- multi-file batch review orchestration
- approval or sign-off workflow integration
- collaborative comments on result pages
- reporting dashboards or analytics pages
- deep OCR tuning and model comparison work
- Slack, email, or messenger notifications

The user has explicitly ruled out these features for this project:

- login
- past job search
- statistics dashboard
- collaboration comments
- approval workflow
- bulk processing

## Supported User Tasks

UI labels should be Korean. Backend execution should map to the existing skill or prompt lane.

| Korean Task Label | Internal Execution Target | Purpose |
| --- | --- | --- |
| `공문 검토` | `official-document-drafting` | Draft/review official Korean documents |
| `계약 조항 검토` | `contract-clause-review` | Review clauses, completeness, wording risk |
| `계약/지출 기준 판정` | `contract-expenditure-drafting` | Judge conformity to the internal 2026 standard |
| `지출결의 안내` | `expenditure-resolution-guide` | Explain processing flow and required steps |

## Core User Flow

1. User opens the service using an internal IP.
2. User uploads one or more files.
3. User selects one review task.
4. Service creates a new `job_id` and isolated temporary workspace.
5. Service extracts text or OCR output from the uploaded files.
6. Service builds a task-specific Codex prompt using the mapped skill lane.
7. Service runs `codex exec` non-interactively for the job.
8. Service streams stage updates to the browser.
9. User reviews the result page.
10. Temporary files and outputs are deleted immediately or by TTL cleanup.

## Recommended Technical Shape

### App Structure

- Frontend and backend in one `Next.js App Router` project
- Browser UI for upload, task selection, progress, and result viewing
- Server-side job orchestration through route handlers or server actions
- Temporary per-job filesystem workspace
- No permanent database in MVP unless restart resilience becomes mandatory

### Processing Pipeline

- Image files can be passed as image inputs when useful.
- Text-based PDFs should be text-extracted before Codex execution.
- Scanned PDFs should go through page rendering plus OCR before Codex execution.
- Long extracted text should be chunked or summarized before the main review step if needed.

### Job State Model

Suggested status values:

- `queued`
- `validating_upload`
- `extracting_text`
- `running_review`
- `summarizing_result`
- `completed`
- `failed`
- `expired`

Suggested visible progress messages:

- `업로드 확인 중`
- `문서 내용 추출 중`
- `검토 작업 실행 중`
- `결과 정리 중`
- `완료`

## Data Lifecycle Policy

This service is intentionally designed as temporary processing, not retention.

- Each request gets a unique `job_id`.
- Each `job_id` gets its own isolated temp directory.
- Store uploaded files, extracted text, logs, and final output only for the active job lifetime.
- Delete job data immediately after explicit user close-out, or automatically after a short TTL.
- Recommended first TTL: `2 hours` for result review, with a later option to shorten.
- Keep only minimal operational logs needed for failure diagnosis.
- Do not provide a server-side archive or past-job retrieval feature.

### Practical Note

Zero-storage is not realistic during execution. Temporary storage is required while:

- uploads are being processed
- OCR or extraction is running
- Codex is executing
- the user is viewing the result page

Therefore the real policy is:

- no long-term retention
- short-lived job storage only

## Result Artifact Policy

The server should not behave like a history system, but the user may still need a copy of the outcome for the current case.

- The final result should be viewable in the browser for the active job.
- The final result should also be exportable or downloadable by the user.
- The first release should support PDF export for the final result of the current job.
- Browser print should be the default PDF export path in the first release.
- Browser rendering and print styling should be designed so the result page can be exported cleanly to PDF.
- Exported artifacts belong to the user after download and do not require server retention.

## Internal Network Deployment Assumption

- Bind the app server to the internal-facing interface, not localhost only.
- Access pattern should be `http://<internal-ip>:<port>`.
- If internal access is open to anyone on the subnet, at least basic guardrails should still be considered:
  - subnet restriction
  - simple shared access code
  - reverse-proxy allowlist

## Codex Integration Strategy

### Preferred MVP Approach

Use local `codex exec` as the execution engine rather than re-implementing skill logic in a separate API layer.

Why:

- Existing skills and local Codex environment can be reused.
- The review behavior stays close to the current operator workflow.
- We avoid rewriting the domain logic too early.

### Execution Model

- Backend creates a task-specific instruction payload.
- Backend invokes `codex exec` in a per-job working directory.
- Backend captures stdout, stderr, structured events if available, and final output.
- Backend maps process milestones into UI progress stages.

### Prompt/Instruction Inputs

Each job should provide:

- selected task label
- backend task identifier
- extracted text and file metadata
- required output format
- explicit request to stay within the selected task scope

## Output Format Standard

Result pages should follow one stable structure regardless of task.

- `요약`
- `판정`
- `주요 근거`
- `누락 사항`
- `리스크`
- `권장 조치`

This keeps the viewer consistent and makes later export or reporting easier.

The same structure should be reused for download/export output.

## MVP Screen Composition

The first release should keep the screen model intentionally small.

### Screen 1: Submit Page

Purpose:

- upload files
- choose one task
- submit a single review job

Required UI blocks:

- service title and one-line usage guidance
- file upload area
- selected file list
- task selector with Korean labels
- submit button
- validation/error message area

Notes:

- Keep the page operational, not dashboard-like.
- Do not add history, recent jobs, or analytics.
- Show file constraints clearly near the upload zone.

### Screen 2: Job Page

Route shape:

- `/jobs/[jobId]`

Purpose:

- show current job progress while running
- show final result when complete
- allow PDF export after completion

Required UI blocks:

- job status header
- stage progress indicator
- current progress message
- file/task metadata summary
- failure message area
- result content area
- `PDF 저장` action after completion

Notes:

- The same page should handle both in-progress and completed states.
- Avoid separate “dashboard” or “history” screens.

### Screen 3: System Health Or Fallback

This can stay minimal in MVP.

- health check response for operators
- basic maintenance or unavailable message if the service is down

## Internal API List

These endpoints are internal app endpoints, not a public third-party API product.

### `POST /api/jobs`

Purpose:

- create a new single review job

Input:

- uploaded files
- selected task type

Response:

- `jobId`
- initial status
- redirect target or job page URL

Validation:

- allow only supported file types
- enforce file count and size limits
- require exactly one task type

### `GET /api/jobs/:jobId`

Purpose:

- fetch current job state for page load and polling fallback

Response:

- job metadata
- current status
- current progress message
- result availability
- expiry info

### `GET /api/jobs/:jobId/events`

Purpose:

- stream job progress events to the browser

Response model:

- stage updates
- status changes
- completion event
- failure event

Implementation note:

- prefer SSE first
- fall back to polling if streaming proves unstable in the target environment

### `GET /api/jobs/:jobId/result`

Purpose:

- fetch the normalized final result payload

Response:

- summary
- judgment
- evidence
- missing items
- risks
- recommended actions

### `GET /api/jobs/:jobId/pdf`

Purpose:

- return the browser-print-optimized result page or print view entry point

Note:

- in MVP, this can serve a dedicated print view that the browser saves as PDF
- do not build a server-side PDF renderer unless requirements change

### `DELETE /api/jobs/:jobId`

Purpose:

- allow explicit cleanup of an active or completed job before TTL

### `GET /api/health`

Purpose:

- expose minimal health status for operator checks

## Job State Model

### Core Fields

- `jobId`
- `taskType`
- `status`
- `progressStage`
- `progressMessage`
- `createdAt`
- `expiresAt`
- `inputFiles`
- `artifactPaths`
- `result`
- `error`

### Status Set

- `queued`
- `validating_upload`
- `extracting_text`
- `running_review`
- `summarizing_result`
- `completed`
- `failed`
- `expired`

### Transition Rules

- jobs move forward only, except explicit cleanup to `expired`
- `failed` is terminal
- `completed` is terminal until cleanup
- `expired` is terminal

### Failure Metadata

On failure, preserve a user-safe error structure:

- `code`
- `message`
- `stage`
- `retryable`

Notes:

- do not expose raw shell output directly to end users
- store detailed execution diagnostics only in temp operator logs if needed

## Result Page And Browser Print PDF Rules

### Result Page Requirements

- render the stable review structure in one readable document flow
- keep action buttons outside the printable content region where possible
- show task type, generated time, and file names near the top
- keep the first screen readable without scrolling through decorative content

### Print Layout Rules

- target `A4 portrait` first
- design for browser print, not custom PDF rendering
- use one print-friendly column
- keep typography conservative and highly legible
- avoid color-dependent meaning
- avoid sticky UI, floating controls, and interactive chrome in print mode

### Print CSS Rules To Enforce

- set `@page` size and margins explicitly
- hide upload controls, buttons, navigation, and progress widgets in print mode
- avoid clipping and overflow in long evidence sections
- keep each major section from splitting awkwardly when possible
- ensure tables or evidence lists wrap safely
- use predictable Korean-capable fonts

### PDF Output Expectations

- the printed document should stand on its own without the live app around it
- do not rely on browser header/footer text for required metadata
- include all required review sections inside the main content
- if the result is too long, page breaks must remain readable and not cut headings from their content

## Skill Application Plan

### Planning and Scope

- `plan`
  - Maintain the project plan and execution sequencing.

### Domain Review Logic

- `official-document-drafting`
- `contract-clause-review`
- `contract-expenditure-drafting`
- `expenditure-resolution-guide`

These are the core business lanes. They should not be renamed internally. UI labels should be Korean, but backend mappings should stay stable and ASCII-safe.

### File Handling

- `pdf`
  - Validate PDF extraction and rendering assumptions.

### Product UI and Web App

- `build-web-apps:frontend-skill`
  - Keep the internal tool clean and deliberate instead of generic admin-card clutter.
- `vercel:nextjs`
  - Guide App Router structure, route handlers, and server boundaries.
- `build-web-apps:react-best-practices`
  - Keep the React code responsive and maintainable.

### Verification and QA

- `playwright`
  - Verify upload, task selection, progress, and result display in a real browser.
- `vercel:verification`
  - Verify the end-to-end story from browser to API to job execution to result rendering.

### Security and Review

- `security-review`
  - Review upload handling, temp files, command execution boundaries, and deletion policy.
- `code-review`
  - Final implementation review before broad internal use.

### OpenAI/Codex Documentation Validation

- `openai-docs`
  - Re-check official documentation when implementation details depend on current OpenAI product behavior.

## MVP Build Order

### Phase 1: Project Skeleton

- Create project scaffold in this folder.
- Choose the exact app structure and scripts.
- Create the plan-driven directory layout.
- Add a simple homepage and health check.

### Phase 2: Job Model and Temp Workspace

- Define `job_id`, status, result, and TTL metadata.
- Create per-job temp workspace creation and cleanup.
- Add upload validation and file size constraints.

### Phase 3: File Processing

- Implement PDF extraction path.
- Implement image input path.
- Implement OCR fallback for scanned PDFs.
- Add extraction error handling and operator-readable messages.

### Phase 4: Codex Runner

- Implement task mapping from Korean UI labels to backend execution targets.
- Build task-specific instruction templates.
- Execute `codex exec` safely from the server.
- Capture output and errors.

### Phase 5: Progress and Review UI

- Upload UI
- Task selector UI
- Job status page
- Result viewer page
- Failure state page

### Phase 6: Cleanup, Verification, and Hardening

- TTL cleanup worker or scheduled cleanup path
- Browser verification of the full flow
- Security review
- Code review

## MVP Screen Composition

The MVP should stay narrow and single-purpose. Avoid dashboard patterns.

### Screen 1: Submit Page

Purpose:

- accept file upload
- let the user choose one task
- start one review job

Required UI blocks:

- page title and one-line service description
- file upload area
- selected file list
- task selector with Korean labels
- submit button
- upload and validation error area

Rules:

- one submission flow only
- no historical job list
- no side navigation
- support drag-and-drop plus file picker
- show allowed file types and size limits before upload

### Screen 2: Job Progress Page

Purpose:

- show that the job is alive
- show the current stage clearly
- avoid users thinking the page is stuck

Required UI blocks:

- `job_id` or short visible job token
- selected task label
- uploaded filename list
- current status badge
- stage timeline
- latest progress message
- failure message area when relevant

Rules:

- progress is stage-based, not fake percentages
- refresh and reconnect should preserve the same job page
- page should auto-transition to the result screen when complete

### Screen 3: Result Page

Purpose:

- present the final review in a stable structure
- allow browser-print PDF export

Required UI blocks:

- result header with task label and generation time
- summary section
- decision section
- evidence section
- missing items section
- risks section
- recommended actions section
- print-to-PDF button

Rules:

- result layout must read cleanly on screen and on printed PDF
- all sections should degrade gracefully when some content is empty
- long evidence blocks must wrap safely and not break print layout

### Screen 4: Failure State

Purpose:

- explain why the job failed
- let the user retry by starting a new job

Required UI blocks:

- failure summary
- likely cause
- safe next-step guidance
- back-to-submit action

## Internal API List

These are internal application endpoints, not external public APIs.

### `POST /api/jobs`

Purpose:

- validate upload
- create a new job
- persist input files in the temp workspace
- enqueue execution

Request:

- multipart form data
- files
- selected task key

Response:

- `jobId`
- initial `status`
- result page URL or job page URL

### `GET /api/jobs/:jobId`

Purpose:

- return current job metadata and state

Response should include:

- `jobId`
- `taskKey`
- `status`
- `progressMessage`
- `createdAt`
- `expiresAt`
- `resultAvailable`
- `errorSummary` when failed

### `GET /api/jobs/:jobId/events`

Purpose:

- stream live status updates to the browser

Recommended transport:

- Server-Sent Events first
- polling fallback if needed

Event payload should include:

- `status`
- `progressMessage`
- `timestamp`
- `resultAvailable`

### `GET /api/jobs/:jobId/result`

Purpose:

- return the normalized result content for display on the result page

Response should include:

- `jobId`
- `taskKey`
- `completedAt`
- `summary`
- `decision`
- `evidence`
- `missingItems`
- `risks`
- `recommendedActions`

### `GET /api/jobs/:jobId/print`

Purpose:

- render a print-optimized result page for browser PDF export

Notes:

- can be the same underlying result view with print CSS
- should avoid extra navigation and non-print UI

### `DELETE /api/jobs/:jobId`

Purpose:

- delete temp job files and outputs early when the user or operator no longer needs the job

### `GET /api/health`

Purpose:

- health check for the app process

### Optional Internal Endpoint

`POST /api/jobs/:jobId/retry`

Use only if controlled retry becomes necessary. Keep it out of the first build unless job failure handling proves too manual.

## Job State Model

The state model should stay explicit and small.

### Core Fields

- `jobId`
- `taskKey`
- `taskLabel`
- `status`
- `progressMessage`
- `sourceFiles`
- `tempDir`
- `createdAt`
- `updatedAt`
- `expiresAt`
- `result`
- `error`

### Status Values

- `queued`
- `validating_upload`
- `extracting_text`
- `running_review`
- `summarizing_result`
- `completed`
- `failed`
- `expired`

### State Transition Rules

- jobs start at `queued`
- upload validation must complete before extraction
- extraction must complete before Codex execution
- only `completed` jobs can expose the final result payload
- `failed` jobs must carry a normalized error message
- `expired` jobs must no longer expose source content or result content

### Error Categories

Keep error categories stable so UI messaging stays consistent:

- `upload_validation_error`
- `file_processing_error`
- `ocr_error`
- `codex_execution_error`
- `result_format_error`
- `cleanup_error`

## Result Page And Print CSS Rules

The printable result page is part of the product, not an afterthought.

### Result Page Layout Rules

- use one narrow readable content column
- keep the top heading and case metadata together
- give each result section a clear heading
- use flat sections rather than dashboard cards
- avoid sticky UI inside print view
- do not include upload controls, progress widgets, or retry controls in print mode

### Print CSS Rules

- default paper target: `A4`
- use print-safe black and neutral tones
- force white background in print
- hide buttons, upload controls, status toasts, and non-result chrome in print
- avoid page breaks immediately after section headings
- allow long paragraphs and tables to wrap
- avoid clipped text and overflow in printed pages
- repeat section rhythm consistently across pages

### Browser Print UX

- include a clear `PDF 저장` or `인쇄/PDF 저장` button
- button should open the print dialog for the result page
- result page should be printable without requiring a separate export generation step
- print instructions can be short and inline, but should not appear in print output

### Verification Rules For PDF Output

- verify print preview in a real browser
- verify the first page header hierarchy
- verify long evidence content across page breaks
- verify no buttons or navigation leak into the PDF
- verify Korean text renders cleanly in print

## Initial Directory Plan

Suggested project shape once implementation starts:

```text
internal-doc-review-platform/
  PROJECT_PLAN.md
  README.md
  app/
  components/
  lib/
  lib/jobs/
  lib/codex/
  lib/extract/
  tmp/
  public/
```

The `tmp/` area must stay disposable and outside long-term source-of-truth concerns.

## Multi-Agent Execution Plan

When implementation starts, parallelize by lane with disjoint write ownership.

### Lane 1: Product Shell and UI

- Scope: page flow, upload form, progress page, result page
- Suggested skills: `build-web-apps:frontend-skill`, `vercel:nextjs`, `build-web-apps:react-best-practices`

### Lane 2: Job Orchestration and Temp Storage

- Scope: job model, temp directories, TTL cleanup, status transitions
- Suggested skills: `vercel:nextjs`, `security-review`

### Lane 3: File Processing

- Scope: PDF extraction, OCR path, image handling, error normalization
- Suggested skills: `pdf`

### Lane 4: Codex Execution

- Scope: task mapping, prompt assembly, `codex exec` invocation, output parsing
- Suggested skills: `openai-docs`, domain review skills

### Lane 5: Verification

- Scope: browser checks and full flow verification
- Suggested skills: `playwright`, `vercel:verification`, `security-review`, `code-review`

### Coordination Rules

- No two agents edit the same file at the same time.
- UI files, file-processing files, and Codex-runner files should be split clearly.
- Final integration and verification should be done by the lead agent only.

## Decisions To Lock Early

These should be decided before deep implementation:

1. Exact framework and runtime choice inside the new folder
2. Max upload size and per-job file count
3. TTL duration for temporary review results
4. Whether restart resilience is needed in MVP
5. Whether OCR runs locally or through an external tool/service
6. Whether internal access is completely open or protected by a lightweight gate
7. Browser print PDF details such as page size, headers, and print CSS rules

## Known Risks

- OCR quality can reduce review quality on poor scans.
- `codex exec` latency may vary by task length.
- Temp-file deletion bugs could create unintended retention.
- Open internal access without even light gating is risky.
- Large PDFs may create extraction and token-size pressure.
- Server restart can drop in-flight job state if MVP stays memory-first.
- `codex exec` output shape can drift if prompts are not constrained tightly.

## Mitigation Direction

- Keep status transparent to the user.
- Fail with explicit extraction or analysis messages, not silent errors.
- Separate temp workspace creation and cleanup into a single owned module.
- Limit upload size and page count early.
- Keep output format stable even on partial failure.

### Specific Risk Responses

- `Codex 실행 실패/지연`
  - Add a job timeout, one controlled retry, and one stable result schema.
- `PDF/OCR 품질 불안정`
  - Split text PDFs and scanned PDFs into separate paths and surface extraction quality warnings.
- `임시파일/결과 유출`
  - Use one isolated temp directory per job and delete source, extracted text, logs, and result together by TTL.
- `서버 재시작 시 작업 유실`
  - Decide explicitly whether MVP allows in-flight loss. If not, persist only minimal job metadata locally.
- `내부망 서비스의 과신`
  - Add at least one lightweight access guard such as subnet restriction or shared access code.

## Immediate Next Steps

1. Confirm the exact stack for the new project skeleton.
2. Decide TTL and minimal access control stance.
3. Scaffold the app in this folder.
4. Implement the job model before any business UI.
5. Build the smallest end-to-end path for one task first: `공문 검토`.
6. Implement the result page and print CSS against the locked browser-print PDF rules.

## Update Protocol

When continuing work in future sessions:

1. Read this file first.
2. Check which phase is active.
3. Update the relevant phase or decision section before large scope changes.
4. Append a short note to the change log.

## Change Log

- `2026-04-08`: Initial project plan created in the new workspace folder. The project is defined as a temporary-processing internal review platform using Codex skill lanes with no long-term file retention.
- `2026-04-08`: Added explicit project root, MVP exclusions, and risk-response details based on multi-agent review.
- `2026-04-08`: Locked out login, history, dashboard, comments, approval workflow, and batch processing. Added single-job result export as a goal.
- `2026-04-08`: Locked the first result artifact format to PDF export only.
- `2026-04-08`: Locked the PDF export approach to browser print based export.
- `2026-04-08`: Added MVP screen composition, internal API list, job state model, and browser-print PDF rules.
