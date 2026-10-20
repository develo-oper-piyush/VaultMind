/**
 * Automated Unit Tests for Day 4: Document Indexing & Relevant-Chunk Retrieval
 */
const assert = require("assert");
const {
    tokenize,
    cosineSimilarity,
    rankChunks,
} = require("../utils/retrievalEngine");

console.log("=== Running Day 4 Document Indexing & Retrieval Tests ===");

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

// 1. Tokenization with stop-word stripping
runTest("tokenize strips conversational stop-words, punctuation, and short tokens", () => {
    const query = "What is the total quarterly revenue and profit margin for VaultMind in 2026?";
    const tokens = tokenize(query);

    assert.ok(tokens.includes("total"));
    assert.ok(tokens.includes("quarterly"));
    assert.ok(tokens.includes("revenue"));
    assert.ok(tokens.includes("profit"));
    assert.ok(tokens.includes("margin"));
    assert.ok(tokens.includes("vaultmind"));
    assert.ok(tokens.includes("2026"));
    assert.strictEqual(tokens.includes("what"), false);
    assert.strictEqual(tokens.includes("is"), false);
    assert.strictEqual(tokens.includes("the"), false);
    assert.strictEqual(tokens.includes("and"), false);
    assert.strictEqual(tokens.includes("for"), false);
    assert.strictEqual(tokens.includes("in"), false);
});

// 2. Cosine Similarity Calculation
runTest("cosineSimilarity correctly computes vector similarities", () => {
    const vecA = { revenue: 0.8, profit: 0.6 };
    const vecB = { revenue: 0.8, profit: 0.6 };
    const vecC = { architecture: 0.9, database: 0.4 };

    // Identical vectors should have similarity 1.0
    const simIdentical = cosineSimilarity(vecA, vecB);
    assert.ok(Math.abs(simIdentical - 1.0) < 0.0001);

    // Completely orthogonal vectors should have similarity 0.0
    const simOrthogonal = cosineSimilarity(vecA, vecC);
    assert.strictEqual(simOrthogonal, 0);
});

// 3. Retrieval Relevance Ranking
runTest("rankChunks ranks the most semantically relevant chunk highest", () => {
    const chunks = [
        {
            _id: "chunk-1",
            fileId: "file-1",
            fileName: "employee-handbook.pdf",
            originalName: "Employee_Handbook.pdf",
            chunkIndex: 0,
            text: "Employee leave policies and annual vacation days are administered through HR management.",
            pageNumber: 3,
            keywords: ["leave", "vacation", "employee", "handbook"],
        },
        {
            _id: "chunk-2",
            fileId: "file-2",
            fileName: "q3-financial-report.pdf",
            originalName: "Q3_Financial_Report.pdf",
            chunkIndex: 1,
            text: "In Q3 2026, VaultMind recorded total quarterly revenue of $4.2 million, representing 32% year-over-year revenue growth.",
            pageNumber: 2,
            keywords: ["revenue", "quarterly", "financial", "growth"],
        },
        {
            _id: "chunk-3",
            fileId: "file-3",
            fileName: "tech-architecture.md",
            originalName: "Tech_Architecture.md",
            chunkIndex: 0,
            text: "Backend infrastructure runs Node.js with MongoDB Atlas for persistent metadata storage and Supabase for bucket uploads.",
            pageNumber: 1,
            keywords: ["backend", "mongodb", "supabase", "infrastructure"],
        },
    ];

    const results = rankChunks(chunks, "What was the quarterly revenue growth in Q3?", { topK: 3, minScore: 0.05 });

    assert.ok(results.length > 0, "Should retrieve matching chunks");
    assert.strictEqual(results[0]._id, "chunk-2", "Financial report chunk should rank first");
    assert.ok(results[0].score > 0.3, "Financial chunk should have a strong relevance score");
    assert.strictEqual(results[0].pageNumber, 2);
});

