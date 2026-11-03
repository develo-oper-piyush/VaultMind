/**
 * Unit Tests for Day 2: Smart Duplicate Detection Engine
 * 
 * Verifies normalization, Levenshtein ratio, token Jaccard similarity,
 * size delta scoring, type matching, weighted confidence, and test cases TC-01 through TC-12.
 */
const assert = require("assert");
const {
    WEIGHTS,
    THRESHOLDS,
    CONFIDENCE_LEVELS,
    formatBytes,
    stripCopySuffix,
    normalizeBasename,
    normalizeExtension,
    levenshteinDistance,
    calculateLevenshteinRatio,
    calculateJaccardSimilarity,
    calculateNameSimilarity,
    calculateSizeSimilarity,
    calculateTypeSimilarity,
    compareFiles,
    findDuplicates,
} = require("../utils/duplicateEngine");

console.log("=== Running Day 2 Smart Duplicate Matching Engine Tests ===");

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

// 1. Basename & copy suffix normalization
runTest("stripCopySuffix removes '(1)', ' - Copy', and '_copy' variations", () => {
    assert.strictEqual(stripCopySuffix("Invoice (1)").cleanName, "Invoice");
    assert.strictEqual(stripCopySuffix("Invoice (1)").hadCopySuffix, true);
    assert.strictEqual(stripCopySuffix("Report - Copy").cleanName, "Report");
    assert.strictEqual(stripCopySuffix("Report - Copy").hadCopySuffix, true);
    assert.strictEqual(stripCopySuffix("document_copy2").cleanName, "document");
    assert.strictEqual(stripCopySuffix("document_copy2").hadCopySuffix, true);
    assert.strictEqual(stripCopySuffix("Quarterly_Report (1)").cleanName, "Quarterly_Report");
    assert.strictEqual(stripCopySuffix("Regular_File").cleanName, "Regular_File");
    assert.strictEqual(stripCopySuffix("Regular_File").hadCopySuffix, false);
});

// 2. normalizeBasename trims, lowercases, cleans separators, and extracts ext
runTest("normalizeBasename correctly normalizes whitespace, separators and extensions", () => {
    const norm = normalizeBasename("  Annual_Financial-Report (2).PDF  ");
    assert.strictEqual(norm.cleanBasename, "annual financial report");
    assert.strictEqual(norm.extension, "pdf");
    assert.strictEqual(norm.hadCopySuffix, true);

    const norm2 = normalizeBasename("notes.txt");
    assert.strictEqual(norm2.cleanBasename, "notes");
    assert.strictEqual(norm2.extension, "txt");
    assert.strictEqual(norm2.hadCopySuffix, false);
});

// 3. Levenshtein distance and normalized ratio calculation
runTest("levenshteinDistance and calculateLevenshteinRatio accurately measure string distance", () => {
    assert.strictEqual(levenshteinDistance("kitten", "sitting"), 3);
    assert.strictEqual(levenshteinDistance("same", "same"), 0);
    assert.strictEqual(calculateLevenshteinRatio("same", "same"), 1.0);
    assert.strictEqual(calculateLevenshteinRatio("", ""), 1.0);
    assert.strictEqual(calculateLevenshteinRatio("a", ""), 0.0);

    // minor spelling: resume_john_doe vs resume_jon_doe (dist = 1, maxLen = 15)
    const ratio = calculateLevenshteinRatio("resume_john_doe", "resume_jon_doe");
    assert.ok(ratio >= 0.90, `Expected ratio >= 0.90, got ${ratio}`);
});

// 4. Token Jaccard similarity
runTest("calculateJaccardSimilarity computes token set intersection over union", () => {
    const sim1 = calculateJaccardSimilarity("financial report 2026", "report financial 2026");
    assert.strictEqual(sim1, 1.0);

    const sim2 = calculateJaccardSimilarity("annual report q1", "annual report q2");
    // intersection: {annual, report} = 2, union: {annual, report, q1, q2} = 4 => 0.5
    assert.strictEqual(sim2, 0.5);

    const sim3 = calculateJaccardSimilarity("budget spreadsheet", "vacation photos");
    assert.strictEqual(sim3, 0.0);
});

// 5. Size similarity scoring & delta percentage
runTest("calculateSizeSimilarity scores exact sizes 1.0, <=1% 0.9, <=5% 0.7, >10% 0.0", () => {
    // Exact match
    const exact = calculateSizeSimilarity(1048576, 1048576);
    assert.strictEqual(exact.score, 1.0);
    assert.strictEqual(exact.deltaPercent, 0);

    // Within 1% (1,000,000 vs 1,005,000 = 0.5%)
    const within1 = calculateSizeSimilarity(1000000, 1005000);
    assert.strictEqual(within1.score, 0.9);

    // Within 5% (1,000,000 vs 1,040,000 = 3.8%)
    const within5 = calculateSizeSimilarity(1000000, 1040000);
    assert.strictEqual(within5.score, 0.7);

    // Completely different (>10%)
    const far = calculateSizeSimilarity(1000, 500000);
    assert.strictEqual(far.score, 0.0);
});

