// ===========================================================
// DEFENSA THESIS DOCUMENT GENERATOR
// Generates: AI-Powered Document Analysis and Question
// Generation Framework of the Defensa Virtual Defense System
// ===========================================================

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  ShadingType,
  PageBreak,
  VerticalAlign,
} from "docx";
import { writeFileSync } from "fs";

// ── Helpers ──────────────────────────────────────────────────

const FONT = "Times New Roman";
const MONO = "Courier New";
const SIZE_BODY = 24;   // 12pt
const SIZE_TITLE = 36;  // 18pt
const SIZE_H1   = 32;   // 16pt
const SIZE_H2   = 28;   // 14pt
const SIZE_H3   = 26;   // 13pt
const SIZE_SMALL = 20;  // 10pt
const COLOR_HEADING = "1A237E";
const COLOR_CODE_BG = "F5F5F5";

function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 360 },
    children: [new TextRun({ text, font: FONT, size: SIZE_BODY, ...opts })],
  });
}

function bodyBold(text) {
  return body(text, { bold: true });
}

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    children: [new TextRun({ text, font: FONT, size: SIZE_H1, bold: true, color: COLOR_HEADING })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, font: FONT, size: SIZE_H2, bold: true, color: COLOR_HEADING })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: FONT, size: SIZE_H3, bold: true, italics: true, color: "37474F" })],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function blank() {
  return new Paragraph({ spacing: { after: 120 } });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 80, line: 320 },
    indent: { left: 720 + level * 360 },
    children: [new TextRun({ text, font: FONT, size: SIZE_BODY })],
  });
}

function subbullet(text) {
  return bullet(text, 1);
}

function codeBlock(lines) {
  const rows = lines.map(line =>
    new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "EEEEEE" },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          borders: {
            top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          },
          children: [new Paragraph({
            spacing: { after: 0, line: 280 },
            children: [new TextRun({ text: line, font: MONO, size: SIZE_SMALL })],
          })],
        }),
      ],
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" },
      left:   { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" },
      right:  { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" },
      insideH: { style: BorderStyle.NONE },
      insideV: { style: BorderStyle.NONE },
    },
    rows,
  });
}

function simpleTable(headers, rows, caption = "") {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h =>
      new TableCell({
        shading: { type: ShadingType.SOLID, color: "1A237E" },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: h, font: FONT, size: SIZE_BODY, bold: true, color: "FFFFFF" })],
        })],
      })
    ),
  });
  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: ri % 2 === 0 ? "FFFFFF" : "F3F3F3" },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: cell, font: FONT, size: SIZE_BODY })],
          })],
        })
      ),
    })
  );
  const elements = [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
  ];
  if (caption) {
    elements.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 200 },
      children: [new TextRun({ text: caption, font: FONT, size: SIZE_SMALL, italics: true })],
    }));
  }
  return elements;
}

function sectionLabel(text) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: FONT, size: SIZE_BODY, bold: true, underline: {} })],
  });
}

function titlePage() {
  return [
    new Paragraph({ spacing: { before: 1440, after: 0 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: "AI-POWERED DOCUMENT ANALYSIS AND QUESTION GENERATION FRAMEWORK", font: FONT, size: SIZE_TITLE, bold: true, color: COLOR_HEADING, allCaps: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: "OF THE DEFENSA VIRTUAL DEFENSE SIMULATION SYSTEM", font: FONT, size: SIZE_H1, bold: true, color: COLOR_HEADING, allCaps: true })],
    }),
    blank(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: "A Technical Reference Document", font: FONT, size: SIZE_H2, italics: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: "Presented in Partial Fulfillment of the Requirements", font: FONT, size: SIZE_BODY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: "for the Degree of Bachelor of Science in Information Technology", font: FONT, size: SIZE_BODY })],
    }),
    blank(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: "College of Computing and Information Technology", font: FONT, size: SIZE_BODY, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [new TextRun({ text: "National University — Clark", font: FONT, size: SIZE_BODY, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Academic Year 2025–2026", font: FONT, size: SIZE_BODY })],
    }),
    pageBreak(),
  ];
}

// ── SECTION CONTENT ──────────────────────────────────────────

function sec1_Introduction() {
  return [
    heading1("1. INTRODUCTION"),

    heading2("1.1 Purpose of the Document"),
    body("This document provides a comprehensive technical exposition of the Artificial Intelligence (AI) pipeline embedded within the Defensa Virtual Defense Simulation System. Defensa is an intelligent, web-based platform designed to simulate the oral thesis defense examination process for undergraduate capstone students. The present document is intended to serve as both a technical reference and an academic explanation of the system's core AI functionality — specifically the mechanisms by which the system ingests uploaded research documents, extracts knowledge, generates contextually grounded examination questions, evaluates student responses, and computes a holistic readiness score."),
    body("The document is written in compliance with academic standards applicable to Chapter 3 (Methodology) and Chapter 4 (System Design and Implementation) of a capstone thesis manuscript. All algorithmic descriptions, pseudocode blocks, and process explanations presented herein correspond directly to the actual implementation found in the system's source code."),

    heading2("1.2 Role of Artificial Intelligence in Defensa"),
    body("The Defensa system employs a multi-layered AI architecture that transforms static thesis research documents into dynamic, adaptive, and adversarial oral defense simulations. The primary AI engine is Google Gemini, accessed via the Generative Language API (v1beta). The system uses Gemini to perform four fundamental AI-driven tasks:"),
    bullet("Document Comprehension — interpreting the semantic content of the uploaded abstract and research document"),
    bullet("Adaptive Question Generation — producing examination questions that are grounded exclusively in the student's actual research document"),
    bullet("Answer Evaluation — scoring student responses using a calibrated LLM-as-Judge rubric aligned with academic defense standards"),
    bullet("Readiness Assessment — computing an aggregate readiness score that reflects the student's preparedness across multiple evaluation dimensions"),
    body("To ensure resilience against API quota exhaustion or rate-limiting, the system implements a multi-tier AI fallback cascade: Gemini 2.0 Flash Lite → Gemini 2.0 Flash → Gemini 1.5 Flash → Gemini 1.5 Flash-8B → Gemini 2.5 Flash → Groq LLaMA 3.3 70B → Groq LLaMA 3.1 8B → Groq Mixtral 8×7B → Deterministic contextual fallback templates. This layered design guarantees that the simulation proceeds uninterrupted regardless of external service availability."),

    heading2("1.3 Importance of Automated Defense Preparation"),
    body("Oral thesis defense examinations represent a critical academic milestone for capstone students. The pressure and high-stakes nature of a formal defense panel — comprising multiple experts who challenge, probe, and evaluate research decisions in real time — often leads to significant anxiety and inadequate preparation among students. Traditional preparation methods, such as peer mock defenses or self-study, lack the adversarial rigor, expert diversity, and adaptive feedback loops that characterize an actual panel examination."),
    body("The Defensa system addresses these deficiencies by providing a scalable, on-demand, AI-powered simulation environment in which students can practice defending their specific research document against multiple virtual panelists with distinct academic personalities. Because every question generated by the system is directly traceable to the student's uploaded document, the practice sessions are maximally relevant to the actual defense. The system's automated evaluation and readiness scoring further enable students and academic coordinators to track preparation progress over time, identify weaknesses, and allocate study effort efficiently."),

    pageBreak(),
  ];
}

