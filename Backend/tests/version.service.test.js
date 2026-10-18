const { test, describe } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const mongoose = require("mongoose");
const {
    computeContentHash,
    generateVersionStoragePath,
} = require("../services/version.service");

describe("Version Service Unit Tests", () => {
    describe("computeContentHash", () => {
        test("computes correct SHA-256 hex string for given buffer", () => {
            const buffer = Buffer.from("test document content for versioning");
            const expectedHash = crypto.createHash("sha256").update(buffer).digest("hex");

            const actualHash = computeContentHash(buffer);
            assert.strictEqual(actualHash, expectedHash);
            assert.strictEqual(actualHash.length, 64);
        });

        test("returns null when buffer is missing or invalid", () => {
            assert.strictEqual(computeContentHash(null), null);
            assert.strictEqual(computeContentHash(undefined), null);
            assert.strictEqual(computeContentHash("string-not-buffer"), null);
            assert.strictEqual(computeContentHash(12345), null);
        });
    });

    describe("generateVersionStoragePath", () => {
        test("generates expected namespaced path format", () => {
            const userId = "user_alpha_1";
            const fileId = "60c72b2f9b1d8b2bad000001";
            const versionNumber = 2;
            const originalName = "Quarterly Report Q3.pdf";

            const path = generateVersionStoragePath(userId, fileId, versionNumber, originalName);

            assert.ok(path.startsWith(`${userId}/versions/${fileId}/v2_`));
            assert.ok(path.includes("Quarterly_Report_Q3.pdf"));
        });

        test("strips path traversal attacks and dangerous sequences", () => {
            const userId = "user_alpha_1";
            const fileId = "60c72b2f9b1d8b2bad000001";
            const versionNumber = 3;
            const maliciousName = "../../../../../etc/passwd";

            const path = generateVersionStoragePath(userId, fileId, versionNumber, maliciousName);

            assert.strictEqual(path.includes(".."), false);
            assert.ok(path.startsWith(`${userId}/versions/${fileId}/v3_`));
            assert.ok(path.endsWith("-passwd"));
        });

        test("throws error if required identifiers are missing", () => {
            assert.throws(() => generateVersionStoragePath("", "fileId", 1, "test.pdf"));
            assert.throws(() => generateVersionStoragePath("userId", "", 1, "test.pdf"));
            assert.throws(() => generateVersionStoragePath("userId", "fileId", null, "test.pdf"));
        });
    });
});
