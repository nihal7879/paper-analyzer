# Local paper uploads without AI API calls

The existing admin `POST /api/papers` multipart route now accepts an optional
`localExtraction` JSON text field alongside `qp`, `ms`, and the usual metadata.
Omitting this field keeps the existing AI upload behavior. Do not call `/papers/detect`
for these imports: non-Cambridge filenames may invoke an AI cover reader.

This is a checked-transcription import path, not an automatic OCR engine. Prepare and
check the transcription locally before submitting it. No OCR package was installed.

The JSON object contains:

- `paper`: metadata in the format documented in `claude-extraction-format.md`.
- `qpSha256` and `msSha256`: lowercase SHA-256 of the exact uploaded PDF bytes.
- `questions`: checked question parts in that same format, including answers, page
  references and optional diagram crop rectangles. No source filesystem paths.

Both PDFs are required. Metadata and fingerprints must match. Parts must have unique
normalised numbers, valid pages, answers, valid diagram rectangles and four A-D options
for MCQs. When `paper.totalMarks` is supplied, part marks must sum to it.
The subject/catalog must already exist; this path does not create a new subject.
Unknown topic codes, overwrites, existing papers and existing storage directories are
rejected. Every QP and MS part must have either a text-based crop plan or validated explicit
local crop regions before upload. Explicit regions support scanned pages; without
them, missing text-based positions fail preflight with no AI fallback.

Successful requests use the normal storage service and repository, queue only local
rendering/cropping, and save extraction provider `local` and model
`checked-transcription-v1`. Worksheet crop AI fallback is disabled explicitly.
Questions are DRAFT and the paper is IN_REVIEW. Publishing remains a separate action.
Background failures are reported as FAILED with no AI retry.

No API key is included in this format. Existing configured providers and .env values
are unchanged. Local upload support is API-only; the web upload form is unchanged.

Stage 1 is complete: 10 AS Paper 2 pairs, 324 question parts, all in review.
The original 31 papers and their 720 parts, answers and 2,497 images were unchanged.
The API was started in offline mode on port 4100 and the web on 3000; no running
server was restarted. All external AI request counters remained zero. No later stage
was imported. Source archives, extraction folders and preparation files were retained.


## Offline OCR and crop regions

Each local question can now include `localCrops: { qp: [{ page, box }], ms: [{ page, box }] }`.
Boxes are normalised to the rendered page orientation, with coordinates between zero and one.
Supply explicit regions for every part, or none. QP region pages must match the question pages;
QP/MS page bounds and positive crop dimensions are validated before any database/file writes.
Explicit regions support scanned PDFs without modifying their bytes or adding OCR layers.
The app's existing renderer/crop writer performs the cuts. This local mode only inserts new
FULL crops and refuses to replace existing ones. There is no AI fallback.

The stage preparation scripts live outside the project under the Codex chat's `work` directory.
They use native text positions plus Windows.Media.Ocr entirely on this computer. Staging JSON,
full-page OCR renders, and QA previews are under
`D:/paper-analyzer-storage/local-extractions/edexcel-as2-20261023`.
Both original PDFs must still be submitted through POST /api/papers. Do not copy PDFs into
paper directories or insert paper/question rows manually.

Start the API process with `PAPER_ANALYZER_OFFLINE=1` during the import. This blocks all
AiRouter extraction, detection and crop-fallback operations before a provider is selected.
It does not change .env or remove keys. The web form's normal AI uploads cannot run in that
process until it is deliberately started without this flag. Existing papers remain readable.

Prepared AS Paper 2 counts: specimen 31 parts; 2016 35; 2017 34; 2018 37; 2019 33;
autumn 2020 29; autumn 2021 31; 2022 33; 2023 31; 2024 30. Each paper totals 80 marks.
All transcriptions and crops remain unverified drafts for admin review, especially mathematical
text decoded from embedded fonts or OCR. The original PDF crops preserve their printed form.