function sec2_Architecture() {
  return [
    heading1("2. SYSTEM ARCHITECTURE OVERVIEW"),

    heading2("2.1 End-to-End Processing Pipeline"),
    body("The Defensa AI framework is organized as a nine-stage sequential processing pipeline. Each stage produces structured output that serves as the input to the subsequent stage. The following describes each stage of the pipeline."),

    ...simpleTable(
      ["Stage", "Component", "Description"],
      [
        ["1", "File Upload", "Student submits a DOCX or PDF file via the web interface. Multer middleware validates format and size before forwarding the buffer for extraction."],
        ["2", "Text Extraction", "pdfjs-dist extracts text from PDF; mammoth.js extracts text from DOCX. The raw text is returned as a single UTF-8 string."],
        ["3", "Text Normalization", "normalizeExtractedText() removes ligatures, invalid characters, extra whitespace, and repeated line breaks. isGibberish() validates content quality."],
        ["4", "Section Identification", "detectDocumentOutline() uses Gemini to detect chapter and section boundaries. detectDocumentSections() provides a keyword-based fallback."],
        ["5", "Knowledge Extraction", "analyzeAbstract() uses Gemini to extract key topics, methodology, and technical terms. extractAbstractTerms() computes term frequency as a local fallback."],
        ["6", "Coverage Initialization", "initCoverageMap() builds a per-section tracking object. Each section starts with mastery=0 and questionCount=0, enabling adaptive breadth-first coverage."],
        ["7", "Question Generation", "generateDynamicQuestion() constructs a structured prompt containing the panelist identity, document content, coverage state, and previous answer. Gemini generates one adversarial question per invocation."],
        ["8", "Answer Evaluation", "evaluateResponseDetailed() submits the question, answer, and abstract to Gemini using the SYSTEM_EVALUATOR rubric. Scores are assigned across four weighted dimensions."],
        ["9", "Readiness Assessment", "The final score is computed as a weighted sum of accuracy, completeness, clarity, and confidence. Scores are persisted to the readiness_history table in Supabase PostgreSQL."],
      ],
      "Table 2.1. Defensa AI Processing Pipeline Stages"
    ),

    heading2("2.2 Data Flow Between Components"),
    body("The pipeline begins when the student uploads their research document through the React frontend. The frontend dispatches an HTTP POST request to the /api/upload/abstract endpoint on the Express backend server. The server validates, extracts, and cleans the text, then returns the extracted string to the frontend. During session initialization, the frontend calls analyzeAbstract() and detectDocumentOutline() which invoke the /api/ai/generate backend proxy — thereby routing all AI calls through the server, ensuring that API keys are never exposed to the client."),
    body("Throughout the active defense session, the frontend calls generateDynamicQuestion() for each question, which again routes through the backend AI proxy. When the student submits a spoken or typed answer, evaluateResponseDetailed() is called. At session completion, the final session object — containing all questions, answers, scores, and metadata — is persisted to Supabase PostgreSQL via the /api/sessions endpoint."),

    pageBreak(),
  ];
}

function sec3_DocumentProcessing() {
  return [
    heading1("3. DOCUMENT PROCESSING ALGORITHM"),

    heading2("3.1 Step 1 — File Upload and Validation"),
    body("The file upload subsystem is implemented using the Multer middleware library configured with in-memory storage. The system enforces the following constraints prior to extracting any text:"),

    ...simpleTable(
      ["Constraint", "Value", "Enforcement"],
      [
        ["Maximum file size", "5 MB (5,242,880 bytes)", "multer limits.fileSize — HTTP 413 returned on violation"],
        ["Accepted MIME types", "application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document", "fileFilter callback — HTTP 415 returned on violation"],
        ["Accepted extensions", ".pdf, .docx", "Extension parsed from originalname field"],
        ["Storage strategy", "Memory buffer (no disk write)", "multer.memoryStorage() — file content held in req.file.buffer"],
      ],
      "Table 3.1. File Upload Validation Constraints"
    ),

    body("If any constraint is violated, the server immediately returns an appropriate HTTP error code with a machine-readable error token (INVALID_TYPE, FILE_TOO_LARGE) before any text extraction is attempted. This early rejection prevents unnecessary processing and reduces attack surface."),

    heading2("3.2 Step 2 — Text Extraction"),

    heading3("3.2.1 PDF Extraction"),
    body("PDF text extraction is performed using the pdfjs-dist library (Legacy Build) to ensure compatibility across all PDF variants including those generated by LaTeX, Adobe Acrobat, and LibreOffice. The extraction algorithm proceeds as follows:"),

    codeBlock([
      "ALGORITHM: PDF_EXTRACT(buffer)",
      "─────────────────────────────────────────────────────────",
      "INPUT : Uint8Array — binary content of the uploaded PDF",
      "OUTPUT: string     — concatenated text of all pages",
      "",
      "1. Load PDF using pdfjsLib.getDocument({",
      "     data             : buffer,",
      "     useWorkerFetch   : false,",
      "     isEvalSupported  : false,",
      "     useSystemFonts   : true,",
      "     disableFontFace  : true",
      "   })",
      "2. Await loadingTask.promise → pdf object",
      "3. Initialize parts ← empty array",
      "4. FOR page_number = 1 TO pdf.numPages DO",
      "     page    ← await pdf.getPage(page_number)",
      "     content ← await page.getTextContent()",
      "     text    ← content.items.map(item → item.str).join(' ')",
      "     APPEND text TO parts",
      "5. RETURN parts.join('\\n')",
    ]),

    body("The configuration parameters are chosen deliberately: useWorkerFetch:false prevents cross-origin worker fetch failures in server-side Node.js execution; disableFontFace:true avoids CSS font injection in the server environment; useSystemFonts:true ensures consistent character rendering across encoding variations."),

    heading3("3.2.2 DOCX Extraction"),
    body("DOCX files are processed using the Mammoth.js library, which parses the Open XML structure of the document and extracts raw textual content while discarding formatting metadata that is irrelevant to question generation. The extraction invocation is:"),

    codeBlock([
      "ALGORITHM: DOCX_EXTRACT(buffer)",
      "─────────────────────────────────────────────────────────",
      "INPUT : Buffer — binary content of the uploaded DOCX",
      "OUTPUT: string — raw text content of the document",
      "",
      "1. result ← await mammoth.extractRawText({ buffer })",
      "2. RETURN result.value",
    ]),

    body("Mammoth's extractRawText() function traverses the XML nodes of the document, converting paragraph elements (w:p), table cells (w:tc), and text runs (w:r) into a plain-text representation. Heading styles are not given special treatment at this stage; section boundaries are identified subsequently in Step 4."),

    heading2("3.3 Step 3 — Text Normalization"),
    body("The raw extracted text invariably contains artifacts of the document format — Unicode ligature characters, smart quotes, non-printable control characters, and irregular whitespace — that would degrade the quality of AI prompts if left uncleaned. The normalizeExtractedText() function applies a deterministic sequence of transformations:"),

    codeBlock([
      "ALGORITHM: normalizeExtractedText(raw)",
      "─────────────────────────────────────────────────────────",
      "INPUT : string — raw extracted text",
      "OUTPUT: string — cleaned, normalized text",
      "",
      "1.  REPLACE PDF ligatures with ASCII equivalents:",
      "       ﬀ → ff | ﬁ → fi | ﬂ → fl | ﬃ → ffi | ﬄ → ffl",
      "2.  REPLACE typographic quotes: ' ' → ' | " " → \"",
      "3.  REPLACE em-dash, en-dash: – — → -",
      "4.  REMOVE non-printable control characters",
      "      (preserve \\t, \\n, \\r, printable ASCII U+0020–U+007E,",
      "       and Latin Extended-A U+00C0–U+024F)",
      "5.  NORMALIZE line endings: \\r\\n and \\r → \\n",
      "6.  COLLAPSE horizontal whitespace: multiple spaces → single space",
      "7.  COLLAPSE vertical whitespace: 3+ consecutive \\n → 2 \\n",
      "8.  TRIM leading and trailing whitespace",
      "9.  RETURN normalized string",
    ]),

    heading2("3.4 Step 4 — Gibberish Detection"),
    body("Before returning the extracted text to the frontend, the system validates that the content constitutes legitimate academic text using the isGibberish() function. This guards against corrupted PDFs, image-only documents (where text extraction yields empty or random characters), and malicious uploads:"),

    codeBlock([
      "ALGORITHM: isGibberish(text)",
      "─────────────────────────────────────────────────────────",
      "INPUT : string — normalized extracted text",
      "OUTPUT: boolean — TRUE if content is not legitimate text",
      "",
      "1.  cleaned  ← text.replace(/\\s+/g, ' ').trim()",
      "2.  nonSpace ← cleaned.replace(/\\s/g, '')",
      "3.  IF nonSpace.length = 0 THEN RETURN TRUE (empty document)",
      "",
      "4.  alphaCount ← count of [a-zA-Z] characters in cleaned",
      "5.  IF (alphaCount / nonSpace.length) < 0.18 THEN",
      "        RETURN TRUE  (fewer than 18% alphabetic chars — likely binary/OCR garbage)",
      "",
      "6.  tokens   ← cleaned.split(whitespace)",
      "7.  wordLike ← tokens matching /^[a-zA-Z'-]{2,35}$/",
      "8.  IF wordLike.length < 8 THEN RETURN TRUE (too few recognizable words)",
      "",
      "9.  IF tokens.length > 30 AND wordLike/tokens < 0.12 THEN",
      "        RETURN TRUE  (word-like token ratio too low)",
      "",
      "10. COMMON ← [the, and, of, in, is, study, research, methodology,",
      "               conclusion, ang, ng, sa, mga, ay, na] // English + Filipino",
      "11. IF tokens.length > 120 AND NONE of COMMON found in text THEN",
      "        RETURN TRUE  (no common words — likely OCR noise)",
      "",
      "12. IF wordLike.length > 80 THEN",
      "        uniqueRatio ← uniqueWords / wordLike.length",
      "        IF uniqueRatio < 0.08 THEN RETURN TRUE (excessive repetition)",
      "",
      "13. RETURN FALSE (text passes all quality checks)",
    ]),

    heading2("3.5 Step 5 — Content Segmentation"),
    body("Content segmentation identifies the structural sections of the research document. The system uses a two-tier approach: a primary Gemini-powered detection method and a keyword-based local fallback."),

    heading3("3.5.1 Primary: Gemini-Powered Outline Detection"),
    body("The detectDocumentOutline() function submits the first 5,000 characters of the normalized text to Gemini with an instruction to identify chapters and sections actually present in the document and return a structured JSON outline. The expected response format is:"),

    codeBlock([
      "{ \"chapters\": [",
      "    {",
      "      \"title\": \"CHAPTER 1 — Introduction\",",
      "      \"sections\": [",
      "        { \"id\": \"ch1-intro\",      \"label\": \"Introduction\" },",
      "        { \"id\": \"ch1-background\", \"label\": \"Background of the Study\" }",
      "      ]",
      "    }",
      "  ]",
      "}",
    ]),

    heading3("3.5.2 Fallback: Keyword-Based Section Detection"),
    body("When Gemini is unavailable or returns an invalid response, the system applies a deterministic keyword-matching algorithm against a predefined vocabulary of section labels. The system recognizes sections belonging to five standard thesis chapters:"),

    ...simpleTable(
      ["Chapter", "Detected Section Keywords"],
      [
        ["Chapter 1 — Introduction", "introduction, background, problem statement, objectives, scope, limitation, significance, rationale"],
        ["Chapter 2 — Review of Related Literature", "review of related literature, related studies, related works, conceptual framework, theoretical framework"],
        ["Chapter 3 — Methodology", "methodology, research design, sdlc, data gathering, system architecture, database design, erd, use case, activity diagram, dfd"],
        ["Chapter 4 — Results & Testing", "results, findings, testing, test case, user acceptance, evaluation, performance metrics"],
        ["Chapter 5 — Conclusion", "conclusion, summary, recommendations, future work, future studies"],
      ],
      "Table 3.2. Chapter-Level Section Detection Keywords"
    ),

    body("Each detected section is assigned a unique identifier (id) in lowercase-hyphenated format and a human-readable label that is used as the target section in subsequent question generation prompts. The list of detected sections becomes the initial key set of the Coverage Map described in Section 5."),

    pageBreak(),
  ];
}

