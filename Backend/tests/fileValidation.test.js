const { test, describe } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const {
    isValidObjectId,
    sanitizeFilename,
    validateStoragePath,
    assertFileOwnership,
} = require("../utils/fileValidation");

describe("fileValidation utility tests", () => {
    describe("isValidObjectId", () => {
        test("validates legitimate 24-character hex ObjectId", () => {
            const validId = new mongoose.Types.ObjectId().toString();
            assert.strictEqual(isValidObjectId(validId), true);
        });

        test("rejects malformed string length or characters", () => {
            assert.strictEqual(isValidObjectId("invalid-id"), false);
            assert.strictEqual(isValidObjectId("12345"), false);
            assert.strictEqual(isValidObjectId("507f191e810c19729de860ea_bad"), false);
            assert.strictEqual(isValidObjectId(null), false);
            assert.strictEqual(isValidObjectId(undefined), false);
            assert.strictEqual(isValidObjectId(123456), false);
        });
    });

    describe("sanitizeFilename", () => {
        test("strips path traversal sequences and slashes", () => {
            assert.strictEqual(sanitizeFilename("../../etc/passwd"), "passwd");
            assert.strictEqual(sanitizeFilename("C:\\Users\\admin\\file.pdf"), "file.pdf");
            assert.strictEqual(sanitizeFilename("../..\\secret.doc"), "secret.doc");
        });

        test("replaces special dangerous characters with underscores", () => {
            assert.strictEqual(sanitizeFilename("my report (1) [final]!.pdf"), "my_report__1___final__.pdf");
            assert.strictEqual(sanitizeFilename("test$file*name?.txt"), "test_file_name_.txt");
        });

        test("returns default for empty or missing input", () => {
            assert.strictEqual(sanitizeFilename(""), "unnamed_file");
            assert.strictEqual(sanitizeFilename(null), "unnamed_file");
            assert.strictEqual(sanitizeFilename(undefined), "unnamed_file");
        });
    });

    describe("validateStoragePath", () => {
        test("allows valid user-namespaced paths", () => {
            assert.strictEqual(validateStoragePath("user123", "user123/1234567-file.pdf"), true);
            assert.strictEqual(validateStoragePath("user123", "user123/versions/60c72b2f/v1_123-file.pdf"), true);
        });

        test("rejects directory traversal attempts", () => {
            assert.strictEqual(validateStoragePath("user123", "user123/../otherUser/file.pdf"), false);
            assert.strictEqual(validateStoragePath("user123", "user123/versions/../../secret.txt"), false);
        });

        test("rejects paths with backslashes or leading slashes", () => {
            assert.strictEqual(validateStoragePath("user123", "/user123/file.pdf"), false);
            assert.strictEqual(validateStoragePath("user123", "user123\\versions\\file.pdf"), false);
        });

        test("rejects paths belonging to different user", () => {
            assert.strictEqual(validateStoragePath("user123", "user999/file.pdf"), false);
            assert.strictEqual(validateStoragePath("user123", "other/versions/file.pdf"), false);
        });
    });

    describe("assertFileOwnership", () => {
        test("succeeds when userId matches fileDoc.userId", () => {
            const fileDoc = { _id: "f1", userId: "user123" };
            assert.doesNotThrow(() => assertFileOwnership(fileDoc, "user123"));
        });

        test("throws 404 when fileDoc is null or missing", () => {
            assert.throws(
                () => assertFileOwnership(null, "user123"),
                (err) => err.status === 404 && err.message === "File not found"
            );
        });

        test("throws 404 when userId does not match (prevents resource leak)", () => {
            const fileDoc = { _id: "f1", userId: "user123" };
            assert.throws(
                () => assertFileOwnership(fileDoc, "user456"),
                (err) => err.status === 404 && err.message === "File not found"
            );
        });
    });
});
