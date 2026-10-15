# Ask VaultMind — Chat with Your Documents: Architecture & Specification

## 1. Overview & Objectives

**Feature Name:** Ask VaultMind — Chat with Your Documents

**Objective:** Enable users to upload documents (PDF, DOCX, TXT), process and segment text into searchable chunks, and ask natural-language questions through a dedicated chat workspace. The system retrieves relevant chunks from the authenticated user's uploaded documents, grounds answers strictly in verified context using Google Gemini with structured source citations, and resists prompt injection or hallucination.

---

## 2. 7-Day Implementation Plan & Commit Sequence

| Day | Milestone | Key Deliverables | Commit Message |
|---|---|---|---|
| **Day 1** | **Repository Analysis & Foundation** | Repo audit, architecture design, schema models (`DocumentChunk`, `ChatMessage`), RAG config, TypeScript interfaces, root `.gitignore` | `feat(vaultmind): establish document chat foundation` |
| **Day 2** | **Document Upload & Validation** | Backend upload validation (MIME, size, empty files), processing status tracking, user quota limits, frontend upload UI feedback | `feat(vaultmind): add secure document upload` |
| **Day 3** | **Text Extraction & Chunking** | Extraction pipelines (PDF, DOCX, TXT), text normalization, sliding-window chunking with overlap & page metadata preservation | `feat(vaultmind): implement document extraction and chunking` |
| **Day 4** | **Indexing & Retrieval** | Chunk-level TF-IDF & vector space retrieval engine, document-level filtering, similarity scoring, unit tests | `feat(vaultmind): add document indexing and retrieval` |
| **Day 5** | **Grounded Question Answering** | Gemini RAG service, strict anti-injection prompt fencing, insufficient evidence fallback, source citation builder | `feat(vaultmind): add grounded document question answering` |
| **Day 6** | **Chat UI & Citations** | Modern chat interface, message history, suggested questions, evidence drawer with page numbers & excerpts, loading states | `feat(vaultmind): integrate chat interface and citations` |
| **Day 7** | **Testing, Hardening & Docs** | Comprehensive automated tests, edge case validation, documentation, environment guide, security checks | `test(vaultmind): validate and document document chat workflow` |

---

## 3. Core Architecture & Data Flow

```text
[User Upload (PDF/DOCX/TXT)]
           │
           ▼
[Validation: MIME, Size, Quota, Non-empty]
           │
           ▼
[Storage: Supabase Private User Folder + Mongo Metadata]
           │
           ▼
[Extraction Pipeline: pdf-parse / mammoth / utf8-buffer]
           │
           ▼
[Chunking Engine: 800-char window, 150-char overlap, page/section metadata]
           │
           ▼
[Chunk Storage: DocumentChunk Collection (Indexed by userId & fileId)]
           │
           ▼
[User Submits Question to Ask VaultMind]
           │
           ▼
[Retrieval Engine: TF-IDF Cosine Similarity / Hybrid Search over User Chunks]
           │
           ▼ Top-K Chunks Retrieved (Score Thresholding)
           │
           ├─ If Insufficient Score: Fallback "I couldn't find sufficient information..."
           │
           ▼
[Grounded Prompt Construction: System Fence + Untrusted Context + User Question]
           │
           ▼
[Gemini Generative AI Engine (Candidate Fallback Chain)]
           │
           ▼
[Response Builder: Grounded Answer + Structured Evidence Citations (Doc, Page, Excerpt)]
           │
           ▼
[Ask VaultMind Chat UI: Reactive Display, Citations Badges, Modal Source Inspector]
```

---

## 4. Security & Guardrails

1. **User Scoping & Isolation**: Chunks and documents are strictly indexed and queried by `userId` verified from validated JWT cookies. Users can never query or access other users' documents.
2. **Untrusted Data Fencing**: Extracted document content is treated as completely untrusted input. System prompts wrap context in strict containment delimiters (`<<<DOCUMENT_CONTEXT>>> ... <<<END_DOCUMENT_CONTEXT>>>`) and instruct the model to ignore any system prompt overrides, instructions, or commands embedded within documents.
3. **Hallucination Prevention**: Explicit prompt constraints prohibit speculating or inventing facts. If retrieved context is missing or relevance score falls below threshold, a standardized honest fallback is returned.
4. **File Validation & Safety**: Server-side validation of file extension, MIME type, file size (5MB cap), non-empty buffers, and path traversal prevention.
5. **No Secret Leakage**: API keys, credentials, and sensitive tokens remain strictly on the backend, read only from process environment variables.

---

## 5. Technology Stack & Reusability

- **Frontend**: Next.js 15, React 19, Tailwind CSS v4, DaisyUI v5, Radix UI Icons, TypeScript.
- **Backend**: Express 5, Node.js, Mongoose (MongoDB Atlas), Supabase Storage.
- **AI / LLM**: Google Generative AI SDK (`@google/generative-ai`) with automated candidate fallback (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`).
- **Retrieval Engine**: TF-IDF Vector Space retrieval with Cosine Similarity, chunk-level keyword weighting, and metadata enrichment.