function sec4_ContentAnalysis() {
  return [
    heading1("4. CONTENT ANALYSIS ALGORITHM"),

    heading2("4.1 Abstract Analysis"),
    body("The analyzeAbstract() function is the system's primary knowledge extraction module. It submits the first 800 characters of the normalized text to Gemini with a structured extraction prompt. The prompt requests five fields in JSON format:"),

    ...simpleTable(
      ["Field", "Type", "Description"],
      [
        ["wordCount", "integer", "Total word count of the full abstract"],
        ["keyTopics", "string[5–8]", "Five to eight specific research topics identified in the document"],
        ["technicalTermsCount", "integer", "Count of domain-specific technical terms detected"],
        ["summary", "string", "Two-to-three sentence summary of the research"],
        ["methodologyDetails", "string", "The primary research methodology described in the document"],
      ],
      "Table 4.1. Abstract Analysis Output Fields"
    ),

    body("The extraction result populates the ProjectProfile.analysisResults object, which is subsequently embedded in question generation prompts to provide Gemini with a structured summary of the research context. When Gemini is unavailable, a deterministic local fallback executes the extractAbstractTerms() function described below."),

    heading2("4.2 Local Keyword Extraction Algorithm"),
    body("The extractAbstractTerms() function implements a frequency-based keyword extraction algorithm using a domain-aware stop word list. The algorithm proceeds as follows:"),

    codeBlock([
      "ALGORITHM: extractAbstractTerms(abstract)",
      "─────────────────────────────────────────────────────────",
      "INPUT : string — abstract text",
      "OUTPUT: string[] — top-12 domain-relevant keywords",
      "",
      "1.  STOP_WORDS ← { the, a, an, is, are, was, were, this, that,",
      "                    which, with, for, and, or, but, not, in, on,",
      "                    at, to, of, has, have, been, by, as, its, be,",
      "                    their, they, from, into, will, can, may, also,",
      "                    study, research, paper, work, using, used,",
      "                    based, system, data, results, findings,",
      "                    analysis, approach, method, methods }",
      "",
      "2.  words ← abstract.toLowerCase().match(/\\b[a-z][a-z]{3,}\\b/g)",
      "             // Extract word tokens of minimum length 4",
      "",
      "3.  freq ← empty map",
      "4.  FOR EACH word IN words DO",
      "        IF word NOT IN STOP_WORDS THEN",
      "            freq[word] ← freq[word] + 1",
      "",
      "5.  sorted ← freq.entries().sort(descending by frequency)",
      "6.  RETURN sorted.slice(0, 12).map(entry → entry.word)",
    ]),

    body("The resulting keyword list is used as dynamic fill-ins for the contextual fallback question templates (CONTEXTUAL_TEMPLATES). These templates inject the extracted keywords directly into question text, ensuring that even fallback questions reference project-specific terminology rather than generic placeholders."),

    heading2("4.3 Topic and Research Object Detection"),
    body("The getResearchTopic() function extracts the research topic from the first sentence of the abstract, which in standard academic writing typically provides the most concise statement of the study's subject:"),

    codeBlock([
      "ALGORITHM: getResearchTopic(abstract)",
      "─────────────────────────────────────────────────────────",
      "INPUT : string — abstract text",
      "OUTPUT: string — primary research topic (max 100 chars)",
      "",
      "1.  firstSentence ← abstract.split(/[.!?\\n]/)[0].trim()",
      "2.  IF firstSentence.length ≤ 100 THEN",
      "        RETURN firstSentence",
      "3.  ELSE",
      "        RETURN firstSentence.substring(0, 100)",
    ]),

    body("The extracted topic serves as the primary identifier of the research in all question prompts. Every question generated by the system references this topic either directly — quoting the exact phrase — or indirectly through the section-specific knowledge it identifies."),

    heading2("4.4 RAG (Retrieval-Augmented Generation) Chunking"),
    body("For documents with substantial abstract text, the system applies Retrieval-Augmented Generation (RAG) to ensure that question prompts incorporate the most relevant passages from the document rather than a simple character-truncated string. The RAG module consists of three functions:"),

    heading3("4.4.1 Document Chunking"),
    codeBlock([
      "ALGORITHM: createChunks(text, chunkSize=800, overlap=200)",
      "─────────────────────────────────────────────────────────",
      "INPUT : text — full normalized document text",
      "        chunkSize — target characters per chunk",
      "        overlap   — shared characters between adjacent chunks",
      "OUTPUT: RagChunk[] — array of overlapping text segments",
      "",
      "1.  chunks ← empty array",
      "2.  start  ← 0",
      "3.  WHILE start < text.length DO",
      "        end   ← min(start + chunkSize, text.length)",
      "        chunk ← { id: uuid(), text: text.substring(start, end),",
      "                  metadata: { section: 'document' } }",
      "        APPEND chunk TO chunks",
      "        start ← start + chunkSize - overlap",
      "4.  RETURN chunks",
    ]),

    heading3("4.4.2 Cosine Similarity"),
    codeBlock([
      "ALGORITHM: cosineSimilarity(vectorA, vectorB)",
      "─────────────────────────────────────────────────────────",
      "INPUT : vectorA, vectorB — numeric arrays of equal length",
      "OUTPUT: number — cosine similarity score [−1, 1]",
      "",
      "1.  dotProduct ← Σ (vectorA[i] × vectorB[i]) for all i",
      "2.  magnitudeA ← √(Σ vectorA[i]²)",
      "3.  magnitudeB ← √(Σ vectorB[i]²)",
      "4.  RETURN dotProduct / (magnitudeA × magnitudeB)",
    ]),

    heading3("4.4.3 Chunk Retrieval"),
    body("The retrieveRelevantChunks() function selects the top-K most relevant chunks for a given question. In the current implementation, the top-3 chunks are retrieved and their text is concatenated to form the document context embedded in the question generation prompt, limited to 4,500 characters."),

    pageBreak(),
  ];
}

