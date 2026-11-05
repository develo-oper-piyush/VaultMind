const test = require("node:test");
const assert = require("node:assert/strict");
const { isOcrSupported } = require("../services/ocrService");

test("isOcrSupported - identifies valid image and scanned document types", () => {
    // Valid image mimetypes
    assert.equal(isOcrSupported("image/png", "receipt.png"), true);
    assert.equal(isOcrSupported("image/jpeg", "photo.jpg"), true);
    assert.equal(isOcrSupported("image/webp", "scan.webp"), true);
    assert.equal(isOcrSupported("application/pdf", "invoice_scanned.pdf"), true);

    // Fallback by extension
    assert.equal(isOcrSupported("application/octet-stream", "document_scan.png"), true);
    assert.equal(isOcrSupported("application/octet-stream", "contract.pdf"), true);

    // Unsupported formats for visual OCR
    assert.equal(isOcrSupported("video/mp4", "movie.mp4"), false);
    assert.equal(isOcrSupported("audio/mpeg", "voice.mp3"), false);
    assert.equal(isOcrSupported("application/zip", "archive.zip"), false);
    assert.equal(isOcrSupported(null, ""), false);
});

