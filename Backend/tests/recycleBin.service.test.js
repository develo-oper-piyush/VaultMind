const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
    DEFAULT_RETENTION_DAYS,
    calculateRetentionExpiry,
    resolveRestoreName,
} = require("../services/recycleBin.service");

describe("Recycle Bin Service Unit Tests", () => {
    describe("Retention Expiry Calculation", () => {
        test("defaults to 30 days retention window", () => {
            assert.strictEqual(DEFAULT_RETENTION_DAYS, 30);
        });

        test("calculates exact 30-day future timestamp", () => {
            const baseDate = new Date("2026-10-18T12:00:00.000Z");
            const expiry = calculateRetentionExpiry(baseDate, 30);

            const diffMs = expiry.getTime() - baseDate.getTime();
            const expectedMs = 30 * 24 * 60 * 60 * 1000;

            assert.strictEqual(diffMs, expectedMs);
            assert.strictEqual(expiry.toISOString(), "2026-11-17T12:00:00.000Z");
        });

        test("accepts custom retention days", () => {
            const baseDate = new Date("2026-10-18T00:00:00.000Z");
            const expiry = calculateRetentionExpiry(baseDate, 7);

            const diffMs = expiry.getTime() - baseDate.getTime();
            assert.strictEqual(diffMs, 7 * 24 * 60 * 60 * 1000);
            assert.strictEqual(expiry.toISOString(), "2026-10-25T00:00:00.000Z");
        });
    });

    describe("resolveRestoreName (Collision Resolution)", () => {
        test("returns original filename unchanged when no conflict exists", () => {
            const activeList = ["notes.txt", "invoice.pdf"];
            const resolved = resolveRestoreName("report.docx", activeList);
            assert.strictEqual(resolved, "report.docx");
        });

        test("appends (restored) when exact filename already exists in active workspace", () => {
            const activeList = ["resume.pdf", "data.csv"];
            const resolved = resolveRestoreName("resume.pdf", activeList);
            assert.strictEqual(resolved, "resume (restored).pdf");
        });

        test("increments counter when (restored) already exists", () => {
            const activeList = ["resume.pdf", "resume (restored).pdf", "data.csv"];
            const resolved = resolveRestoreName("resume.pdf", activeList);
            assert.strictEqual(resolved, "resume (restored 2).pdf");
        });

        test("handles files without extension", () => {
            const activeList = ["README", "LICENSE"];
            const resolved = resolveRestoreName("README", activeList);
            assert.strictEqual(resolved, "README (restored)");
        });

        test("handles files with multiple dots in filename", () => {
            const activeList = ["archive.tar.gz"];
            const resolved = resolveRestoreName("archive.tar.gz", activeList);
            assert.strictEqual(resolved, "archive.tar (restored).gz");
        });
    });
});