function sec5_QuestionGeneration() {
  return [
    heading1("5. QUESTION GENERATION ALGORITHM"),

    heading2("5.1 Overview"),
    body("The question generation subsystem is the intellectual core of the Defensa system. Its fundamental design principle is document fidelity: every question generated must be directly traceable to specific content within the student's uploaded research document. The system explicitly prohibits the generation of generic questions that could apply to any research project."),

    heading2("5.2 Coverage Map Initialization"),
    body("Before the first question is generated, the system initializes a Coverage Map — a data structure that tracks the examination progress across all detected document sections:"),

    codeBlock([
      "ALGORITHM: initCoverageMap(sections)",
      "─────────────────────────────────────────────────────────",
      "INPUT : string[] — array of section labels from outline detection",
      "OUTPUT: CoverageMap — keyed by section label",
      "",
      "DATA STRUCTURE per section:",
      "  CoverageEntry {",
      "    section:       string  // section label",
      "    mastery:       number  // 0–100, updated after each answer",
      "    questionCount: number  // questions asked on this section",
      "    covered:       boolean // true when mastery ≥ threshold",
      "  }",
      "",
      "1.  map ← {}",
      "2.  FOR EACH section IN sections DO",
      "        map[section] ← { section, mastery: 0,",
      "                          questionCount: 0, covered: false }",
      "3.  RETURN map",
    ]),

    heading2("5.3 Adaptive Section Selection"),
    body("The getNextSection() function implements a breadth-first section selection strategy that prevents any single section from being over-examined while ensuring comprehensive coverage of all detected sections:"),

    codeBlock([
      "ALGORITHM: getNextSection(coverageMap, currentSection)",
      "─────────────────────────────────────────────────────────",
      "INPUT : coverageMap    — current state of all sections",
      "        currentSection — section of the last question",
      "OUTPUT: string|null    — next section to examine",
      "",
      "1.  uncovered ← coverageMap.values()",
      "                 .filter(s → s.covered = FALSE",
      "                           AND s.section ≠ currentSection)",
      "                 .sort(ascending by questionCount,",
      "                       then ascending by mastery)",
      "                 // Prioritize least-examined, lowest-mastery sections",
      "",
      "2.  IF uncovered is empty THEN RETURN null",
      "3.  RETURN uncovered[0].section",
    ]),

    heading2("5.4 Adaptive Difficulty Calibration"),
    body("For each question, the system computes an adaptive difficulty level based on the student's demonstrated mastery of the target section. This ensures that questions progressively increase in difficulty as the student demonstrates comprehension:"),

    ...simpleTable(
      ["Section Mastery Score", "Assigned Difficulty", "Question Strategy"],
      [
        ["0 – 24", "Easy", "Comprehension and recall — verify foundational understanding of section content"],
        ["25 – 49", "Moderate", "Application and analysis — ask for justification of reported findings or methods"],
        ["50 – 74", "Hard", "Synthesis and evaluation — challenge assumptions, expose implicit limitations"],
        ["75 – 100", "Expert", "Challenge assumptions — demand edge-case analysis, counter-argument, or deeper implication"],
      ],
      "Table 5.1. Adaptive Difficulty Calibration based on Section Mastery"
    ),

    heading2("5.5 Dynamic Question Generation Prompt"),
    body("The generateDynamicQuestion() function constructs a structured prompt that provides Gemini with all contextual information necessary to generate a single, document-grounded, adversarial question. The prompt contains five structured sections:"),

    ...simpleTable(
      ["Prompt Section", "Content", "Purpose"],
      [
        ["EXAMINING PANELIST", "Panelist name, role, personality, and questioning style", "Constrains question tone and disciplinary focus"],
        ["CURRENT TARGET", "Section name, mastery score, question count, adaptive difficulty", "Directs question to the correct section and calibrates difficulty"],
        ["PREVIOUS EXCHANGE", "Last question, last answer, last score, follow-up instruction", "Enables contextual follow-up and adaptive response to answer quality"],
        ["SECTION COVERAGE MAP", "All sections with mastery and question counts", "Prevents redundancy; informs strategic section selection"],
        ["RESEARCH DOCUMENT", "First 4,500 characters of document or top-3 RAG chunks", "The sole factual source — Gemini must cite only this content"],
      ],
      "Table 5.2. Structure of the Dynamic Question Generation Prompt"
    ),

    body("The required JSON response schema enforces document traceability through the source_excerpt field, which mandates that Gemini provide an exact or paraphrased excerpt from the document that grounds the question, and the expectedKeywords field, which specifies six to eight domain-specific terms from the document that a correct answer must address:"),

    codeBlock([
      "EXPECTED RESPONSE SCHEMA:",
      "{",
      "  \"question\":        \"...adversarial question text...\",",
      "  \"source_section\":  \"Section where evidence was found\",",
      "  \"source_excerpt\":  \"Exact or paraphrased text from document (max 100 chars)\",",
      "  \"difficulty\":      \"Easy|Moderate|Hard|Expert\",",
      "  \"question_type\":   \"Clarification|Methodology Defense|Design Justification|",
      "                      Literature Validation|Limitation Analysis|Assumption Challenge|",
      "                      Data Integrity|Security|Scalability|Future Improvements\",",
      "  \"reason\":          \"Why this question challenges the researcher (1 sentence)\",",
      "  \"panelist_name\":   \"Name of the examining panelist\",",
      "  \"expectedKeywords\": [\"6–8 specific terms from the document\"]",
      "}",
    ]),

    heading2("5.6 Coverage Map Update"),
    body("After each question-answer cycle, the Coverage Map is updated to reflect the student's demonstrated mastery of the examined section:"),

    codeBlock([
      "ALGORITHM: updateCoverage(coverageMap, section, score)",
      "─────────────────────────────────────────────────────────",
      "INPUT : coverageMap — current state",
      "        section     — section just examined",
      "        score       — student's answer score (0–100)",
      "",
      "1.  entry ← coverageMap[section]",
      "2.  entry.questionCount ← entry.questionCount + 1",
      "3.  IF entry.questionCount = 1 THEN",
      "        entry.mastery ← score               // First question: direct assignment",
      "    ELSE",
      "        // Exponential moving average (α = 0.6)",
      "        entry.mastery ← round(0.6 × score + 0.4 × entry.mastery)",
      "4.  IF entry.mastery ≥ 75 THEN",
      "        entry.covered ← TRUE",
      "5.  UPDATE coverageMap[section] ← entry",
    ]),

    pageBreak(),
  ];
}

