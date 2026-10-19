/**
 * Automated Unit Tests for Day 3: Document Text Extraction & Semantic Chunking
 */
const assert = require("assert");
const {
    normalizeExtractedText,
    extractDocument,
    extractKeywords,
} = require("../utils/textExtractor");
const {
    chunkDocument,
    chunkTextBlock,
    findNaturalSplitPoint,
} = require("../utils/chunkingEngine");

console.log("=== Running Day 3 Document Extraction & Chunking Tests ===");

let passed = 0;
let failed = 0;

const runTest = (name, testFn) => {
    try {
        testFn();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`[FAIL] ${name}:`, err.message);
        failed++;
    }
};

const runAsyncTest = async (name, testFn) => {
    try {
        await testFn();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`[FAIL] ${name}:`, err.message);
        failed++;
    }
};

(async () => {
    // 1. Text Normalization
    runTest("normalizeExtractedText cleans CRLF, control characters, and excess whitespace", () => {
        const dirty = "Line 1\r\nLine 2\r\n\r\n\r\n\r\nLine 3\x00\x08with   extra   spaces.  ";
        const clean = normalizeExtractedText(dirty);
        assert.strictEqual(clean.includes("\r"), false);
        assert.strictEqual(clean.includes("\x00"), false);
        assert.strictEqual(clean.includes("\n\n\n"), false);
        assert.strictEqual(clean.startsWith("Line 1\nLine 2\n\nLine 3with   extra   spaces."), true);
    });

    // 2. Empty Text Normalization
    runTest("normalizeExtractedText handles null, undefined and empty strings safely", () => {
        assert.strictEqual(normalizeExtractedText(null), "");
        assert.strictEqual(normalizeExtractedText(undefined), "");
        assert.strictEqual(normalizeExtractedText("   "), "");
    });

    // 3. Plain Text Extraction
    await runAsyncTest("extractDocument extracts and normalizes UTF-8 text from buffer", async () => {
        const sampleText = "Welcome to VaultMind.\nThis is an AI-powered cloud storage document.";
        const buffer = Buffer.from(sampleText, "utf-8");
        const result = await extractDocument(buffer, "text/plain", "readme.txt");

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.text, sampleText);
        assert.strictEqual(result.pages.length, 1);
        assert.strictEqual(result.pages[0].pageNumber, 1);
    });

    // 4. Empty Buffer Extraction Rejection
    await runAsyncTest("extractDocument rejects empty buffer with meaningful error", async () => {
        const emptyBuffer = Buffer.alloc(0);
        const result = await extractDocument(emptyBuffer, "application/pdf", "empty.pdf");

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.text, null);
        assert.match(result.error, /empty buffer/i);
    });

    // 5. Unsupported Format Handling
    await runAsyncTest("extractDocument gracefully rejects unsupported format", async () => {
        const buffer = Buffer.from("image binary data");
        const result = await extractDocument(buffer, "image/png", "photo.png");

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.text, null);
        assert.match(result.error, /unsupported/i);
    });

    // 6. Natural Boundary Finding: Paragraph Break
    runTest("findNaturalSplitPoint prefers splitting at paragraph breaks (\\n\\n)", () => {
        const text = "First section content that has some length.\n\nSecond section starts right here.";
        const splitPoint = findNaturalSplitPoint(text, 0, 50);
        const chunk = text.substring(0, splitPoint);
        assert.strictEqual(chunk, "First section content that has some length.\n\n");
    });

    // 7. Natural Boundary Finding: Sentence End
    runTest("findNaturalSplitPoint splits at sentence endings without cutting words", () => {
        const text = "Sentence number one is complete. Sentence number two continues the thought for a while.";
        const splitPoint = findNaturalSplitPoint(text, 0, 45);
        const chunk = text.substring(0, splitPoint);
        assert.strictEqual(chunk, "Sentence number one is complete. ");
    });

    // 8. Sliding-Window Chunking with Overlap
    runTest("chunkTextBlock generates overlapping chunks preserving words and offsets", () => {
        const longText = [
            "VaultMind is a next-generation workspace for document search and intelligent analysis.",
            "It integrates retrieval-augmented generation to answer questions strictly grounded in uploaded content.",
            "Users can upload PDF, DOCX, and TXT files and query them seamlessly using natural language.",
            "Security guardrails prevent prompt injection and hallucinated citations.",
            "Every generated response includes exact document references and page numbers.",
        ].join(" ");

        const chunks = chunkTextBlock(longText, { chunkSize: 120, chunkOverlap: 30 });

        assert.ok(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);

        // Verify sequential character ordering
        for (let i = 0; i < chunks.length; i++) {
            assert.ok(chunks[i].text.length >= 50, `Chunk ${i} should meet minimum length`);
            assert.ok(chunks[i].charEnd > chunks[i].charStart, `Chunk ${i} charEnd must exceed charStart`);
            assert.ok(Array.isArray(chunks[i].keywords), `Chunk ${i} must have keywords array`);
            assert.ok(chunks[i].metadata.tokenEstimate > 0, `Chunk ${i} must have positive token estimate`);
        }

        // Verify overlap between chunk 0 and chunk 1
        const chunk0Text = chunks[0].text;
        const chunk1Text = chunks[1].text;
        const overlapFound = chunk0Text.split(" ").slice(-2).some((word) => chunk1Text.includes(word));
        assert.ok(overlapFound, "Consecutive chunks must share overlapping context");
    });

    // 9. Page Number Preservation in Multi-Page Document
    runTest("chunkDocument preserves page numbers across multi-page PDF documents", () => {
        const multiPageDoc = {
            text: "Page 1 Content.\n\nPage 2 Content.",
            pages: [
                {
                    pageNumber: 1,
                    text: "This is the content on page one of the financial report detailing revenue and quarterly earnings.",
                },
                {
                    pageNumber: 2,
                    text: "This is the content on page two covering operational expenditures, cloud hosting, and employee headcounts.",
                },
                {
                    pageNumber: 3,
                    text: "This is the content on page three presenting future projections and strategic roadmap initiatives.",
                },
            ],
        };

        const chunks = chunkDocument(multiPageDoc, { chunkSize: 150, chunkOverlap: 25 });

        assert.strictEqual(chunks.length, 3);
        assert.strictEqual(chunks[0].pageNumber, 1);
        assert.strictEqual(chunks[1].pageNumber, 2);
        assert.strictEqual(chunks[2].pageNumber, 3);
        assert.strictEqual(chunks[0].chunkIndex, 0);
        assert.strictEqual(chunks[1].chunkIndex, 1);
        assert.strictEqual(chunks[2].chunkIndex, 2);
    });

    // 10. Keyword Extraction Integrity
    runTest("extractKeywords extracts top non-stopword keywords from document text", () => {
        const text = "Artificial intelligence and machine learning models process vector embeddings for retrieval search systems.";
        const keywords = extractKeywords(text);
        assert.ok(keywords.includes("intelligence") || keywords.includes("artificial"));
        assert.ok(keywords.includes("embeddings") || keywords.includes("retrieval"));
        assert.strictEqual(keywords.includes("and"), false);
        assert.strictEqual(keywords.includes("for"), false);
    });

    console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===`);
    if (failed > 0) {
        process.exit(1);
    }
})();
