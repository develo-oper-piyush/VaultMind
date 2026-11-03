/**
 * Automated Unit Tests for Day 5: Grounded Document Question Answering & Citations
 */
const assert = require("assert");
const {
    validateQuestion,
    buildContextPrompt,
    buildCitations,
} = require("../utils/askDocumentService");
const ragConfig = require("../config/ragConfig");

console.log("=== Running Day 5 Question Answering & Citations Tests ===");

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

// 1. Question Validation: Acceptance
runTest("validateQuestion accepts valid questions", () => {
    const result = validateQuestion("What were the total expenses in Q3 2026?");
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.question, "What were the total expenses in Q3 2026?");
});

// 2. Question Validation: Rejection of Empty/Short Questions
runTest("validateQuestion rejects empty, whitespace, or single character questions", () => {
    assert.strictEqual(validateQuestion("").valid, false);
    assert.strictEqual(validateQuestion("   ").valid, false);
    assert.strictEqual(validateQuestion("?").valid, false);
    assert.strictEqual(validateQuestion(null).valid, false);
    assert.strictEqual(validateQuestion(undefined).valid, false);
});

// 3. Question Validation: Rejection of Oversized Input
runTest("validateQuestion rejects questions exceeding 1000 characters", () => {
    const hugeQuestion = "a".repeat(1001);
    const result = validateQuestion(hugeQuestion);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /too long/i);
});

// 4. Grounded Context Prompt Construction
runTest("buildContextPrompt encloses chunks inside strict untrusted context containment fences", () => {
    const mockChunks = [
        {
            fileId: "file-1",
            originalName: "Financial_Report.pdf",
            fileName: "123-Financial_Report.pdf",
            pageNumber: 4,
            chunkIndex: 2,
            text: "Total operating expenses for Q3 were $1.4 million.",
            score: 0.85,
        },
        {
            fileId: "file-2",
            originalName: "HR_Policy.docx",
            fileName: "456-HR_Policy.docx",
            pageNumber: 1,
            chunkIndex: 0,
            text: "Annual leave must be requested 14 days in advance.",
            score: 0.62,
        },
    ];

    const prompt = buildContextPrompt("What were the operating expenses?", mockChunks);

    // Verify presence of context containment delimiters
    assert.ok(prompt.includes("<<<DOCUMENT_CONTEXT>>>"), "Must include opening context fence");
    assert.ok(prompt.includes("<<<END_DOCUMENT_CONTEXT>>>"), "Must include closing context fence");

    // Verify source attribution headers
    assert.ok(prompt.includes('Document: "Financial_Report.pdf"'));
    assert.ok(prompt.includes("Page 4"));
    assert.ok(prompt.includes("Total operating expenses for Q3 were $1.4 million."));

    assert.ok(prompt.includes('Document: "HR_Policy.docx"'));

    // Verify anti-hallucination instruction
    assert.ok(prompt.includes(ragConfig.INSUFFICIENT_CONTEXT_MESSAGE));
    assert.ok(prompt.includes("USER QUESTION:\nWhat were the operating expenses?"));
});

// 5. Source Citation Generation
runTest("buildCitations accurately maps retrieved chunks into evidence citations", () => {
    const mockChunks = [
        {
            fileId: "file-99",
            originalName: "Architecture_Overview.pdf",
            fileName: "999-Architecture_Overview.pdf",
            pageNumber: 7,
            chunkIndex: 3,
            text: "VaultMind implements a modular retrieval-augmented generation pipeline using TF-IDF and MongoDB.",
            score: 0.912,
        },
    ];

    const citations = buildCitations(mockChunks);

    assert.strictEqual(citations.length, 1);
    assert.strictEqual(citations[0].documentName, "Architecture_Overview.pdf");
    assert.strictEqual(citations[0].fileId, "file-99");
    assert.strictEqual(citations[0].pageNumber, 7);
    assert.strictEqual(citations[0].chunkIndex, 3);
    assert.strictEqual(citations[0].similarityScore, 0.912);
    assert.ok(citations[0].excerpt.startsWith("VaultMind implements a modular"));
});

// 6. Citations Truncate Long Excerpts
runTest("buildCitations cleanly truncates long excerpts to readable length", () => {
    const veryLongChunkText = "A".repeat(400);
    const mockChunks = [
        {
            fileId: "f1",
            originalName: "long.txt",
            text: veryLongChunkText,
            score: 0.5,
        },
    ];

    const citations = buildCitations(mockChunks);
    assert.strictEqual(citations.length, 1);
    assert.ok(citations[0].excerpt.length <= 200, "Excerpt must be capped at or under 200 chars");
    assert.ok(citations[0].excerpt.endsWith("..."));
});

// 7. No Fictional Citations on Empty Context
runTest("buildCitations returns empty array when no chunks were retrieved", () => {
    assert.deepStrictEqual(buildCitations([]), []);
    assert.deepStrictEqual(buildCitations(null), []);
    assert.deepStrictEqual(buildCitations(undefined), []);
});

// 8. Standardized Insufficient Context Fallback
runTest("ragConfig defines honest insufficient context fallback", () => {
    assert.strictEqual(
        ragConfig.INSUFFICIENT_CONTEXT_MESSAGE,
        "I couldn't find sufficient information in your uploaded documents to answer that question."
    );
});

console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===`);
if (failed > 0) {
    process.exit(1);
}