function sec6_Adversarial() {
  return [
    heading1("6. ADVERSARIAL QUESTION GENERATION ALGORITHM"),

    heading2("6.1 Batch Question Generation"),
    body("The generateAllQuestions() function produces a complete examination set of eight questions during the session initialization phase. Unlike generateDynamicQuestion() which operates on a per-question basis during the live session, this function generates the full set of questions upfront using a single Gemini API invocation with a comprehensive prompt:"),

    codeBlock([
      "ALGORITHM: generateAllQuestions(abstract, panelists, difficulty, ragChunks)",
      "─────────────────────────────────────────────────────────",
      "INPUT : abstract   — document text",
      "        panelists  — list of active virtual panelists",
      "        difficulty — session difficulty level (Beginner|Intermediate|Advanced)",
      "        ragChunks  — optional RAG chunks for long documents",
      "OUTPUT: PanelQuestion[8]",
      "",
      "1.  documentText ← IF ragChunks.length > 0",
      "                    THEN ragChunks.map(c → c.text).join('\\n\\n')",
      "                    ELSE abstract",
      "    docChunk ← documentText.substring(0, 5000)",
      "",
      "2.  panelistRoster ← panelists.map((p, i) →",
      "        'Panelist ' + i + ': ' + p.name + ' — ' + p.role)",
      "        .join('\\n')",
      "",
      "3.  difficultyNote ←",
      "        IF difficulty = Beginner: calibrate for comprehension and recall",
      "        IF difficulty = Advanced: maximize adversarial pressure",
      "        ELSE: balance comprehension with critical analysis",
      "",
      "4.  Construct prompt with:",
      "        - Panelist roster",
      "        - Difficulty calibration note",
      "        - Full document chunk (5000 chars)",
      "        - 8-question requirement with explicit difficulty sequence:",
      "          Q1:Easy Q2:Easy Q3:Moderate Q4:Moderate Q5:Hard Q6:Hard Q7:Expert Q8:Expert",
      "        - Panelist assignment: cycle modulo panelists.length",
      "          Q1,Q5 → panelist[0]; Q2,Q6 → panelist[1]; etc.",
      "",
      "5.  raw ← callServerAI(prompt, SYSTEM_QUESTION)",
      "6.  parsed ← parseAIJson(raw)",
      "7.  IF NOT Array(parsed) OR parsed.length < 4:",
      "        THROW 'AI returned invalid question array'",
      "        // Triggers fallback to generateFallbackQuestions()",
      "",
      "8.  RETURN parsed.slice(0, 8).map((q, i) → {",
      "        question:      q.question,",
      "        difficulty:    [Easy,Easy,Moderate,Moderate,Hard,Hard,Expert,Expert][i],",
      "        source_section: q.source_section,",
      "        source_excerpt: q.source_excerpt,",
      "        question_type:  q.question_type,",
      "        panelist:       panelists.find(p → p.name = q.panelist_name)",
      "                         ?? panelists[i % panelists.length],",
      "        expectedKeywords: q.expectedKeywords",
      "    })",
    ]),

    heading2("6.2 Adversarial Question Categories"),
    body("The SYSTEM_QUESTION prompt constrains Gemini to generate questions from the following ten categories, each representing a distinct mode of academic challenge:"),

    ...simpleTable(
      ["Category", "Challenge Mode", "Example Application"],
      [
        ["Clarification", "Verify comprehension of stated content", "Asks student to explain a specific claim or definition found in the document"],
        ["Methodology Defense", "Challenge research design choices", "Questions why the chosen methodology was preferred over alternative approaches"],
        ["Design Justification", "Probe architectural or technical decisions", "Challenges why a specific system component was implemented in the stated way"],
        ["Literature Validation", "Assess command of related literature", "Asks how findings relate to or contradict cited prior studies"],
        ["Limitation Analysis", "Force acknowledgment of study boundaries", "Asks student to articulate specific, non-trivial limitations of the research"],
        ["Assumption Challenge", "Expose implicit research assumptions", "Identifies and challenges an underlying assumption not explicitly stated"],
        ["Data Integrity", "Question data collection and validity", "Probes sampling adequacy, measurement validity, or data accuracy"],
        ["Security", "Assess security awareness in system design", "Challenges how the implemented system handles unauthorized access or data breaches"],
        ["Scalability", "Test deployment and growth planning", "Asks how the system would perform under significantly increased user load"],
        ["Future Improvements", "Evaluate research continuation awareness", "Asks for specific, evidence-based directions for extending the current work"],
      ],
      "Table 6.1. Adversarial Question Categories and Challenge Modes"
    ),

    heading2("6.3 The Adversarial Principle"),
    body("The SYSTEM_QUESTION system prompt enforces a fundamental distinction between generic questioning and adversarial questioning. The system explicitly contrasts these two modes to calibrate Gemini's output:"),

    ...simpleTable(
      ["Mode", "Example"],
      [
        ["Generic (Prohibited)", "What methodology did you use?"],
        ["Adversarial (Required)", "Your document states you used Quantitative research design with survey instruments. Why was this more suitable than a Mixed Methods approach, and what evidence in Chapter 3 supports that the sample size of N participants was statistically sufficient?"],
        ["Generic (Prohibited)", "What are the limitations of your study?"],
        ["Adversarial (Required)", "You acknowledged in Section 5.3 that your study was limited to a sample of [N] respondents from [institution]. Given this constraint, how confident are you that your findings on [specific finding] are generalizable beyond this population, and what would be needed to validate external validity?"],
      ],
      "Table 6.2. Adversarial vs. Generic Question Contrast"
    ),

    pageBreak(),
  ];
}

function sec7_Panelists() {
  return [
    heading1("7. MULTI-PANELIST SIMULATION ALGORITHM"),

    heading2("7.1 Panelist Architecture"),
    body("The Defensa system simulates a multi-member defense examination panel in which each virtual panelist maintains a distinct academic identity, questioning style, disciplinary specialization, and voice profile. The panelist roster is configurable per session; the system supports up to seven unique panelist roles:"),

    ...simpleTable(
      ["Panelist Role", "Questioning Style", "Primary Focus Areas"],
      [
        ["Technical Architect", "Analytical, detail-oriented, failure-mode focused", "System design, scalability, security vulnerabilities, design trade-offs, component failure scenarios"],
        ["Research Methodologist", "Strict, evidence-driven, statistically rigorous", "Research design validity, instrument reliability, statistical rigor, alternative methodology comparison"],
        ["Adversarial Examiner", "Highly critical, assumption-challenging, contradiction-seeking", "Research weaknesses, unsupported claims, contradictions, demand for evidence, critical limitations"],
        ["Industry Practitioner", "Practical, business-minded, deployment-focused", "User adoption rationale, ROI, real-world deployment challenges, operational sustainability"],
        ["Ethics & Impact Reviewer", "Critical, socially aware, impact-oriented", "Ethical implications, data privacy, participant consent, societal impact, bias in research design"],
        ["Technical Expert", "Deep technical, implementation-focused", "Algorithm correctness, code architecture, performance optimization, technical feasibility"],
        ["Methodology Specialist", "Highly methodical, process-oriented", "Data collection instruments, validation procedures, replicability, internal and external validity"],
      ],
      "Table 7.1. Virtual Panelist Roles, Styles, and Focus Areas"
    ),

    heading2("7.2 Panelist Assignment Algorithm"),
    body("Questions are assigned to panelists using a deterministic round-robin allocation algorithm. The assignment is computed from the question index modulo the total number of active panelists:"),

    codeBlock([
      "ALGORITHM: ASSIGN_PANELIST(questionIndex, panelists)",
      "─────────────────────────────────────────────────────────",
      "INPUT : questionIndex — zero-based index of current question",
      "        panelists     — ordered array of active panelists",
      "OUTPUT: Panelist       — assigned panelist for this question",
      "",
      "1.  assignedIndex ← questionIndex MOD panelists.length",
      "2.  RETURN panelists[assignedIndex]",
      "",
      "EXAMPLE (8 questions, 4 panelists):",
      "  Q0 → panelists[0 % 4] = panelist[0] (Technical Architect)",
      "  Q1 → panelists[1 % 4] = panelist[1] (Research Methodologist)",
      "  Q2 → panelists[2 % 4] = panelist[2] (Adversarial Examiner)",
      "  Q3 → panelists[3 % 4] = panelist[3] (Industry Practitioner)",
      "  Q4 → panelists[4 % 4] = panelist[0] (Technical Architect)",
      "  Q5 → panelists[5 % 4] = panelist[1] (Research Methodologist)",
      "  ...",
    ]),

    heading2("7.3 Voice Simulation"),
    body("Each virtual panelist is assigned a unique voice profile that controls the pitch, speaking rate, and preferred voice name used by the browser's Web Speech Synthesis API. This acoustic differentiation reinforces the illusion of multiple distinct examiners and provides an authentic oral defense simulation experience:"),

    ...simpleTable(
      ["Panelist Role", "Pitch", "Rate", "Preferred Voice Names"],
      [
        ["Technical Architect / Technical Expert", "0.85", "0.93×", "Daniel, Google UK English Male, Alex, Microsoft David"],
        ["Research Methodologist / Methodology Specialist", "1.08", "0.82×", "Samantha, Google UK English Female, Karen, Microsoft Zira"],
        ["Adversarial Examiner / Ethics & Impact Reviewer", "0.88", "0.88×", "Fred, Tom, Google US English, Microsoft Mark"],
        ["Industry Practitioner", "1.00", "1.02×", "Moira, Google Australian English, Victoria, Microsoft Hazel"],
      ],
      "Table 7.2. Virtual Panelist Voice Profiles"
    ),

    body("The voice selection algorithm iterates through each panelist's preferredVoiceNames list in priority order. If none of the preferred voices are available in the browser's voice catalog, the algorithm falls back to any en-US voice, then any English voice, and finally to the first available voice."),

    heading2("7.4 Duplicate Question Prevention"),
    body("The Coverage Map serves as the primary mechanism for preventing duplicate questions within a session. Because each entry tracks questionCount for every section, the breadth-first section selection algorithm in getNextSection() ensures that no section receives disproportionate examination. Additionally, the SYSTEM_QUESTION system prompt contains an absolute prohibition: 'NEVER repeat a question already asked.' The question history is partially serialized into the context of each new prompt via the PREVIOUS EXCHANGE section, reinforcing this constraint."),

    pageBreak(),
  ];
}