// 6. Type similarity scoring
runTest("calculateTypeSimilarity scores exact match 1.0, alias 1.0, same media group 0.6, different 0.0", () => {
    const exact = calculateTypeSimilarity(
        { originalName: "doc.pdf", mimetype: "application/pdf" },
        { originalName: "other.pdf", mimetype: "application/pdf" }
    );
    assert.strictEqual(exact.score, 1.0);

    // Canonical alias: jpeg vs jpg
    const alias = calculateTypeSimilarity(
        { originalName: "photo.jpeg", mimetype: "image/jpeg" },
        { originalName: "photo.jpg", mimetype: "image/jpeg" }
    );
    assert.strictEqual(alias.score, 1.0);

    // Same media group: png vs jpg
    const sameGroup = calculateTypeSimilarity(
        { originalName: "photo.png", mimetype: "image/png" },
        { originalName: "picture.jpg", mimetype: "image/jpeg" }
    );
    assert.strictEqual(sameGroup.score, 0.6);

    // Completely different: pdf vs png
    const diff = calculateTypeSimilarity(
        { originalName: "report.pdf", mimetype: "application/pdf" },
        { originalName: "avatar.png", mimetype: "image/png" }
    );
    assert.strictEqual(diff.score, 0.0);
});

// 7. TC-01: Exact identical record
runTest("TC-01: Exact identical record returns Score >= 0.95 and EXACT confidence", () => {
    const incoming = {
        originalName: "Project_Proposal.pdf",
        size: 524288,
        mimetype: "application/pdf",
    };
    const existing = [
        {
            _id: "file-01",
            originalName: "Project_Proposal.pdf",
            size: 524288,
            mimetype: "application/pdf",
            category: "Report",
        },
    ];

    const result = findDuplicates(incoming, existing);
    assert.strictEqual(result.isDuplicate, true);
    assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.EXACT);
    assert.ok(result.highestScore >= 0.95);
    assert.strictEqual(result.duplicates.length, 1);
    assert.ok(result.duplicates[0].reasons.some((r) => r.includes("Exact byte size match")));
    assert.ok(result.duplicates[0].reasons.some((r) => r.includes("Identical filename")));
});

// 8. TC-02: Different capitalization
runTest("TC-02: Different capitalization matches as EXACT duplicate", () => {
    const incoming = {
        originalName: "PROJECT_PLAN.PDF",
        size: 204800,
        mimetype: "application/pdf",
    };
    const existing = [
        {
            _id: "file-02",
            originalName: "project_plan.pdf",
            size: 204800,
            mimetype: "application/pdf",
        },
    ];

    const result = findDuplicates(incoming, existing);
    assert.strictEqual(result.isDuplicate, true);
    assert.ok(result.highestScore >= 0.95);
    assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.EXACT);
});

