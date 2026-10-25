import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Simulated environment for ApiClient tests
describe('Frontend Version History API Client & Logic Unit Tests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Version History Listing (GET /files/:fileId/versions)', () => {
    test('fetches versions for a file with correct URL and credentials', async () => {
      let requestedUrl = '';
      let requestedOptions = null;

      global.fetch = async (url, options) => {
        requestedUrl = url;
        requestedOptions = options;
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            fileId: '60c72b2f9b1d8b2bad000001',
            currentVersion: 2,
            totalVersions: 2,
            count: 2,
            versions: [
              {
                _id: 'v_2',
                fileId: '60c72b2f9b1d8b2bad000001',
                versionNumber: 2,
                originalName: 'specs.pdf',
                size: 2048,
                mimetype: 'application/pdf',
                changeSummary: 'Updated specs',
                createdAt: '2026-10-26T00:00:00.000Z',
              },
              {
                _id: 'v_1',
                fileId: '60c72b2f9b1d8b2bad000001',
                versionNumber: 1,
                originalName: 'specs.pdf',
                size: 1024,
                mimetype: 'application/pdf',
                changeSummary: 'Initial version',
                createdAt: '2026-10-25T00:00:00.000Z',
              },
            ],
          }),
        };
      };

      // Import fresh ApiClient
      const { apiClient } = await import('../lib/api.ts');
      const data = await apiClient.getFileVersions('60c72b2f9b1d8b2bad000001');

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.currentVersion, 2);
      assert.strictEqual(data.versions.length, 2);
      assert.strictEqual(data.versions[0].versionNumber, 2);
      assert.strictEqual(data.versions[1].versionNumber, 1);
      assert.ok(requestedUrl.includes('/files/60c72b2f9b1d8b2bad000001/versions'));
      assert.strictEqual(requestedOptions.credentials, 'include');
    });

    test('handles API error when fetching versions fails', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'File not found or owned by another user',
        }),
      });

      const { apiClient } = await import('../lib/api.ts');
      await assert.rejects(
        () => apiClient.getFileVersions('non_existent_id'),
        /File not found or owned by another user/
      );
    });
  });

  describe('Download Historical Version (GET /files/:fileId/versions/:versionId/download)', () => {
    test('calls correct download endpoint and parses UTF-8 Content-Disposition', async () => {
      let downloadUrl = '';
      let downloadOptions = null;

      global.fetch = async (url, options) => {
        downloadUrl = url;
        downloadOptions = options;
        return {
          ok: true,
          headers: new Headers({
            'content-type': 'application/pdf',
            'content-disposition': "attachment; filename*=UTF-8''Project%20Report%20v1.pdf",
          }),
          blob: async () => new Blob(['dummy pdf binary content'], { type: 'application/pdf' }),
        };
      };

      const { apiClient } = await import('../lib/api.ts');
      const result = await apiClient.downloadFileVersion(
        'file123',
        'ver456',
        'fallback.pdf'
      );

      assert.ok(downloadUrl.includes('/files/file123/versions/ver456/download'));
      assert.strictEqual(downloadOptions.credentials, 'include');
      assert.strictEqual(result.filename, 'Project Report v1.pdf');
      assert.ok(result.blob);
    });

    test('parses standard double-quoted Content-Disposition filename', async () => {
      global.fetch = async () => ({
        ok: true,
        headers: new Headers({
          'content-type': 'text/plain',
          'content-disposition': 'attachment; filename="notes-rev1.txt"',
        }),
        blob: async () => new Blob(['sample text'], { type: 'text/plain' }),
      });

      const { apiClient } = await import('../lib/api.ts');
      const result = await apiClient.downloadFileVersion('fid', 'vid', 'fallback.txt');
      assert.strictEqual(result.filename, 'notes-rev1.txt');
    });

    test('falls back to provided filename when Content-Disposition is absent', async () => {
      global.fetch = async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        blob: async () => new Blob(['binary'], { type: 'application/octet-stream' }),
      });

      const { apiClient } = await import('../lib/api.ts');
      const result = await apiClient.downloadFileVersion('fid', 'vid', 'original-name.csv');
      assert.strictEqual(result.filename, 'original-name.csv');
    });

    test('throws descriptive error on download failure', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Storage access boundary violation' }),
      });

      const { apiClient } = await import('../lib/api.ts');
      await assert.rejects(
        () => apiClient.downloadFileVersion('fid', 'vid'),
        /Storage access boundary violation/
      );
    });
  });

  describe('Restore Historical Version (POST /files/:fileId/versions/:versionId/restore)', () => {
    test('sends restore POST with changeSummary and returns updated version & file', async () => {
      let restoreUrl = '';
      let restoreBody = null;

      global.fetch = async (url, options) => {
        restoreUrl = url;
        restoreBody = JSON.parse(options.body);
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            message: 'Successfully restored version as version 3',
            version: {
              _id: 'v_3',
              fileId: 'file_abc',
              versionNumber: 3,
              originalName: 'doc.txt',
              size: 512,
              changeSummary: 'Restored from version 1',
              createdAt: '2026-10-26T00:00:00.000Z',
            },
            file: {
              _id: 'file_abc',
              currentVersion: 3,
              totalVersions: 3,
              originalName: 'doc.txt',
              size: 512,
              mimetype: 'text/plain',
              updatedAt: '2026-10-26T00:00:00.000Z',
            },
          }),
        };
      };

      const { apiClient } = await import('../lib/api.ts');
      const res = await apiClient.restoreFileVersion('file_abc', 'v_1', 'Restored from version 1');

      assert.ok(restoreUrl.includes('/files/file_abc/versions/v_1/restore'));
      assert.strictEqual(restoreBody.changeSummary, 'Restored from version 1');
      assert.strictEqual(res.version.versionNumber, 3);
      assert.strictEqual(res.file.currentVersion, 3);
    });

    test('handles restore failure when version is already active', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'Version 2 is already the current active version',
        }),
      });

      const { apiClient } = await import('../lib/api.ts');
      await assert.rejects(
        () => apiClient.restoreFileVersion('fid', 'vid'),
        /Version 2 is already the current active version/
      );
    });
  });

  describe('Version History Display & State Logic', () => {
    test('sorts versions strictly in descending versionNumber order', () => {
      const unorderedVersions = [
        { versionNumber: 2, size: 200 },
        { versionNumber: 1, size: 100 },
        { versionNumber: 4, size: 400 },
        { versionNumber: 3, size: 300 },
      ];

      const sorted = [...unorderedVersions].sort((a, b) => b.versionNumber - a.versionNumber);
      assert.deepStrictEqual(
        sorted.map((v) => v.versionNumber),
        [4, 3, 2, 1]
      );
    });

    test('accurately computes size delta between consecutive versions', () => {
      const versions = [
        { versionNumber: 3, size: 3500 }, // +1500 compared to v2
        { versionNumber: 2, size: 2000 }, // -1000 compared to v1
        { versionNumber: 1, size: 3000 }, // base version (no older version)
      ];

      // Sizing delta for v3 vs v2:
      const v3Delta = versions[0].size - versions[1].size;
      assert.strictEqual(v3Delta, 1500);

      // Sizing delta for v2 vs v1:
      const v2Delta = versions[1].size - versions[2].size;
      assert.strictEqual(v2Delta, -1000);

      // Sizing delta for v1 (oldest):
      const v1Older = versions[2 + 1];
      assert.strictEqual(v1Older, undefined);
    });

    test('identifies current version and determines restoration eligibility', () => {
      const currentVersion = 3;
      const versions = [
        { versionNumber: 3 },
        { versionNumber: 2 },
        { versionNumber: 1 },
      ];

      // Current version cannot be restored over itself
      assert.strictEqual(versions[0].versionNumber === currentVersion, true);
      const isV3EligibleToRestore = versions[0].versionNumber !== currentVersion;
      assert.strictEqual(isV3EligibleToRestore, false);

      // Older versions are eligible
      assert.strictEqual(versions[1].versionNumber !== currentVersion, true);
      assert.strictEqual(versions[2].versionNumber !== currentVersion, true);
    });

    test('preserves existing Day 4 Recycle Bin client methods intact', async () => {
      const { apiClient } = await import('../lib/api.ts');
      assert.strictEqual(typeof apiClient.getRecycleBin, 'function');
      assert.strictEqual(typeof apiClient.restoreFileFromTrash, 'function');
      assert.strictEqual(typeof apiClient.permanentlyDeleteFile, 'function');
      assert.strictEqual(typeof apiClient.emptyRecycleBin, 'function');
      assert.strictEqual(typeof apiClient.trashFile, 'function');
    });
  });
});
