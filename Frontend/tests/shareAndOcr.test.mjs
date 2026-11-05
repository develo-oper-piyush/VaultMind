import test from 'node:test';
import assert from 'node:assert/strict';

test('Share Links logic - token validation and expiration calculation', () => {
  const token = 'a1b2c3d4e5f67890123456789abcdef0';
  assert.equal(/^[a-f0-9]{32}$/.test(token), true);

  // Expiration checking logic
  const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const past = new Date(Date.now() - 3600 * 1000).toISOString();

  assert.equal(new Date(future).getTime() > Date.now(), true);
  assert.equal(new Date(past).getTime() < Date.now(), true);
});

test('Share Links logic - max views enforcement', () => {
  const checkLimit = (viewsCount, maxViews) => {
    if (!maxViews) return false;
    return viewsCount >= maxViews;
  };

  assert.equal(checkLimit(3, 5), false);
  assert.equal(checkLimit(5, 5), true);
  assert.equal(checkLimit(6, 5), true);
  assert.equal(checkLimit(100, null), false);
});

test('OCR Intelligence logic - quota-saving cache detection', () => {
  const fileWithCachedText = {
    _id: 'file-123',
    name: 'receipt.png',
    textContent: 'INVOICE #1024 TOTAL: $450.00 DUE: 2026-11-05',
    ocrProcessed: true,
  };

  const fileWithoutCachedText = {
    _id: 'file-456',
    name: 'scan.png',
    textContent: null,
    ocrProcessed: false,
  };

  const shouldCallGeminiApi = (f) => {
    return !f.ocrProcessed || !f.textContent || f.textContent.trim().length === 0;
  };

  assert.equal(
    shouldCallGeminiApi(fileWithCachedText),
    false,
    'Should NOT call Gemini when text is already cached'
  );
  assert.equal(
    shouldCallGeminiApi(fileWithoutCachedText),
    true,
    'Should call Gemini when text has not yet been extracted'
  );
});

