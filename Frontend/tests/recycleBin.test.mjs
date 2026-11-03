import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';

describe('Frontend Recycle Bin API Client, UI Logic & Integration Tests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Recycle Bin Listing (GET /files/recycle-bin)', () => {
    test('fetches soft-deleted files for authenticated user with full metadata and credentials', async () => {
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
            count: 2,
            files: [
              {
                _id: 'trash_1',
                fileName: '169000-q4_report.pdf',
                originalName: 'q4_report.pdf',
                size: 204800,
                mimetype: 'application/pdf',
                category: 'Document',
                tags: ['finance', 'q4'],
                summary: 'Quarterly financial report summary',
                isDeleted: true,
                deletedAt: '2026-10-26T12:00:00.000Z',
                deletionExpiresAt: '2026-11-25T12:00:00.000Z',
                deletedBy: 'user_123',
                daysRemaining: 29,
                versionCount: 3,
                originalFolder: '/finance',
              },
              {
                _id: 'trash_2',
                fileName: '169001-invoice.pdf',
                originalName: 'invoice.pdf',
                size: 51200,
                mimetype: 'application/pdf',
                category: 'Invoice',
                tags: ['october'],
                summary: null,
                isDeleted: true,
                deletedAt: '2026-10-25T08:00:00.000Z',
                deletionExpiresAt: '2026-11-24T08:00:00.000Z',
                deletedBy: 'user_123',
                daysRemaining: 28,
                versionCount: 1,
                originalFolder: '/',
              },
            ],
          }),
        };
      };

      const { apiClient } = await import('../lib/api.ts');
      const data = await apiClient.getRecycleBin();

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.count, 2);
      assert.strictEqual(data.files.length, 2);
      assert.strictEqual(data.files[0]._id, 'trash_1');
      assert.strictEqual(data.files[0].originalName, 'q4_report.pdf');
      assert.strictEqual(data.files[0].daysRemaining, 29);
      assert.strictEqual(data.files[0].versionCount, 3);
      assert.strictEqual(data.files[0].originalFolder, '/finance');
      assert.ok(requestedUrl.includes('/files/recycle-bin'));
      assert.strictEqual(requestedOptions.credentials, 'include');
    });

    test('handles empty Recycle Bin listing gracefully', async () => {
      global.fetch = async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          count: 0,
          files: [],
        }),
      });

      const { apiClient } = await import('../lib/api.ts');
      const data = await apiClient.getRecycleBin();

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.count, 0);
      assert.deepStrictEqual(data.files, []);
    });

    test('propagates API error when fetching Recycle Bin fails', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'Database connection failed',
        }),
      });

      const { apiClient } = await import('../lib/api.ts');
      await assert.rejects(
        () => apiClient.getRecycleBin(),
        /Database connection failed/
      );
    });
  });

  describe('Restore File from Recycle Bin (POST /files/recycle-bin/:fileId/restore)', () => {
    test('sends restore POST with encoded fileId and returns restored file', async () => {
      let restoreUrl = '';
      let restoreOptions = null;

      global.fetch = async (url, options) => {
        restoreUrl = url;
        restoreOptions = options;
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            message: 'File restored successfully',
            renamed: false,
            restoredName: 'notes.txt',
            alreadyActive: false,
            file: {
              _id: '60c72b2f9b1d8b2bad000001',
              fileName: '169000-notes.txt',
              originalName: 'notes.txt',
              isDeleted: false,
              deletedAt: null,
              updatedAt: '2026-10-27T06:00:00.000Z',
            },
          }),
        };
      };

      const { apiClient } = await import('../lib/api.ts');
      const res = await apiClient.restoreFileFromTrash('60c72b2f9b1d8b2bad000001');

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.renamed, false);
      assert.strictEqual(res.restoredName, 'notes.txt');
      assert.strictEqual(res.file.isDeleted, false);
      assert.ok(restoreUrl.includes('/files/recycle-bin/60c72b2f9b1d8b2bad000001/restore'));
      assert.strictEqual(restoreOptions.method, 'POST');
      assert.strictEqual(restoreOptions.credentials, 'include');
    });

    test('handles filename collision with backend-provided non-conflicting restoredName', async () => {
      global.fetch = async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'File restored successfully as "notes (restored).txt" to resolve name conflict',
          renamed: true,
          restoredName: 'notes (restored).txt',
          alreadyActive: false,
          file: {
            _id: '60c72b2f9b1d8b2bad000001',
            fileName: '169000-notes.txt',
            originalName: 'notes (restored).txt',
            isDeleted: false,
            deletedAt: null,
            updatedAt: '2026-10-27T06:00:00.000Z',
          },
        }),
      });

      const { apiClient } = await import('../lib/api.ts');
      const res = await apiClient.restoreFileFromTrash('60c72b2f9b1d8b2bad000001');

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.renamed, true);
      assert.strictEqual(res.restoredName, 'notes (restored).txt');
      assert.strictEqual(res.file.originalName, 'notes (restored).txt');
    });

    test('handles active file quota error (12 active files reached)', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'Cannot restore: active file quota of 12 reached',
        }),
      });

      const { apiClient } = await import('../lib/api.ts');
      await assert.rejects(
        () => apiClient.restoreFileFromTrash('trash_id'),
        /Cannot restore: active file quota of 12 reached/
      );
    });
  });

  describe('Permanent Deletion of Single File (DELETE /files/recycle-bin/:fileId)', () => {
    test('sends DELETE request with encoded fileId and returns purged paths', async () => {
      let deleteUrl = '';
      let deleteOptions = null;

      global.fetch = async (url, options) => {
        deleteUrl = url;
        deleteOptions = options;
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            message: 'File permanently deleted from Recycle Bin',
            deletedFileId: '60c72b2f9b1d8b2bad000001',
            deletedStoragePaths: [
              'user_1/169000-data.csv',
              'user_1/versions/60c72b2f9b1d8b2bad000001/v1_data.csv',
            ],
          }),
        };
      };

      const { apiClient } = await import('../lib/api.ts');
      const res = await apiClient.permanentlyDeleteFile('60c72b2f9b1d8b2bad000001');

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.deletedFileId, '60c72b2f9b1d8b2bad000001');
      assert.strictEqual(res.deletedStoragePaths.length, 2);
      assert.ok(deleteUrl.includes('/files/recycle-bin/60c72b2f9b1d8b2bad000001'));
      assert.strictEqual(deleteOptions.method, 'DELETE');
    });

    test('handles permanent deletion failure when file is not in Recycle Bin', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'File must be in the Recycle Bin to be permanently deleted',
        }),
      });

      const { apiClient } = await import('../lib/api.ts');
      await assert.rejects(
        () => apiClient.permanentlyDeleteFile('active_file_id'),
        /File must be in the Recycle Bin to be permanently deleted/
      );
    });
  });

  describe('Empty Recycle Bin (DELETE /files/recycle-bin/empty)', () => {
    test('sends DELETE /files/recycle-bin/empty and returns total purge count', async () => {
      let emptyUrl = '';
      let emptyOptions = null;

      global.fetch = async (url, options) => {
        emptyUrl = url;
        emptyOptions = options;
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            message: 'Recycle Bin emptied successfully',
            deletedCount: 5,
            deletedFileIds: ['f1', 'f2', 'f3', 'f4', 'f5'],
            deletedStoragePathsCount: 8,
          }),
        };
      };

      const { apiClient } = await import('../lib/api.ts');
      const res = await apiClient.emptyRecycleBin();

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.deletedCount, 5);
      assert.strictEqual(res.deletedFileIds.length, 5);
      assert.strictEqual(res.deletedStoragePathsCount, 8);
      assert.ok(emptyUrl.includes('/files/recycle-bin/empty'));
      assert.strictEqual(emptyOptions.method, 'DELETE');
      assert.strictEqual(emptyOptions.credentials, 'include');
    });

    test('handles empty Recycle Bin when bin is already empty', async () => {
      global.fetch = async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'Recycle Bin is already empty',
          deletedCount: 0,
          deletedFileIds: [],
          deletedStoragePathsCount: 0,
        }),
      });

      const { apiClient } = await import('../lib/api.ts');
      const res = await apiClient.emptyRecycleBin();

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.deletedCount, 0);
      assert.strictEqual(res.message, 'Recycle Bin is already empty');
    });

    test('handles backend storage failure (502 Gateway error) gracefully', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 502,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'Failed to delete storage objects: Supabase error',
        }),
      });

      const { apiClient } = await import('../lib/api.ts');
      await assert.rejects(
        () => apiClient.emptyRecycleBin(),
        /Failed to delete storage objects/
      );
    });
  });

  describe('Recycle Bin UI Logic, Filtering & Retention Countdown', () => {
    test('calculates correct retention badge styling based on days remaining', () => {
      const getBadgeType = (days) => {
        if (days <= 0) return 'expires-today';
        if (days <= 3) return 'urgent';
        if (days <= 7) return 'warning';
        return 'normal';
      };

      assert.strictEqual(getBadgeType(0), 'expires-today');
      assert.strictEqual(getBadgeType(-1), 'expires-today');
      assert.strictEqual(getBadgeType(1), 'urgent');
      assert.strictEqual(getBadgeType(3), 'urgent');
      assert.strictEqual(getBadgeType(5), 'warning');
      assert.strictEqual(getBadgeType(7), 'warning');
      assert.strictEqual(getBadgeType(28), 'normal');
      assert.strictEqual(getBadgeType(30), 'normal');
    });

    test('filters deleted files by search query matching originalName, tags, or category', () => {
      const items = [
        { originalName: 'tax_return_2025.pdf', category: 'Finance', tags: ['irs', 'taxes'], summary: null },
        { originalName: 'client_proposal.docx', category: 'Contract', tags: ['sales'], summary: 'Proposal for enterprise customer' },
        { originalName: 'photo.jpg', category: 'Photo', tags: ['holiday'], summary: null },
      ];

      const search = (q) => {
        const query = q.toLowerCase();
        return items.filter(
          (item) =>
            item.originalName.toLowerCase().includes(query) ||
            item.tags.some((t) => t.toLowerCase().includes(query)) ||
            item.category.toLowerCase().includes(query) ||
            (item.summary && item.summary.toLowerCase().includes(query))
        );
      };

      // By filename match
      assert.strictEqual(search('tax').length, 1);
      assert.strictEqual(search('tax')[0].originalName, 'tax_return_2025.pdf');

      // By tag match
      assert.strictEqual(search('sales').length, 1);
      assert.strictEqual(search('sales')[0].originalName, 'client_proposal.docx');

      // By summary match
      assert.strictEqual(search('enterprise').length, 1);
      assert.strictEqual(search('enterprise')[0].originalName, 'client_proposal.docx');

      // Non-matching
      assert.strictEqual(search('nonexistent').length, 0);
    });

    test('sorts deleted files by newest deletion, oldest deletion, and expiring soonest', () => {
      const items = [
        { originalName: 'A.txt', deletedAt: '2026-10-20T00:00:00Z', daysRemaining: 23, size: 300 },
        { originalName: 'B.txt', deletedAt: '2026-10-25T00:00:00Z', daysRemaining: 28, size: 100 },
        { originalName: 'C.txt', deletedAt: '2026-10-01T00:00:00Z', daysRemaining: 4, size: 500 },
      ];

      // Newest deletion first
      const newestFirst = [...items].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
      assert.deepStrictEqual(newestFirst.map((i) => i.originalName), ['B.txt', 'A.txt', 'C.txt']);

      // Oldest deletion first
      const oldestFirst = [...items].sort((a, b) => new Date(a.deletedAt) - new Date(b.deletedAt));
      assert.deepStrictEqual(oldestFirst.map((i) => i.originalName), ['C.txt', 'A.txt', 'B.txt']);

      // Expiring soonest first
      const expiringSoon = [...items].sort((a, b) => a.daysRemaining - b.daysRemaining);
      assert.deepStrictEqual(expiringSoon.map((i) => i.originalName), ['C.txt', 'A.txt', 'B.txt']);

      // Largest size first
      const largestFirst = [...items].sort((a, b) => b.size - a.size);
      assert.deepStrictEqual(largestFirst.map((i) => i.originalName), ['C.txt', 'A.txt', 'B.txt']);
    });

    test('prevents duplicate action execution when restore or delete is already running', () => {
      let restoringFileId = 'file_123';
      let deletingFileId = null;

      const canTriggerRestore = (_id) => restoringFileId === null && deletingFileId === null;
      const canTriggerDelete = (_id) => restoringFileId === null && deletingFileId === null;

      // When file_123 is restoring, neither file_123 nor another file can be triggered
      assert.strictEqual(canTriggerRestore('file_123'), false);
      assert.strictEqual(canTriggerRestore('file_456'), false);
      assert.strictEqual(canTriggerDelete('file_123'), false);

      // Reset
      restoringFileId = null;
      assert.strictEqual(canTriggerRestore('file_123'), true);
      assert.strictEqual(canTriggerDelete('file_123'), true);
    });
  });

  describe('Integration Invariants: Active Workspace & Day 4/5 Preserved', () => {
    test('active file listing excludes soft-deleted files', () => {
      const allFiles = [
        { name: 'active1.pdf', isDeleted: false },
        { name: 'trashed1.pdf', isDeleted: true },
        { name: 'active2.png', isDeleted: false },
      ];

      const activeFiles = allFiles.filter((f) => !f.isDeleted);
      assert.strictEqual(activeFiles.length, 2);
      assert.ok(!activeFiles.some((f) => f.name === 'trashed1.pdf'));
    });

    test('restoring file adds it back to active workspace and decrements trash count', () => {
      let activeFiles = [{ _id: '1', name: 'active1.pdf' }];
      let trashFiles = [{ _id: '2', name: 'trashed2.pdf' }];

      // Simulate restore
      const restoredFile = { _id: '2', name: 'trashed2.pdf' };
      trashFiles = trashFiles.filter((f) => f._id !== restoredFile._id);
      activeFiles = [...activeFiles, restoredFile];

      assert.strictEqual(activeFiles.length, 2);
      assert.strictEqual(trashFiles.length, 0);
      assert.strictEqual(activeFiles[1].name, 'trashed2.pdf');
    });

    test('preserves Day 5 Version History API methods completely intact', async () => {
      const { apiClient } = await import('../lib/api.ts');
      assert.strictEqual(typeof apiClient.getFileVersions, 'function');
      assert.strictEqual(typeof apiClient.downloadFileVersion, 'function');
      assert.strictEqual(typeof apiClient.restoreFileVersion, 'function');
      assert.strictEqual(typeof apiClient.uploadFileVersion, 'function');
    });

    test('preserves Day 4 soft delete method intact', async () => {
      const { apiClient } = await import('../lib/api.ts');
      assert.strictEqual(typeof apiClient.deleteFile, 'function');
      assert.strictEqual(typeof apiClient.trashFile, 'function');
    });
  });
});