function sec8_FollowUp() {
  return [
    heading1("8. FOLLOW-UP QUESTION ALGORITHM"),

    heading2("8.1 Answer-Adaptive Follow-Up Logic"),
    body("The Defensa system implements a three-tier adaptive follow-up mechanism. After each student answer is evaluated and scored, the score determines the follow-up strategy for the subsequent question. This logic is encoded directly in the followUpCtx variable that is injected into the question generation prompt:"),

    codeBlock([
      "ALGORITHM: COMPUTE_FOLLOW_UP_CONTEXT(lastQuestion, lastAnswer, lastScore)",
      "─────────────────────────────────────────────────────────",
      "INPUT : lastQuestion — the question just asked",
      "        lastAnswer   — the student's response",
      "        lastScore    — evaluation score (0–100)",
      "OUTPUT: string       — follow-up instruction injected into prompt",
      "",
      "1.  IF lastQuestion = null OR lastAnswer = null THEN",
      "        RETURN 'FIRST QUESTION — begin with comprehension of the section.'",
      "",
      "2.  IF lastScore < 50 THEN",
      "        RETURN 'WEAK ANSWER (' + lastScore + '/100) — probe for the missing or",
      "                incorrect concept directly. Reference the specific gap in the answer.'",
      "        // Gemini must ask a deeper or corrective question",
      "",
      "3.  IF lastScore ≥ 50 AND lastScore < 70 THEN",
      "        RETURN 'PARTIAL ANSWER (' + lastScore + '/100) — ask for the missing",
      "                elements or justification not covered in the response.'",
      "        // Gemini must identify what was missing and ask for it",
      "",
      "4.  IF lastScore ≥ 70 THEN",
      "        RETURN 'STRONG ANSWER (' + lastScore + '/100) — advance to a harder",
      "                aspect or challenge an assumption from the document.'",
      "        // Gemini must escalate difficulty or challenge a deeper implication",
    ]),

    heading2("8.2 Follow-Up Decision Flowchart Description"),
    body("The follow-up question decision flow operates as follows. When a student submits an answer, the system sends it to evaluateResponseDetailed() which returns a score between 0 and 100. If the score falls below 50, indicating a weak answer where the student failed to demonstrate adequate knowledge of the examined concept, the next question prompt instructs the AI to probe directly for the missing or incorrect concept — typically by framing the question as a contrast between what the student said and what the document actually states. If the score is between 50 and 69, indicating a partial answer that covered some aspects but omitted others, the prompt instructs the AI to ask for the specific missing elements or to request further justification of claims that were incompletely developed. If the score is 70 or above, indicating a strong answer, the prompt directs the AI to either challenge an underlying assumption in the response, explore an edge case not covered, or advance to a harder dimension of the same topic. This adaptive mechanism ensures that students are neither under-challenged after strong answers nor left without targeted remediation after weak ones."),

    heading2("8.3 Session-Level Adaptive Behavior"),
    body("Beyond per-question follow-up, the system adapts at the session level through the Coverage Map. Sections where the student consistently scores below 50 will accumulate low mastery scores, causing the difficulty to remain at Easy or Moderate for those sections, and causing the breadth-first selection algorithm to continue returning to them. Sections where the student demonstrates mastery (scores ≥ 75) are marked as covered and deprioritized in subsequent selection. This dual-level adaptation — per-question contextual follow-up and per-section coverage tracking — creates a preparation experience that is both locally responsive (reacting to each answer) and globally strategic (ensuring comprehensive document coverage)."),

    pageBreak(),
  ];
}

function sec9_Evaluation() {
  return [
    heading1("9. STUDENT ANSWER EVALUATION ALGORITHM"),

    heading2("9.1 LLM-as-Judge Evaluation Framework"),
    body("Student answers are evaluated using the LLM-as-Judge paradigm — a technique in which a large language model is tasked with producing structured, rubric-grounded evaluations of text-based responses. The SYSTEM_EVALUATOR prompt establishes Gemini as a calibrated academic judge operating under four evaluation dimensions derived from standard oral defense assessment rubrics:"),

    ...simpleTable(
      ["Dimension", "Rubric Field", "Weight", "Description"],
      [
        ["Domain Knowledge", "accuracy", "35%", "Content correctness, research relevance, and methodological understanding"],
        ["Clarity of Argument", "completeness + clarity", "25% + 20%", "Depth and coverage of answer (completeness) and logical organization, academic register (clarity)"],
        ["Composure", "confidence", "20%", "Delivery quality, use of hedging language, hesitation markers, and academic composure under pressure"],
      ],
      "Table 9.1. Evaluation Dimensions and Rubric Weights"
    ),

    heading2("9.2 Weighted Score Formula"),
    body("The final session score is computed as a weighted linear combination of the four dimension scores. The formula is enforced by the SYSTEM_EVALUATOR system prompt and is verified during JSON parsing:"),

    codeBlock([
      "FORMULA: finalScore Computation",
      "─────────────────────────────────────────────────────────",
      "",
      "  finalScore = (accuracy × 0.35)",
      "             + (completeness × 0.25)",
      "             + (clarity × 0.20)",
      "             + (confidence × 0.20)",
      "",
      "Where:",
      "  accuracy     ∈ [0, 100] — content correctness and research relevance",
      "  completeness ∈ [0, 100] — depth and coverage of the answer",
      "  clarity      ∈ [0, 100] — logical organization and academic register",
      "  confidence   ∈ [0, 100] — composure and absence of hedging language",
      "",
      "NOTE: The Gemini evaluator is explicitly instructed that",
      "  finalScore MUST equal the formula output — deviations are a hard error.",
    ]),

    heading2("9.3 Confidence Score Algorithm"),
    body("The confidence dimension is computed using a pre-calculation heuristic applied to the student's speech transcript before the answer is submitted to the LLM evaluator. This ensures that the evaluator's confidence score is grounded in measurable linguistic features rather than subjective AI judgment:"),

    codeBlock([
      "ALGORITHM: analyzeSpeechConfidence(transcript)",
      "─────────────────────────────────────────────────────────",
      "INPUT : transcript — raw speech-to-text transcript of student answer",
      "OUTPUT: confidenceScore ∈ [0, 100]",
      "",
      "1.  STRONG_FILLERS ← /\\b(uh|um|erm|uhh|umm)\\b/gi",
      "    WEAK_HEDGES    ← /\\b(i think|maybe|i guess|sort of|kind of|",
      "                       i'm not sure|i believe|probably|",
      "                       i suppose|i feel like)\\b/gi",
      "",
      "2.  strongCount ← count of matches for STRONG_FILLERS in transcript",
      "3.  weakCount   ← count of matches for WEAK_HEDGES in transcript",
      "",
      "4.  confidenceScore ← 90",
      "                    − (12 × strongCount)",
      "                    − (6  × weakCount)",
      "",
      "5.  RETURN max(0, confidenceScore)",
      "    // Floor at 0 — score cannot go below 0",
    ]),

    heading2("9.4 Verdict Thresholds"),
    body("The evaluation engine produces one of three verdicts based on the computed scores. These verdicts are displayed to the student in the post-question feedback panel:"),

    ...simpleTable(
      ["Verdict", "Symbol", "Condition", "Interpretation"],
      [
        ["Correct", "✅", "finalScore ≥ 80 AND accuracy ≥ 75", "Strong domain knowledge demonstrated; response meets academic standard"],
        ["Partially Correct", "⚠️", "finalScore 60–79 OR accuracy 50–74", "Some correct aspects identified; specific gaps remain; improvement required"],
        ["Insufficient", "❌", "finalScore < 60 OR accuracy < 50", "Significant improvement required; core concepts not demonstrated"],
      ],
      "Table 9.2. Answer Evaluation Verdict Thresholds"
    ),

    heading2("9.5 Evaluator Rules and Anti-Hallucination Constraints"),
    body("The SYSTEM_EVALUATOR prompt enforces several rules designed to ensure evaluation fairness and prevent AI hallucination:"),
    bullet("Score based on SUBSTANCE, not length — a short, precise answer beats a long, vague one"),
    bullet("Cite ACTUAL PHRASES from the candidate's response in every explanation field — evaluations must be grounded in what was actually said"),
    bullet("Give partial credit with explicit explanation of what was correct vs. what was missing"),
    bullet("NEVER penalize for correct concepts expressed in different words (paraphrasing ≠ wrong)"),
    bullet("NEVER hallucinate facts about the research — evaluate only against the abstract provided"),

    heading2("9.6 Local Fallback Evaluation"),
    body("When the Gemini API is unavailable, the system falls back to a deterministic heuristic evaluation (localEvaluate()) based on keyword matching and response length analysis. This fallback scores accuracy as a function of how many expectedKeywords from the question appear in the student's answer, completeness as a function of response length, and assigns default values to clarity and confidence. While less precise than the LLM judge, this ensures that practice sessions can continue without connectivity."),

    pageBreak(),
  ];
}

