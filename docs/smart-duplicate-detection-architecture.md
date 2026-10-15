# 🧠 Smart Duplicate Detection — Architecture & Specification

## 1. Executive Summary & Objective

**VaultMind** is an AI-powered cloud storage and document workspace built with Next.js 15, Express.js, MongoDB Atlas, and Supabase Storage. With user storage constraints (e.g., maximum 12 files per user, 5MB per file), duplicate file uploads waste storage capacity, degrade search quality, and clutter the user dashboard.

**Feature 4: Smart Duplicate Detection** provides an intelligent, deterministic duplicate identification engine integrated seamlessly into the existing VaultMind backend and frontend architectures. It detects potential duplicate files prior to persistence, computes fine-grained similarity scores, explains matching rationale in plain English, and provides non-blocking review controls (Cancel, Rename, or Save Anyway) within the application's sleek dark-mode design system.

---

## 2. Existing System Architecture Analysis

### 2.1 Backend Architecture
- **Framework**: Express.js 5 REST API running on Node.js (`Backend/app.js`).
- **Database & ODM**: MongoDB Atlas with Mongoose 9 (`Backend/models/file.model.js`, `Backend/models/user.model.js`).
- **Storage Layer**: Supabase Storage (`Files-upload` bucket under `{userId}/{fileName}`).
- **Authentication**: JWT token in HTTP-only cookies verified by `authMiddleware` (`Backend/middlewares/auth.middleware.js`). User identity (`req.user.userId`) scopes all file queries.
- **File Lifecycle**:
  - `GET /files/home`: Lists files for authenticated user, joining Supabase storage objects with MongoDB metadata.
  - `POST /files/upload-file`: Accepts multipart form (`req.files.file`), verifies user file limits and 5MB threshold, uploads to Supabase, creates MongoDB `File` document, and spawns asynchronous AI background processing (text extraction, Gemini AI tagging, summarization).
  - `POST /files/rename-file`: Renames existing file in Supabase storage and updates metadata.
  - `POST /files/delete-file`: Removes file from Supabase and MongoDB.

### 2.2 Frontend Architecture
- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript.
- **Styling**: Tailwind CSS v4, DaisyUI v5, OKLCH design tokens, Radix UI iconography.
- **Client API**: `ApiClient` (`Frontend/lib/api.ts`) managing authenticated requests with credentials.
- **Dashboard View**: `Frontend/app/dashboard/page.tsx` managing upload trigger via hidden input ref (`handleUpload`), file cards (`FileCard.tsx`), search, and category filters.

### 2.3 Data Model: `File` Entity
Defined in `Backend/models/file.model.js`:
| Field | Type | Description |
|---|---|---|
| `userId` | `String` (Indexed) | Scopes file to specific user |
| `fileName` | `String` | Timestamped storage identifier (`{timestamp}-{originalName}`) |
| `originalName` | `String` | Client-provided original file name |
| `supabasePath` | `String` | Path inside Supabase bucket (`{userId}/{fileName}`) |
| `mimetype` | `String` | MIME type (e.g. `application/pdf`, `image/png`) |
| `size` | `Number` | File size in bytes |
| `textContent` | `String` | Extracted raw text (processed asynchronously) |
| `keywords` | `[String]` | Extracted keyword tokens |
| `tags` | `[String]` | AI-generated categorical tags |
| `category` | `String` | AI-classified category (Invoice, Resume, Contract, Photo, etc.) |
| `summary` | `String` | AI-generated summary |
| `createdAt` | `Date` | Timestamp of upload |

---

## 3. Duplicate Detection Engine: Matching Strategy & Scoring

The detection engine uses a deterministic, multi-attribute scoring model. No single attribute automatically triggers a duplicate match to avoid false positives (e.g., two distinct files that happen to share an identical 12,450-byte size, or two files named `Notes.txt` created 6 months apart with different sizes).

### 3.1 Normalization Pipeline
Before calculating similarity, file attributes undergo strict normalization:
1. **Filename Normalization**:
   - Trim leading/trailing whitespace.
   - Convert to lowercase.
   - Separate extension from basename (e.g., `Financial_Report (1).pdf` -> basename: `financial_report (1)`, ext: `pdf`).
   - Strip OS duplicate suffixes from basename:
     - `\s*\(\d+\)$` (e.g., ` " (1)"`, ` " (2)"`)
     - `\s*-\s*copy(\s*\(\d+\))?$` (e.g., ` " - Copy"`, ` " - copy (1)"`)
     - `_copy(\d+)?$` (e.g., ` "_copy"`, ` "_copy2"`)
   - Replace underscores, hyphens, and periods with single spaces.
   - Collapse consecutive whitespace into single spaces.