// 4. Exact Phrase Boost
runTest("rankChunks boosts chunks with exact phrase matches", () => {
    const chunks = [
        {
            _id: "chunk-a",
            fileName: "docA.txt",
            originalName: "docA.txt",
            chunkIndex: 0,
            text: "This document mentions neural network training parameters and optimization procedures.",
            keywords: ["neural", "network"],
        },
        {
            _id: "chunk-b",
            fileName: "docB.txt",
            originalName: "docB.txt",
            chunkIndex: 0,
            text: "VaultMind implements neural network training parameters with gradient descent.",
            keywords: ["vaultmind", "neural", "network"],
        },
    ];

    const query = "neural network training parameters";
    const results = rankChunks(chunks, query, { topK: 2 });

    assert.ok(results.length >= 2);
    // Both chunks have the exact phrase, both get phrase boost
    assert.ok(results[0].score >= 0.35);
});

// 5. Keyword & Filename Boosting
runTest("rankChunks applies filename and keyword boosting", () => {
    const chunks = [
        {
            _id: "chunk-generic",
            fileName: "random_notes.txt",
            originalName: "random_notes.txt",
            chunkIndex: 0,
            text: "Details regarding the contract agreement are stated below.",
            keywords: ["agreement"],
        },
        {
            _id: "chunk-contract",
            fileName: "vendor_master_contract.pdf",
            originalName: "Vendor_Master_Contract.pdf",
            chunkIndex: 0,
            text: "Details regarding the service agreement are stated below.",
            keywords: ["contract", "vendor", "agreement"],
        },
    ];

    const results = rankChunks(chunks, "vendor contract", { topK: 2 });
    assert.strictEqual(results[0]._id, "chunk-contract");
});

// 6. Minimum Score Thresholding
runTest("rankChunks filters out completely unrelated chunks below minScore", () => {
    const chunks = [
        {
            _id: "chunk-unrelated",
            fileName: "recipes.txt",
            originalName: "recipes.txt",
            chunkIndex: 0,
            text: "Chocolate chip cookie recipe requires butter, flour, sugar, and baking powder.",
            keywords: ["cookie", "recipe", "baking"],
        },
    ];

    const results = rankChunks(chunks, "database cluster connection string", { minScore: 0.1 });
    assert.strictEqual(results.length, 0, "Unrelated chunk should be excluded below score threshold");
});

// 7. Top-K Limitation
runTest("rankChunks strictly respects topK parameter", () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({
        _id: `chunk-${i}`,
        fileName: `file-${i}.txt`,
        originalName: `file-${i}.txt`,
        chunkIndex: i,
        text: `VaultMind cloud storage document index ${i} discussing retrieval algorithms.`,
        keywords: ["vaultmind", "storage"],
    }));

    const results = rankChunks(chunks, "VaultMind cloud storage", { topK: 3 });
    assert.strictEqual(results.length, 3, "Results must be capped at topK = 3");
});

// 8. Document-Level Filtering Simulation
runTest("Document-level filtering isolates chunks to target file IDs", () => {
    const allUserChunks = [
        { _id: "c1", fileId: "file-A", text: "Alpha project roadmap notes.", keywords: ["alpha", "roadmap"] },
        { _id: "c2", fileId: "file-B", text: "Beta project security audit.", keywords: ["beta", "security"] },
        { _id: "c3", fileId: "file-A", text: "Alpha project release dates.", keywords: ["alpha", "release"] },
    ];

    // Filter to only file-A
    const fileFilters = ["file-A"];
    const filteredChunks = allUserChunks.filter((c) => fileFilters.includes(c.fileId));

    const results = rankChunks(filteredChunks, "security audit", { minScore: 0.05 });
    // Should NOT find file-B because it was filtered out
    assert.strictEqual(results.length, 0);

    const alphaResults = rankChunks(filteredChunks, "roadmap", { minScore: 0.05 });
    assert.strictEqual(alphaResults.length, 1);
    assert.strictEqual(alphaResults[0]._id, "c1");
});

// 9. Empty / Whitespace Query Handling
runTest("rankChunks safely returns empty array on empty or whitespace queries", () => {
    const chunks = [{ _id: "c1", text: "Sample document text", keywords: [] }];
    assert.deepStrictEqual(rankChunks(chunks, ""), []);
    assert.deepStrictEqual(rankChunks(chunks, "   "), []);
    assert.deepStrictEqual(rankChunks(null, "query"), []);
});

console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===`);
if (failed > 0) {
    process.exit(1);
}
