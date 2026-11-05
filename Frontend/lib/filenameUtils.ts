/**
 * Filename & Tag Sanitization Utilities
 * Detects machine-generated, random, or gibberish filenames
 * and provides smart, clean rename suggestions before uploading to the drive.
 */

const STOPWORD_TAGS = new Set([
  'original',
  'upload',
  'temp',
  'file',
  'asset',
  'document-file',
  'untitled',
  'image-file',
  'photo-file',
]);

/**
 * Detects whether a filename is random, machine-generated, or uninterpretable gibberish
 * (e.g. "Randomadkjwldlakkdl_wkl_dakldk...", "original-2092e7963a9052d637e726a7dacc22ac.webp",
 * "adwdadwdawdwdawd-photo.png", "IMG_20261105_214829.jpg", "a7459f7152e94a664631")
 */
export function isUninterpretableOrRandomName(fileName: string): boolean {
  if (!fileName) return true;
  const baseName = fileName.replace(/\.[^/.]+$/, '').trim();
  if (baseName.length < 2) return true;

  // 1. Camera / Device / UUID / Hex / Timestamp / Machine prefixes
  const machinePattern = /^(img|dsc|dcim|pxl|wp|vid|aud|rec|screenshot|capture|upload|image|photo|original)[_ -]?\d+/i;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hexPattern = /^[0-9a-f]{10,}$/i;
  const timestampPattern = /^\d{10,}$/;

  if (machinePattern.test(baseName) || uuidPattern.test(baseName) || hexPattern.test(baseName) || timestampPattern.test(baseName)) {
    return true;
  }

  // 2. Token-level analysis
  const tokens = baseName.split(/[-_\s.]+/).filter((t) => t.length > 0);

  for (const token of tokens) {
    // Hex / hash token check (e.g. 2092e7963a9052d637e726a7dacc22ac)
    if (token.length >= 8 && /^[0-9a-f]+$/i.test(token) && /\d/.test(token) && /[a-f]/i.test(token)) {
      return true;
    }

    const lettersOnly = token.toLowerCase().replace(/[^a-z]/g, '');
    if (lettersOnly.length >= 8) {
      // Unique character ratio check (keyboard mashing e.g. "adwdadwdawdwdawd" has 3 unique chars / 16 = 0.18)
      const uniqueChars = new Set(lettersOnly).size;
      const uniqueRatio = uniqueChars / lettersOnly.length;
      if (uniqueRatio < 0.38) {
        return true;
      }
    }

    if (lettersOnly.length >= 6) {
      // 5+ consecutive consonants (e.g. "kjwldl", "kldkwlk")
      if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(lettersOnly)) {
        return true;
      }
      // Vowel ratio check: typical English words have 20% - 75% vowels
      const vowels = (lettersOnly.match(/[aeiouy]/g) || []).length;
      const ratio = vowels / lettersOnly.length;
      if (ratio < 0.16 || ratio > 0.85) {
        return true;
      }
    } else if (lettersOnly.length >= 3) {
      // 3-5 character token with 0 vowels (e.g. "wkl", "zxc", "dfg")
      const vowels = (lettersOnly.match(/[aeiouy]/g) || []).length;
      if (vowels === 0) {
        return true;
      }
    }
  }

  // Single unbroken token exceeding 18 chars without recognized separators
  if (tokens.length === 1 && baseName.length >= 18) {
    return true;
  }

  return false;
}

/**
 * Strict Tag Sanitizer:
 * Rejects gibberish words, machine hashes, or consonant spam from becoming tags
 */
export function cleanTags(tags: string[] = []): string[] {
  if (!Array.isArray(tags)) return ['asset', 'document'];
  const validTags: string[] = [];

  for (const raw of tags) {
    if (!raw || typeof raw !== 'string') continue;
    const tag = raw.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');

    if (tag.length < 2 || tag.length > 22) continue;
    if (/^\d+$/.test(tag) || /^[0-9a-f]{8,}$/i.test(tag)) continue;
    if (STOPWORD_TAGS.has(tag)) continue;

    // Reject if the tag itself is gibberish or random
    if (isUninterpretableOrRandomName(tag)) continue;

    validTags.push(tag);
  }

  if (validTags.length === 0) {
    return ['asset', 'photo'];
  }

  return Array.from(new Set(validTags)).slice(0, 5);
}

/**
 * Generates a clean, friendly default suggested name for a file
 */
export function generateSuggestedName(originalFileName: string, mimeType?: string): string {
  const lastDot = originalFileName.lastIndexOf('.');
  const ext = lastDot > 0 ? originalFileName.substring(lastDot).toLowerCase() : '';
  const isImage = mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg|avif)$/i.test(originalFileName);
  const isDoc = mimeType?.includes('pdf') || mimeType?.includes('document') || /\.(pdf|docx|txt|doc)$/i.test(originalFileName);

  const now = new Date();
  const dateStr = `${now.toLocaleString('en-US', { month: 'short' })}${String(now.getDate()).padStart(2, '0')}`;

  if (isImage) {
    return `Photo_${dateStr}${ext || '.png'}`;
  }
  if (isDoc) {
    return `Document_${dateStr}${ext || '.pdf'}`;
  }
  return `File_${dateStr}${ext}`;
}