// 9. TC-03: Leading/trailing/repeated whitespace
runTest("TC-03: Whitespace variations normalize and match as EXACT duplicate", () => {
    const incoming = {
        originalName: "  annual_report.docx  ",
        size: 153600,
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const existing = [
        {
            _id: "file-03",
            originalName: "annual report.docx",
            size: 153600,
            mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
    ];

    const result = findDuplicates(incoming, existing);
    assert.strictEqual(result.isDuplicate, true);
    assert.ok(result.highestScore >= 0.95);
});

// 10. TC-04: Duplicate copy suffixes
runTest("TC-04: Duplicate copy suffixes '(1)' and '- Copy' match with HIGH confidence", () => {
    const incoming = {
        originalName: "Invoice (1).pdf",
        size: 81920,
        mimetype: "application/pdf",
    };
    const existing = [
        {
            _id: "file-04",
            originalName: "Invoice.pdf",
            size: 81920,
            mimetype: "application/pdf",
            category: "Invoice",
        },
    ];

    const result = findDuplicates(incoming, existing);
    assert.strictEqual(result.isDuplicate, true);
    assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.HIGH);
    assert.ok(result.highestScore >= 0.90, `Expected score >= 0.90, got ${result.highestScore}`);
    assert.ok(result.duplicates[0].reasons.some((r) => r.includes("stripping copy suffixes")));
});

// 11. TC-05: Minor spelling variation
runTest("TC-05: Minor spelling variation matches with Levenshtein ratio >= 0.90 and flags duplicate", () => {
    const incoming = {
        originalName: "resume_john_doe.pdf",
        size: 120000,
        mimetype: "application/pdf",
    };
    const existing = [
        {
            _id: "file-05",
            originalName: "resume_jon_doe.pdf",
            size: 120000,
            mimetype: "application/pdf",
            category: "Resume",
        },
    ];

    const result = findDuplicates(incoming, existing);
    assert.strictEqual(result.isDuplicate, true);
    assert.ok(result.highestScore >= 0.80);
    assert.ok(result.duplicates[0].metrics.levenshteinRatio >= 0.90);
    assert.ok(result.duplicates[0].reasons.some((r) => r.includes("spelling variations")));
});

// 12. TC-06: Same size, completely different name
runTest("TC-06: Same size but completely different filename is NOT flagged as duplicate", () => {
    const incoming = {
        originalName: "budget.xlsx",
        size: 15360,
        mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const existing = [
        {
            _id: "file-06",
            originalName: "avatar.png",
            size: 15360,
            mimetype: "image/png",
        },
    ];

    const result = findDuplicates(incoming, existing);
    assert.strictEqual(result.isDuplicate, false);
    assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.NONE);
    assert.ok(result.highestScore < 0.45, `Expected score < 0.45, got ${result.highestScore}`);
    assert.strictEqual(result.duplicates.length, 0);
});

// 13. TC-07: Same name, completely different size
runTest("TC-07: Same name but completely different size yields MODERATE score, not exact", () => {
    const incoming = {
        originalName: "notes.txt",
        size: 1024, // 1KB
        mimetype: "text/plain",
    };
    const existing = [
        {
            _id: "file-07",
            originalName: "notes.txt",
            size: 512000, // 500KB
            mimetype: "text/plain",
        },
    ];

    const result = findDuplicates(incoming, existing);
    assert.strictEqual(result.isDuplicate, true);
    assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.MODERATE);
    assert.ok(result.highestScore >= 0.65 && result.highestScore < 0.80);
});

// 14. TC-08: Missing optional fields
runTest("TC-08: Missing or null mimetype defaults gracefully to extension parser without crashing", () => {
    const incoming = {
        originalName: "contract.pdf",
        size: 100000,
        mimetype: null,
    };
    const existing = [
        {
            _id: "file-08",
            originalName: "contract.pdf",
            size: 100000,
            mimetype: undefined,
        },
    ];

    const result = findDuplicates(incoming, existing);
    assert.strictEqual(result.isDuplicate, true);
    assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.EXACT);
    assert.ok(result.highestScore >= 0.95);
});

// 15. TC-09: Empty or invalid submission
runTest("TC-09: Empty originalName or negative size returns safe validation failure", () => {
    const invalidName = findDuplicates({ originalName: "", size: 1000 }, []);
    assert.strictEqual(invalidName.success, false);
    assert.strictEqual(invalidName.isDuplicate, false);

    const negativeSize = findDuplicates({ originalName: "file.pdf", size: -1 }, []);
    assert.strictEqual(negativeSize.success, false);
    assert.strictEqual(negativeSize.isDuplicate, false);
});

// 16. TC-10: Exclude self during update/rename
runTest("TC-10: Excludes target file ID when checking for duplicates during rename", () => {
    const incoming = {
        originalName: "my_document.pdf",
        size: 50000,
        mimetype: "application/pdf",
    };
    const existing = [
        {
            _id: "file-self-123",
            originalName: "my_document.pdf",
            size: 50000,
            mimetype: "application/pdf",
        },
    ];

    const result = findDuplicates(incoming, existing, { excludeFileId: "file-self-123" });
    assert.strictEqual(result.isDuplicate, false);
    assert.strictEqual(result.duplicates.length, 0);
});

// 17. TC-12: Empty dataset
runTest("TC-12: Brand new user with 0 files returns isDuplicate: false immediately", () => {
    const incoming = {
        originalName: "first_upload.pdf",
        size: 50000,
        mimetype: "application/pdf",
    };

    const result = findDuplicates(incoming, []);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isDuplicate, false);
    assert.strictEqual(result.confidenceLevel, CONFIDENCE_LEVELS.NONE);
    assert.strictEqual(result.duplicates.length, 0);
});

// 18. formatBytes helper
runTest("formatBytes converts raw byte quantities accurately", () => {
    assert.strictEqual(formatBytes(0), "0 Bytes");
    assert.strictEqual(formatBytes(1024), "1 KB");
    assert.strictEqual(formatBytes(1048576), "1 MB");
});

console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===`);
if (failed > 0) {
    process.exit(1);
}
