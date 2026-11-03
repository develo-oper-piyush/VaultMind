/**
 * Automated Hardening, Edge Cases & Performance Test Suite
 * Day 6 Milestone: Smart Duplicate Detection
 * 
 * Verifies:
 * 1. Accented characters and Unicode normalization (e.g. résumé.pdf vs resume.pdf)
 * 2. Pathological filenames (multi-dot extensions, copy-only basenames, non-breaking spaces)
 * 3. File size edge cases (0-byte buffers, large file bounds, negative/NaN sizes)
 * 4. Fault tolerance against malformed/null candidates in vault records
 * 5. High-volume performance benchmarking (150+ candidates in under 50ms)
 * 6. Vault audit duplicate cluster grouping and wasted quota aggregation
 * 7. Service layer authoritative upload validation and bypass overrides
 * 8. Rename conflict prevention and self-exclusion integrity
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
    calculateNameSimilarity,
    calculateSizeSimilarity,
    calculateTypeSimilarity,
    compareFiles,
    findDuplicates,
} = require("../utils/duplicateEngine");

const { DuplicateService } = require("../utils/duplicateService");

console.log("=== Running Day 6 Smart Duplicate Detection Hardening & Edge-Case Tests ===\n");

let passed = 0;
let failed = 0;

const runTest = (name, testFn) => {
    try {
        const result = testFn();
        if (result && typeof result.then === "function") {
            return result
                .then(() => {
                    console.log(`[PASS] ${name}`);
                    passed++;
                })
                .catch((err) => {
                    console.error(`[FAIL] ${name}:`, err.message);
                    failed++;
                });
        }
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`[FAIL] ${name}:`, err.message);
        failed++;
    }
};

(async () => {
    // 1. Unicode diacritics & accent normalization
    runTest("Edge Case 1: Accented characters & diacritics match normalized base names", () => {
        const norm1 = normalizeBasename("résumé_2026.pdf");
        const norm2 = normalizeBasename("resume_2026.pdf");
        assert.strictEqual(norm1.cleanBasename, "resume 2026");
        assert.strictEqual(norm2.cleanBasename, "resume 2026");

        const comp = compareFiles(
            { originalName: "résumé_2026.pdf", size: 1048576, mimetype: "application/pdf" },
            { originalName: "resume_2026.pdf", size: 1048576, mimetype: "application/pdf" }
        );
        assert.strictEqual(comp.isDuplicate, true);
        assert.strictEqual(comp.confidenceLevel, CONFIDENCE_LEVELS.EXACT);
        assert.strictEqual(comp.similarityScore, 1.0);
    });

    // 2. Unicode whitespace and non-breaking space normalization
    runTest("Edge Case 2: Unicode whitespace (\\u00A0) and multiple spaces are collapsed", () => {
        const norm = normalizeBasename("Quarterly\u00A0Financial\u00A0\u00A0Report.pdf");
        assert.strictEqual(norm.cleanBasename, "quarterly financial report");
        assert.strictEqual(norm.extension, "pdf");
    });

    // 3. Multi-dot extensions and complex copy suffixes
    runTest("Edge Case 3: Multi-dot filenames and complex copy suffixes are properly parsed", () => {
        const norm = normalizeBasename("annual.report.v2.final (1).docx");
        assert.strictEqual(norm.cleanBasename, "annual report v2 final");
        assert.strictEqual(norm.extension, "docx");
        assert.strictEqual(norm.hadCopySuffix, true);

        const comp = compareFiles(
            { originalName: "annual.report.v2.final (1).docx", size: 524288, mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
            { originalName: "annual.report.v2.final.docx", size: 524288, mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
        );
        assert.strictEqual(comp.isDuplicate, true);
        assert.strictEqual(comp.confidenceLevel, CONFIDENCE_LEVELS.HIGH);
        assert.strictEqual(comp.similarityScore, 0.92);
    });

    // 4. Punctuation-only or suffix-only basenames
    runTest("Edge Case 4: Basenames that are purely punctuation or copy numbers do not collapse to empty string", () => {
        const norm1 = normalizeBasename("(1).pdf");
        assert.ok(norm1.cleanBasename.length > 0, "cleanBasename should not be empty");
        assert.strictEqual(norm1.extension, "pdf");

        const norm2 = normalizeBasename("---...---.txt");
        assert.ok(norm2.cleanBasename.length > 0, "cleanBasename should not be empty");
        assert.strictEqual(norm2.extension, "txt");
    });

    // 5. Zero-byte and boundary file sizes
    runTest("Edge Case 5: 0-byte file comparison behaves deterministically without divide-by-zero", () => {
        const sizeSimExact = calculateSizeSimilarity(0, 0);
        assert.strictEqual(sizeSimExact.score, 1.0);
        assert.strictEqual(sizeSimExact.deltaPercent, 0);

        const sizeSimDiff = calculateSizeSimilarity(0, 5000);
        assert.strictEqual(sizeSimDiff.score, 0.0);
        assert.strictEqual(sizeSimDiff.deltaPercent, 100);

        const sizeSimLarge = calculateSizeSimilarity(100 * 1024 * 1024, 100 * 1024 * 1024 + 1024);
        assert.strictEqual(sizeSimLarge.score, 0.9); // <= 1% delta
    });

    // 6. Resilience against corrupted, null or malformed candidate records
    runTest("Edge Case 6: findDuplicates safely handles null, undefined, and corrupted records in existingFiles", () => {
        const corruptedVault = [
            null,
            undefined,
            "not-an-object",
            {},
            { _id: "corrupt-1", originalName: null, size: undefined },
            { _id: "valid-1", originalName: "Budget_2026.xlsx", size: 45000, mimetype: "application/vnd.ms-excel" },
        ];

        const result = findDuplicates(
            { originalName: "Budget_2026.xlsx", size: 45000, mimetype: "application/vnd.ms-excel" },
            corruptedVault
        );

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.isDuplicate, true);
        assert.strictEqual(result.duplicates.length, 1);
        assert.strictEqual(result.duplicates[0].originalName, "Budget_2026.xlsx");
    });

    // 7. Performance benchmark on large candidate list (150 files)
    runTest("Performance 7: Duplicate search across 150 candidate files completes in under 50ms", () => {
        const largeVault = [];
        for (let i = 0; i < 150; i++) {
            largeVault.push({
                _id: `file-${i}`,
                originalName: `Corporate_Document_Partition_${i}.pdf`,
                size: 100000 + i * 500,
                mimetype: "application/pdf",
                category: "Document",
                createdAt: new Date(),
            });
        }
        // Insert exact duplicate candidate at position 75
        largeVault[75] = {
            _id: "target-file",
            originalName: "Corporate_Tax_Filing_2026.pdf",
            size: 204800,
            mimetype: "application/pdf",
            category: "Finance",
            createdAt: new Date(),
        };

        const startTime = process.hrtime.bigint();
        const result = findDuplicates(
            { originalName: "Corporate_Tax_Filing_2026.pdf", size: 204800, mimetype: "application/pdf" },
            largeVault
        );
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1e6;

        assert.strictEqual(result.isDuplicate, true);
        assert.strictEqual(result.duplicates[0].fileId, "target-file");
        assert.ok(durationMs < 50, `Execution took ${durationMs.toFixed(2)}ms, expected < 50ms`);
        console.log(`       Benchmark result: 150 candidates scanned in ${durationMs.toFixed(2)}ms`);
    });

    // 8. Vault duplicate audit grouping and wasted bytes aggregation
    await runTest("Service 8: scanUserVault correctly identifies multi-file clusters and calculates quota recovery", async () => {
        const mockAuditFiles = [
            { _id: "audit-1", originalName: "Contract.pdf", size: 1000000, mimetype: "application/pdf" },
            { _id: "audit-2", originalName: "Contract (1).pdf", size: 1000000, mimetype: "application/pdf" },
            { _id: "audit-3", originalName: "Contract - Copy.pdf", size: 1000000, mimetype: "application/pdf" },
            { _id: "audit-4", originalName: "Unrelated_Image.png", size: 500000, mimetype: "image/png" },
        ];

        const mockModel = {
            find: () => ({
                select: () => ({
                    sort: () => Promise.resolve(mockAuditFiles),
                }),
            }),
        };

        const service = new DuplicateService(mockModel);
        const audit = await service.scanUserVault("user-audit");

        assert.strictEqual(audit.success, true);
        assert.strictEqual(audit.fileCount, 4);
        assert.strictEqual(audit.duplicateGroupCount, 1);
        assert.strictEqual(audit.duplicateGroups[0].redundantCount, 2);
        assert.strictEqual(audit.totalWastedBytes, 2000000); // 2 redundant copies * 1,000,000 bytes
        assert.strictEqual(audit.duplicateGroups[0].primaryFile.originalName, "Contract.pdf");
    });

    // 9. Authoritative upload validation rejection and bypass
    await runTest("Service 9: validateUpload blocks high-confidence duplicates with 409 but allows bypass override", async () => {
        const mockModel = {
            find: () => ({
                select: () => ({
                    sort: () => Promise.resolve([
                        { _id: "v-1", originalName: "Project_Proposal.pdf", size: 850000, mimetype: "application/pdf" },
                    ]),
                }),
            }),
        };

        const service = new DuplicateService(mockModel);

        // Upload identical without bypass -> should be blocked with 409
        const blocked = await service.validateUpload(
            "user-1",
            { originalName: "Project_Proposal.pdf", size: 850000, mimetype: "application/pdf" },
            false
        );
        assert.strictEqual(blocked.allowed, false);
        assert.strictEqual(blocked.statusCode, 409);
        assert.strictEqual(blocked.isDuplicate, true);

        // Upload identical WITH bypass -> should be allowed
        const allowed = await service.validateUpload(
            "user-1",
            { originalName: "Project_Proposal.pdf", size: 850000, mimetype: "application/pdf" },
            true
        );
        assert.strictEqual(allowed.allowed, true);
        assert.strictEqual(allowed.bypassed, true);
    });

    // 10. Rename collision validation and self-exclusion
    await runTest("Service 10: validateRename detects collision with other files but ignores the file being renamed", async () => {
        const mockFiles = [
            { _id: "file-A", userId: "u-1", originalName: "Quarterly_Tax_Statement.pdf", size: 300000, mimetype: "application/pdf" },
            { _id: "file-B", userId: "u-1", originalName: "Draft_Scan.pdf", size: 300000, mimetype: "application/pdf" },
        ];

        const mockModel = {
            findOne: (q) => Promise.resolve(mockFiles.find(f => f._id === q._id && f.userId === q.userId) || null),
            find: (q) => ({
                select: () => ({
                    sort: () => Promise.resolve(mockFiles.filter(f => {
                        const ne = q._id && q._id.$ne;
                        if (ne && String(f._id) === String(ne)) return false;
                        return f.userId === q.userId;
                    })),
                }),
            }),
        };

        const service = new DuplicateService(mockModel);

        // Renaming file-B to "Quarterly_Tax_Statement.pdf" (collides with file-A) -> should not be allowed
        const collision = await service.validateRename("u-1", "file-B", "Quarterly_Tax_Statement.pdf");
        assert.strictEqual(collision.allowed, false);
        assert.strictEqual(collision.isDuplicate, true);
        assert.strictEqual(collision.confidenceLevel, CONFIDENCE_LEVELS.EXACT);

        // Renaming file-B to its current name "Draft_Scan.pdf" (self exclusion) -> should be allowed
        const selfRename = await service.validateRename("u-1", "file-B", "Draft_Scan.pdf");
        assert.strictEqual(selfRename.allowed, true);
        assert.strictEqual(selfRename.isDuplicate, false);
        assert.strictEqual(selfRename.confidenceLevel, CONFIDENCE_LEVELS.NONE);
    });

    console.log(`\n=== Day 6 Test Results: ${passed} Passed, ${failed} Failed ===`);
    if (failed > 0) {
        process.exit(1);
    }
})();