function sec10_Readiness() {
  return [
    heading1("10. READINESS SCORE ALGORITHM"),

    heading2("10.1 Session-Level Readiness Computation"),
    body("The overall session readiness score is computed as the arithmetic mean of the finalScore values across all completed questions in a session. The score is stored in the defense_sessions table in Supabase PostgreSQL alongside per-dimension category scores for trend analysis:"),

    codeBlock([
      "ALGORITHM: computeSessionReadiness(questionEvaluations)",
      "─────────────────────────────────────────────────────────",
      "INPUT : questionEvaluations — array of evaluation results",
      "        Each entry: { accuracy, completeness, clarity, confidence, finalScore }",
      "OUTPUT: SessionReadiness object",
      "",
      "1.  n ← questionEvaluations.length",
      "2.  IF n = 0 THEN RETURN defaultZeroReadiness()",
      "",
      "3.  overallScore ← round(Σ(eval.finalScore for eval IN evaluations) / n)",
      "",
      "4.  accuracyScore     ← round(Σ(eval.accuracy) / n)",
      "5.  completenessScore ← round(Σ(eval.completeness) / n)",
      "6.  clarityScore      ← round(Σ(eval.clarity) / n)",
      "7.  confidenceScore   ← round(Σ(eval.confidence) / n)",
      "",
      "8.  categoryScores ← {",
      "        Accuracy:     accuracyScore,",
      "        Completeness: completenessScore,",
      "        Clarity:      clarityScore,",
      "        Confidence:   confidenceScore",
      "    }",
      "",
      "9.  weakestCategory ← categoryScores.entries()",
      "                       .sort(ascending by score)[0].key",
      "",
      "10. PERSIST TO defense_sessions:",
      "        { student_firebase_uid, overall_score, accuracy_score,",
      "          completeness_score, clarity_score, confidence_score,",
      "          questions_answered, weakest_category, project_id }",
      "",
      "11. PERSIST TO readiness_history:",
      "        { student_firebase_uid, session_id, readiness_score: overallScore }",
      "",
      "12. RETURN SessionReadiness",
    ]),

    heading2("10.2 Historical Readiness Tracking"),
    body("Every completed session appends a record to the readiness_history table in Supabase PostgreSQL. This table enables the computation of readiness trends — the student's score trajectory across multiple practice sessions — which is visualized in the Readiness Dashboard:"),

    ...simpleTable(
      ["Metric", "Computation", "Use Case"],
      [
        ["Average Score", "Mean of all readiness_score values for the student", "Overall preparation level indicator"],
        ["Improvement Rate", "Last readiness_score minus first readiness_score", "Direction and magnitude of progress over time"],
        ["Strongest Category", "Category with highest average across all sessions", "Identify consistent strengths for defense confidence"],
        ["Weakest Category", "Category with lowest average across all sessions", "Focus study effort on identified deficiency areas"],
        ["Session Count", "Total rows in readiness_history for the student", "Practice frequency indicator"],
        ["At-Risk Flag", "avgScore < 70 across all sessions", "Alert coordinators to students requiring intervention"],
      ],
      "Table 10.1. Readiness Dashboard Metrics and Computation"
    ),

    heading2("10.3 Role-Based Dashboard Access"),
    body("The readiness data stored in Supabase is queried differently depending on the role of the authenticated user, enabling differentiated insights for students, advisers, coordinators, and administrators:"),

    ...simpleTable(
      ["Role", "Visible Data", "Key Metrics"],
      [
        ["Student", "Own sessions only", "Readiness trend, average score, session history, strongest/weakest category, improvement rate"],
        ["Capstone Adviser", "Students in assigned group(s) only", "Per-student session count, average score, at-risk flag, category averages, last session date"],
        ["Capstone Coordinator", "All students in the program", "Department readiness, student rankings, at-risk students, overall readiness average"],
        ["Super Admin", "All students, all departments", "Global analytics, department comparisons, platform usage metrics, total sessions, active users"],
      ],
      "Table 10.2. Role-Based Readiness Dashboard Access Matrix"
    ),

    pageBreak(),
  ];
}

function sec11_Technologies() {
  return [
    heading1("11. AI TECHNOLOGIES USED"),

    heading2("11.1 Google Gemini API — Primary AI Engine"),
    body("The Google Gemini Generative Language API serves as the primary AI engine for all three core AI tasks: document comprehension, question generation, and answer evaluation. The system routes all AI requests through the backend server's /api/ai/generate proxy endpoint, which implements a five-model cascade to maximize availability:"),

    ...simpleTable(
      ["Model", "Priority", "Use Case"],
      [
        ["gemini-2.0-flash-lite", "1st (Primary)", "Fast, cost-effective; handles standard question and evaluation generation"],
        ["gemini-2.0-flash", "2nd Fallback", "Higher capability; used when flash-lite fails or returns empty content"],
        ["gemini-1.5-flash", "3rd Fallback", "Previous generation; broad availability across rate-limit periods"],
        ["gemini-1.5-flash-8b", "4th Fallback", "Lightweight model; used when larger models are quota-exhausted"],
        ["gemini-2.5-flash", "5th Fallback", "Latest generation; reserved for cases where all others are unavailable"],
      ],
      "Table 11.1. Gemini Model Cascade Priority"
    ),

    body("All Gemini requests use the responseMimeType: 'application/json' generation configuration, instructing the model to return only valid JSON. Responses are parsed using a JSON.parse() wrapper with error handling. On HTTP 429 (rate-limit), the system waits 8,000 milliseconds and retries once before proceeding to the next model in the cascade."),

    heading2("11.2 Groq API — Secondary AI Fallback"),
    body("When all five Gemini models fail due to quota exhaustion, the system falls back to the Groq API, which provides access to open-source large language models (LLaMA 3.3 70B, LLaMA 3.1 8B, and Mixtral 8×7B) through an OpenAI-compatible REST interface. Groq responses are requested with response_format: { type: 'json_object' } and temperature: 0.7 to balance creativity with factual accuracy."),

    heading2("11.3 Deterministic Contextual Fallback"),
    body("In the event that all AI models fail, the system falls back to the CONTEXTUAL_TEMPLATES — a static library of 80+ question templates organized by session phase (Introduction, Methodology, Results, Defense). Each template is a function that accepts the extracted research topic and keyword array and returns a contextually assembled question string. While these fallback questions are less adversarial than AI-generated questions, they are project-relevant because they inject the actual extracted keywords from the student's document."),

    heading2("11.4 Web Speech API — Speech-to-Text (STT)"),
    body("The system captures student verbal responses using the browser's native SpeechRecognition API (also known as webkitSpeechRecognition in Chromium-based browsers). The STT session is configured with:"),

    ...simpleTable(
      ["Parameter", "Value", "Purpose"],
      [
        ["continuous", "true", "Session continues recording across pauses rather than stopping after a single utterance"],
        ["interimResults", "true", "Provides real-time interim transcripts for display while student is speaking"],
        ["lang", "navigator.language (en-US fallback)", "Matches transcription language to browser locale"],
        ["maxAlternatives", "1", "Returns only the highest-confidence transcription"],
      ],
      "Table 11.2. Speech Recognition Configuration Parameters"
    ),

    body("The session accumulates final transcript segments — appending each finalized utterance to finalAccumulated — to produce a complete answer transcript regardless of pauses in speech. This accumulated transcript is then analyzed by analyzeSpeechConfidence() before submission to the evaluation engine."),

    heading2("11.5 Web Speech API — Text-to-Speech (TTS)"),
    body("Virtual panelist voices are synthesized using the browser's SpeechSynthesis API. Each panelist role maps to a unique PanelistVoiceConfig that specifies pitch, speaking rate, and preferred voice names. The speakText() function creates a SpeechSynthesisUtterance, configures it with the panelist's voice profile, and dispatches it to the browser's TTS engine. Voice selection follows the preferredVoiceNames priority list, ensuring acoustic differentiation between panelists."),

    heading2("11.6 Firebase Authentication"),
    body("Firebase Authentication serves as the Single Source of Truth (SSOT) for all user identity management. The system uses Firebase's email and password authentication provider. All backend API routes verify the Firebase ID token (JWT) submitted in the Authorization: Bearer header before processing any request. The verification is performed by the firebase-admin SDK's auth.verifyIdToken() method. The decoded token's uid field — the Firebase UID — serves as the canonical user identifier that links all backend data operations."),

    heading2("11.7 Supabase PostgreSQL — Persistent Data Storage"),
    body("Supabase PostgreSQL serves as the Single Source of Truth for all academic records. The system stores defense sessions, session questions, evaluation results, readiness history, and audit logs in a normalized relational schema. All database operations are performed server-side using the Supabase JavaScript client configured with the service role key, which bypasses Row Level Security (RLS) policies. RLS is enabled on all tables to block direct client-side access, ensuring that the backend server is the only entry point to the database."),

    pageBreak(),
  ];
}

