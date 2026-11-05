import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isUninterpretableOrRandomName,
  cleanTags,
  generateSuggestedName,
} from '../lib/filenameUtils.ts';

describe('Frontend Filename & Tag Utilities Tests', () => {
  describe('isUninterpretableOrRandomName', () => {
    test('detects all user-reported uninterpretable and random filenames', () => {
      // 1. Long consonant mashing
      assert.strictEqual(
        isUninterpretableOrRandomName('Randomadkjwldlakkdl_wkl_dakldkwlkdakdkwdjajdkjehkf.webp'),
        true
      );
      // 2. Machine prefix with 32-char hex token
      assert.strictEqual(
        isUninterpretableOrRandomName('original-2092e7963a9052d637e726a7dacc22ac.webp'),
        true
      );
      // 3. Low unique character ratio / keyboard stutter
      assert.strictEqual(
        isUninterpretableOrRandomName('adwdadwdawdwdawd-photo.png'),
        true
      );
    });

    test('detects common camera, device, and UUID default filenames', () => {
      assert.strictEqual(isUninterpretableOrRandomName('IMG_20261105_214829.jpg'), true);
      assert.strictEqual(isUninterpretableOrRandomName('DSC_00912.png'), true);
      assert.strictEqual(isUninterpretableOrRandomName('dcim_8912389.jpeg'), true);
      assert.strictEqual(isUninterpretableOrRandomName('123e4567-e89b-12d3-a456-426614174000.pdf'), true);
    });

    test('preserves human-readable and meaningful filenames', () => {
      assert.strictEqual(isUninterpretableOrRandomName('gta 6 cover.jpg'), false);
      assert.strictEqual(isUninterpretableOrRandomName('Piyush_Resume_2026.docx'), false);
      assert.strictEqual(isUninterpretableOrRandomName('modern-kitchen-interior.png'), false);
      assert.strictEqual(isUninterpretableOrRandomName('sunset_beach_vacation.jpg'), false);
      assert.strictEqual(isUninterpretableOrRandomName('invoice_INV-9821.pdf'), false);
    });
  });

  describe('cleanTags', () => {
    test('rejects machine numbers, stopwords, hex fragments, and consonant spam', () => {
      const tags = [
        'photo',
        'image',
        'webp',
        'randomadkjwldlakkdl',
        'wkl',
        'original',
        'adwdadwdawdwdawd',
        '2092e7963a9052d637e726a7dacc22ac',
        'bedroom',
        'wallpaper',
      ];
      const cleaned = cleanTags(tags);
      assert.ok(!cleaned.includes('randomadkjwldlakkdl'));
      assert.ok(!cleaned.includes('wkl'));
      assert.ok(!cleaned.includes('original'));
      assert.ok(!cleaned.includes('adwdadwdawdwdawd'));
      assert.ok(!cleaned.includes('2092e7963a9052d637e726a7dacc22ac'));
      assert.ok(cleaned.includes('photo'));
      assert.ok(cleaned.includes('image'));
      assert.ok(cleaned.includes('bedroom'));
      assert.ok(cleaned.includes('wallpaper'));
    });
  });

  describe('generateSuggestedName', () => {
    test('suggests clean Photo name for images retaining extension', () => {
      const suggestion = generateSuggestedName('original-2092e7963a9052d637e726a7dacc22ac.webp', 'image/webp');
      assert.ok(suggestion.startsWith('Photo_'));
      assert.ok(suggestion.endsWith('.webp'));
    });

    test('suggests clean Document name for documents retaining extension', () => {
      const suggestion = generateSuggestedName('adkjwldlakd.pdf', 'application/pdf');
      assert.ok(suggestion.startsWith('Document_'));
      assert.ok(suggestion.endsWith('.pdf'));
    });
  });
});

