/**
 * Unit & Integration Tests for Day 2: File Upload Validation
 */
const assert = require("assert");
const {
    validateUploadFile,
    sanitizeFilename,
    MAX_FILE_SIZE,
} = require("../utils/fileValidator");

console.log("=== Running Day 2 File Upload Validation Tests ===");

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

// 1. Missing file check
runTest("Reject missing file object", () => {
    const result = validateUploadFile(null);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /no file was provided/i);
});

// 2. Empty file (0 bytes) check
runTest("Reject empty 0-byte file buffer", () => {
    const emptyFile = {
        name: "empty.pdf",
        data: Buffer.alloc(0),
        size: 0,
        mimetype: "application/pdf",
    };
    const result = validateUploadFile(emptyFile);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /empty/i);
});

// 3. Oversized file (> 5MB)
runTest("Reject oversized file exceeding 5MB limit", () => {
    const bigFile = {
        name: "huge.pdf",
        data: Buffer.alloc(10),
        size: MAX_FILE_SIZE + 1,
        mimetype: "application/pdf",
    };
    const result = validateUploadFile(bigFile);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /exceeds the limit/i);
});

// 4. Dangerous executable files rejection
runTest("Reject dangerous file extensions (.exe, .sh, .bat)", () => {
    const dangerousFiles = [
        { name: "malware.exe", size: 100, data: Buffer.from("test"), mimetype: "application/x-msdownload" },
        { name: "script.sh", size: 50, data: Buffer.from("echo hi"), mimetype: "application/x-sh" },
        { name: "run.bat", size: 50, data: Buffer.from("@echo off"), mimetype: "application/x-bat" },
    ];

    dangerousFiles.forEach((file) => {
        const result = validateUploadFile(file);
        assert.strictEqual(result.valid, false);
        assert.match(result.error, /not permitted for security/i);
    });
});

// 5. Path traversal attack rejection
runTest("Reject filenames with directory traversal attempts", () => {
    const traversalFiles = [
        { name: "../../../etc/passwd", size: 100, data: Buffer.from("data"), mimetype: "text/plain" },
        { name: "..\\secret.txt", size: 100, data: Buffer.from("data"), mimetype: "text/plain" },
        { name: "sub/folder/file.pdf", size: 100, data: Buffer.from("data"), mimetype: "application/pdf" },
    ];

    traversalFiles.forEach((file) => {
        const result = validateUploadFile(file);
        assert.strictEqual(result.valid, false);
        assert.match(result.error, /path traversal/i);
    });
});

// 6. Filename sanitization
runTest("Sanitize unsafe filename characters", () => {
    const sanitized = sanitizeFilename("My Report #1 (Draft) [Final]!.pdf");
    assert.strictEqual(sanitized, "My_Report__1__Draft___Final__.pdf");
});

// 7. Valid PDF upload acceptance
runTest("Accept valid PDF document", () => {
    const validPdf = {
        name: "Quarterly_Financial_Report.pdf",
        data: Buffer.from("%PDF-1.4 test document content"),
        size: 1024,
        mimetype: "application/pdf",
    };
    const result = validateUploadFile(validPdf);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.isDocument, true);
    assert.strictEqual(result.extension, ".pdf");
});

// 8. Valid DOCX upload acceptance
runTest("Accept valid DOCX document", () => {
    const validDocx = {
        name: "Project_Proposal.docx",
        data: Buffer.from("PK zip archive content for docx"),
        size: 4096,
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const result = validateUploadFile(validDocx);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.isDocument, true);
    assert.strictEqual(result.extension, ".docx");
});

// 9. Valid TXT upload acceptance
runTest("Accept valid TXT document", () => {
    const validTxt = {
        name: "meeting_notes.txt",
        data: Buffer.from("Meeting notes from project sprint"),
        size: 250,
        mimetype: "text/plain",
    };
    const result = validateUploadFile(validTxt);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.isDocument, true);
    assert.strictEqual(result.extension, ".txt");
});

console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===`);
if (failed > 0) {
    process.exit(1);
}