2. **Mimetype & Extension Normalization**:
   - Canonicalize known file extensions and map common aliases (e.g., `jpg` <-> `jpeg`, `docx` <-> `doc`).
3. **Size Normalization**:
   - Round to bytes; calculate percentage byte delta: `|size1 - size2| / max(size1, size2)`.

### 3.2 Similarity Metric Definitions
1. **Levenshtein Distance & Normalized Ratio**:
   $$\text{ratio}(s_1, s_2) = 1 - \frac{\text{LevenshteinDistance}(s_1, s_2)}{\max(\text{len}(s_1), \text{len}(s_2))}$$
2. **Token Set Jaccard Similarity**:
   $$\text{Jaccard}(T_1, T_2) = \frac{|T_1 \cap T_2|}{|T_1 \cup T_2|}$$
   Where $T_1$ and $T_2$ are whitespace-delimited word tokens from the normalized basenames.
3. **Composite Name Similarity**:
   $$\text{Score}_{\text{name}} = 0.6 \times \text{ratio}(s_1, s_2) + 0.4 \times \text{Jaccard}(T_1, T_2)$$
4. **Size Similarity**:
   - If `size1 === size2`: $\text{Score}_{\text{size}} = 1.0$
   - If size difference $\le 1\%$: $\text{Score}_{\text{size}} = 0.9$
   - If size difference $\le 5\%$: $\text{Score}_{\text{size}} = 0.7$
   - If size difference $\le 10\%$: $\text{Score}_{\text{size}} = 0.4$
   - Otherwise: $\text{Score}_{\text{size}} = 0.0$
5. **Extension / Type Similarity**:
   - Exact extension match: $\text{Score}_{\text{type}} = 1.0$
   - Same general MIME group (e.g. image vs image): $\text{Score}_{\text{type}} = 0.6$
   - Different: $\text{Score}_{\text{type}} = 0.0$

### 3.3 Weighted Confidence Formula
$$\text{Confidence Score} = w_n \cdot \text{Score}_{\text{name}} + w_s \cdot \text{Score}_{\text{size}} + w_t \cdot \text{Score}_{\text{type}}$$
Default Weights:
- $w_n = 0.50$ (Filename weight)
- $w_s = 0.35$ (Size weight)
- $w_t = 0.15$ (Type/Extension weight)

**Confidence Classifications & Thresholds**:
- **CONFIRMED / EXACT DUPLICATE** ($\ge 0.95$): Exact normalized name, exact file size, exact mimetype.
- **HIGH CONFIDENCE** ($0.80 - 0.94$): Minor spelling variation or duplicate suffix (e.g. `(1)`) + identical size, or exact name + within 1% size.
- **MODERATE CONFIDENCE** ($0.65 - 0.79$): Matching normalized name with different size (potential revised edition), or high name similarity with identical type.
- **LOW / CLEAN** ($< 0.65$): Disregarded as duplicate; does not block or warn the user.

### 3.4 Dynamic Explanation Generation
For every candidate scored $\ge 0.65$, generate bulleted plain-English reasons:
- `Exact byte size match (${size} bytes)` or `Nearly identical file size (${deltaPercent}% difference)`
- `Identical filename` or `Matching filename after stripping copy suffixes ("${cleanName}")`
- `High filename similarity (${similarityPercent}%) with minor spelling variations`
- `Matching file extension (.${ext}) and MIME format`
- `Same document category ("${category}")`

---

## 4. API Endpoints & Contract

### 4.1 Check Duplicate Endpoint: `POST /files/check-duplicate`
Allows client to pre-screen a file prior to or during upload/rename.

**Request Payload**:
```json
{
  "originalName": "Quarterly_Financial_Report (1).pdf",
  "size": 1048576,
  "mimetype": "application/pdf",
  "excludeFileId": "optional-file-id-for-updates"
}
```