function sec12_Validation() {
  return [
    heading1("12. SYSTEM ACCURACY AND VALIDATION"),

    heading2("12.1 Question Relevance and Traceability"),
    body("The primary mechanism for ensuring question relevance in the Defensa system is document grounding — the requirement that every question generated by the AI must cite content from the uploaded research document. This is enforced through two mechanisms. First, the question generation prompt explicitly instructs Gemini to include a source_excerpt field containing an exact or paraphrased excerpt from the document, and an expectedKeywords array of six to eight domain-specific terms from the document. Second, the SYSTEM_QUESTION prompt contains an absolute prohibition: 'NEVER invent project details, technologies, or findings not in the document' and 'NEVER reference information outside the provided document.'"),

    heading2("12.2 Question Coverage Rate"),
    body("Coverage completeness is ensured by the Coverage Map mechanism. The system tracks examination progress across all detected document sections, and the breadth-first section selection algorithm guarantees that no section is completely bypassed during a session of sufficient length. A session is considered fully covered when all sections in the Coverage Map have their covered flag set to TRUE, which occurs when the section's mastery score reaches or exceeds 75. The system continues generating questions across all sections until all are covered or the configured question limit is reached."),

    heading2("12.3 Evaluation Consistency"),
    body("The LLM-as-Judge evaluation framework achieves consistency through a fixed, explicit scoring formula enforced by the SYSTEM_EVALUATOR prompt. The prompt specifies that finalScore must mathematically equal the weighted sum of dimension scores, providing an objective cross-check. Furthermore, the instruction to cite actual phrases from the student's response in every explanation field anchors evaluations to observable evidence, reducing subjective drift between evaluation instances. The pre-calculated confidence score — computed deterministically from speech transcript analysis — further reduces the evaluator's reliance on subjective assessment for the confidence dimension."),

    heading2("12.4 System Performance Metrics"),
    ...simpleTable(
      ["Metric", "Target", "Measurement Method"],
      [
        ["Question Relevance Rate", "≥ 95% of questions traceable to document content", "Presence of source_excerpt field in question response"],
        ["Coverage Rate", "All detected sections examined in a standard session", "Coverage Map completeness at session end"],
        ["Evaluation Consistency", "finalScore = Σ(dimension × weight) ± 1", "Formula validation in parseAIJson() after evaluation"],
        ["API Availability", "> 99% with fallback cascade", "Multi-model cascade with Groq and contextual fallback"],
        ["Session Recovery", "100% state restoration after browser refresh", "active_sessions table upsert on every state change"],
        ["Response Latency", "< 4 seconds per question (API dependent)", "Server-side timestamp logging per AI proxy call"],
      ],
      "Table 12.1. System Performance Metrics and Targets"
    ),

    heading2("12.5 Academic Validation Process"),
    body("The evaluation rubric used by Defensa — accuracy (35%), completeness (25%), clarity (20%), confidence (20%) — is aligned with standardized oral examination assessment frameworks commonly used in higher education institutions for capstone and thesis defense evaluations. The panelist roles (Technical Architect, Research Methodologist, Adversarial Examiner, Industry Practitioner) mirror the composition of actual academic defense panels, which typically include a thesis adviser, a subject matter expert, and a research methods specialist."),
    body("The system's SYSTEM_QUESTION prompt was developed with reference to Bloom's Taxonomy of Educational Objectives, ensuring that questions span all cognitive levels — from comprehension and recall (Easy difficulty) through analysis and evaluation (Hard difficulty) to synthesis and creation (Expert difficulty). This alignment ensures that the difficulty calibration used by the system corresponds to validated pedagogical standards for oral examination design."),

    pageBreak(),
  ];
}

function sec13_Conclusion() {
  return [
    heading1("13. CONCLUSION"),

    heading2("13.1 Summary of Document Analysis Process"),
    body("The Defensa system implements a rigorous, multi-stage document analysis pipeline that transforms student-uploaded DOCX and PDF files into structured knowledge representations suitable for AI-driven question generation. The pipeline begins with strict file validation enforcing a 5 MB size limit and PDF/DOCX format exclusivity, followed by format-specific text extraction using pdfjs-dist (PDF) and Mammoth.js (DOCX). The extracted text undergoes deterministic normalization to remove Unicode artifacts and irregular whitespace, followed by a multi-criterion gibberish detection algorithm that validates content quality before any AI processing is initiated. Content segmentation uses Gemini to identify chapter and section boundaries, falling back to a keyword-matching algorithm covering nine chapter-level section categories when AI is unavailable."),

    heading2("13.2 Summary of Question Generation Process"),
    body("Question generation in Defensa is governed by the principle of document fidelity — every question must cite specific content from the student's research document and cannot be answered without knowledge of that specific research. The system maintains a Coverage Map that tracks mastery across all detected document sections, implementing a breadth-first examination strategy that ensures comprehensive coverage. Adaptive difficulty calibration adjusts question complexity based on demonstrated mastery (Easy: 0–24, Moderate: 25–49, Hard: 50–74, Expert: 75+), and per-answer follow-up logic generates contextually appropriate follow-up questions based on the student's answer quality. Eight pre-generated questions spanning four difficulty levels (2×Easy, 2×Moderate, 2×Hard, 2×Expert) are assigned in round-robin fashion across up to seven distinct virtual panelist personas."),

    heading2("13.3 Summary of Evaluation Process"),
    body("Student answers are evaluated using the LLM-as-Judge paradigm with Google Gemini as the judge. The evaluation rubric assigns weights of 35% to accuracy (domain knowledge), 25% to completeness (depth and coverage), 20% to clarity (logical organization and academic register), and 20% to confidence (composure and absence of hedging language). The confidence dimension is pre-calculated from the student's speech transcript using a deterministic formula that deducts points for strong hesitation markers (uh, um, erm: -12 points each) and weak hedging language (I think, maybe, sort of: -6 points each), starting from a baseline score of 90. The final score is computed as a weighted linear combination of all four dimensions. Verdicts are assigned at three thresholds: Correct (≥80 final AND ≥75 accuracy), Partially Correct (60–79 final OR 50–74 accuracy), and Insufficient (below these thresholds)."),

    heading2("13.4 Summary of Readiness Assessment Process"),
    body("Session-level readiness scores are computed as the arithmetic mean of finalScore values across all completed questions and are stored persistently in the Supabase PostgreSQL readiness_history table. Historical trend data enables the computation of improvement rate (first-to-last score delta), identification of strongest and weakest categories across all sessions, and at-risk detection (students with an average score below 70). This data is surfaced through differentiated dashboard views accessible to students (personal trend), advisers (group students), coordinators (program-wide), and administrators (institution-wide), enabling academic stakeholders at all levels to monitor and support student preparation progress."),

    heading2("13.5 Architectural Significance"),
    body("The Defensa AI framework represents a complete, production-ready implementation of an intelligent oral examination simulation system. Its multi-layer fallback architecture — Gemini cascade → Groq → contextual templates — ensures uninterrupted operation regardless of external API availability. Its document fidelity principle, enforced through prompt engineering at both the question generation and evaluation stages, guarantees that the simulation is maximally relevant to each student's specific research. The integration of Firebase Authentication for identity management and Supabase PostgreSQL for persistent academic records provides an enterprise-grade data layer capable of supporting comprehensive historical analytics, session recovery, and role-based access control at institutional scale."),

    blank(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480, after: 480 },
      children: [new TextRun({ text: "— End of Document —", font: FONT, size: SIZE_BODY, italics: true })],
    }),
  ];
}

// ── ASSEMBLE & WRITE ─────────────────────────────────────────

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: SIZE_BODY },
        paragraph: { spacing: { line: 360 } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1080 },
        },
      },
      children: [
        ...titlePage(),
        ...sec1_Introduction(),
        ...sec2_Architecture(),
        ...sec3_DocumentProcessing(),
        ...sec4_ContentAnalysis(),
        ...sec5_QuestionGeneration(),
        ...sec6_Adversarial(),
        ...sec7_Panelists(),
        ...sec8_FollowUp(),
        ...sec9_Evaluation(),
        ...sec10_Readiness(),
        ...sec11_Technologies(),
        ...sec12_Validation(),
        ...sec13_Conclusion(),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync("Defensa_AI_Framework_Thesis_Document.docx", buffer);
console.log("✅ Document generated: Defensa_AI_Framework_Thesis_Document.docx");