**Response Payload (`200 OK`)**:
```json
{
  "success": true,
  "isDuplicate": true,
  "confidenceLevel": "HIGH",
  "highestScore": 0.91,
  "duplicates": [
    {
      "fileId": "651a123...",
      "fileName": "1729000000000-Quarterly_Financial_Report.pdf",
      "originalName": "Quarterly_Financial_Report.pdf",
      "size": 1048576,
      "mimetype": "application/pdf",
      "category": "Report",
      "createdAt": "2026-10-14T08:30:00.000Z",
      "similarityScore": 0.91,
      "confidenceLevel": "HIGH",
      "reasons": [
        "Exact byte size match (1.0 MB)",
        "Filename matches after stripping copy suffix '(1)'",
        "Identical document category (Report)"
      ]
    }
  ],
  "message": "Potential duplicate detected: matches existing file 'Quarterly_Financial_Report.pdf'"
}
```

If no duplicate is detected:
```json
{
  "success": true,
  "isDuplicate": false,
  "confidenceLevel": "NONE",
  "highestScore": 0.22,
  "duplicates": [],
  "message": "No duplicate records detected."
}
```

### 4.2 Safe Upload Endpoint Integration: `POST /files/upload-file`
- Accepts an optional form field `allowDuplicate: "true"`.
- If `allowDuplicate` is not `"true"`, backend performs authoritative check against existing files.
- If an exact duplicate ($\ge 0.95$) is detected and not explicitly confirmed by the user, returns `409 Conflict` with the duplicate payload, preventing accidental double-uploads.

---

## 5. User Interface & User Experience Design

The frontend workflow integrates with the existing dashboard (`Frontend/app/dashboard/page.tsx`):
1. **Pre-Upload Interception**:
   - When the user selects a file via drag-and-drop or file picker, the client invokes `apiClient.checkDuplicate(...)`.
   - If clean (`isDuplicate: false`), the upload proceeds directly.
2. **Smart Duplicate Warning Modal / Dialog**:
   - Beautiful dark-mode modal designed with Tailwind CSS, backdrop blur (`backdrop-blur-md`), and OKLCH color accents.
   - Shows badge: Amber for "Potential Duplicate", Red/Orange for "Exact Duplicate".
   - Displays a side-by-side comparison table:
     - **Incoming File**: Name, size, format.
     - **Existing File in VaultMind**: Original name, size, category, upload date.
   - Displays matching reasons in interactive pills/bullet points.
   - **Review Actions**:
     - **Cancel**: Aborts upload, dismisses modal, resets file input.
     - **Rename & Save**: Input field allowing inline renaming before upload.
     - **Upload Anyway**: Explicitly confirms upload with `allowDuplicate: true`.

---

## 6. Comprehensive Test Plan

| Test ID | Scenario | Input Characteristics | Expected Result |
|---|---|---|---|
| **TC-01** | Exact identical record | Same name, same size, same mimetype | Score $\ge 0.95$, flagged as EXACT DUPLICATE with exact size & name reasons |
| **TC-02** | Different capitalization | `PROJECT_PLAN.PDF` vs `project_plan.pdf` | Normalized match, Score $\ge 0.95$, flagged as DUPLICATE |
| **TC-03** | Leading/trailing/repeated whitespace | `  annual_report.docx  ` vs `annual report.docx` | Normalized match, Score $\ge 0.95$, flagged as DUPLICATE |
| **TC-04** | Duplicate copy suffixes | `Invoice (1).pdf` or `Invoice - Copy.pdf` vs `Invoice.pdf` | Normalized base match, exact size, Score $\ge 0.90$, flagged as HIGH CONFIDENCE |
| **TC-05** | Minor spelling variation | `resume_john_doe.pdf` vs `resume_jon_doe.pdf` | Levenshtein similarity $\ge 0.90$, flagged with spelling variation reason |
| **TC-06** | Same size, completely different name | `budget.xlsx` (15KB) vs `avatar.png` (15KB) | Score $< 0.45$, NOT flagged as duplicate |
| **TC-07** | Same name, completely different size/date | `notes.txt` (1KB) vs `notes.txt` (500KB) | Moderate score (0.65-0.75), flagged as potential revision, NOT exact |
| **TC-08** | Missing optional fields | Mimetype omitted or null | Gracefully defaults to extension parser; no crash |
| **TC-09** | Empty or invalid submission | Name is empty or size $< 0$ | Handled gracefully with validation error |
| **TC-10** | Exclude self during update/rename | Checking existing file against its own ID | Existing record is excluded; returns no duplicate |
| **TC-11** | User bypass / Upload Anyway | User acknowledges warning and submits `allowDuplicate: true` | Upload succeeds, saved to Supabase and MongoDB |
| **TC-12** | Empty dataset | First upload for brand new user with 0 files | Returns `isDuplicate: false` immediately without errors |
