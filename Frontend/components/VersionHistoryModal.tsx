'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FileItem, FileVersion, FileVersionsResponse } from '@/types';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Cross2Icon,
  DownloadIcon,
  ResetIcon,
  UploadIcon,
  ReloadIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  CounterClockwiseClockIcon,
} from '@radix-ui/react-icons';

interface VersionHistoryModalProps {
  isOpen: boolean;
  file: FileItem | null;
  onClose: () => void;
  onVersionRestored?: (fileId: string, updatedFile: Partial<FileItem>) => void;
  onVersionUploaded?: (fileId: string, updatedFile: Partial<FileItem>) => void;
}

export function VersionHistoryModal({
  isOpen,
  file,
  onClose,
  onVersionRestored,
  onVersionUploaded,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number>(1);
  const [totalVersions, setTotalVersions] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Download & Restore state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Restore Confirmation state
  const [versionToRestore, setVersionToRestore] = useState<FileVersion | null>(null);
  const [restoreChangeSummary, setRestoreChangeSummary] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  // New Version Upload state
  const [showUploadSection, setShowUploadSection] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const isMountedRef = React.useRef(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Keyboard Escape listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (versionToRestore) {
          setVersionToRestore(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, versionToRestore, onClose]);

  // Fetch versions whenever the modal opens or the active file changes
  const fetchVersions = React.useCallback(async () => {
    if (!file?._id) {
      setError('File ID is required to fetch version history');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setRestoreSuccess(null);
    setUploadSuccess(null);

    try {
      const data: FileVersionsResponse = await apiClient.getFileVersions(file._id);
      if (!isMountedRef.current) return;

      // Sort descending by versionNumber just in case
      const sortedVersions = [...(data.versions || [])].sort(
        (a, b) => b.versionNumber - a.versionNumber
      );
      setVersions(sortedVersions);
      setCurrentVersion(data.currentVersion || 1);
      setTotalVersions(data.totalVersions || sortedVersions.length || 1);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch version history');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [file?._id]);

  React.useEffect(() => {
    if (isOpen && file?._id) {
      fetchVersions();
      setShowUploadSection(false);
      setUploadFile(null);
      setUploadSummary('');
      setVersionToRestore(null);
      setDownloadError(null);
      setRestoreError(null);
    }
  }, [isOpen, file?._id, fetchVersions]);

  if (!isOpen || !file) {
    return null;
  }

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
    return `${formatted} ${sizes[i] || 'B'}`;
  };

  // Format date helper
  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d);
    } catch {
      return isoString;
    }
  };

  // Download a historical version
  const handleDownload = async (v: FileVersion) => {
    if (!file._id || downloadingId) return;

    setDownloadingId(v._id);
    setDownloadError(null);

    try {
      await apiClient.downloadFileVersion(file._id, v._id, v.originalName);
    } catch (err) {
      if (isMountedRef.current) {
        setDownloadError(
          err instanceof Error
            ? err.message
            : `Failed to download version ${v.versionNumber}`
        );
      }
    } finally {
      if (isMountedRef.current) {
        setDownloadingId(null);
      }
    }
  };

  // Open Restore Confirmation
  const handlePromptRestore = (v: FileVersion) => {
    setVersionToRestore(v);
    setRestoreChangeSummary(`Restored from version ${v.versionNumber}`);
    setRestoreError(null);
  };

  // Confirm Restore
  const handleConfirmRestore = async () => {
    if (!file._id || !versionToRestore || isRestoring) return;

    setIsRestoring(true);
    setRestoreError(null);

    try {
      const res = await apiClient.restoreFileVersion(
        file._id,
        versionToRestore._id,
        restoreChangeSummary.trim() || undefined
      );

      if (isMountedRef.current) {
        setRestoreSuccess(
          res.message ||
            `Successfully restored version as version ${res.version.versionNumber}`
        );
        setVersionToRestore(null);
        await fetchVersions();
        if (onVersionRestored) {
          onVersionRestored(file._id, res.file);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setRestoreError(
          err instanceof Error ? err.message : 'Failed to restore historical version'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsRestoring(false);
      }
    }
  };

  // Handle Revision Upload
  const handleUploadNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file._id || !uploadFile || isUploading) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await apiClient.uploadFileVersion(
        file._id,
        uploadFile,
        uploadSummary.trim() || undefined
      );

      if (isMountedRef.current) {
        setUploadSuccess(
          res.message ||
            `Successfully uploaded version ${res.version.versionNumber}`
        );
        setUploadFile(null);
        setUploadSummary('');
        setShowUploadSection(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await fetchVersions();
        if (onVersionUploaded) {
          onVersionUploaded(file._id, res.file);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setUploadError(
          err instanceof Error ? err.message : 'Failed to upload new version'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-history-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] bg-card/95 border border-border/80 text-foreground rounded-2xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-6 border-b border-border/60 bg-muted/20">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0 mt-0.5">
              <CounterClockwiseClockIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="version-history-title"
                  className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate max-w-md"
                  title={file.name}
                >
                  Version History
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  Current: v{currentVersion}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  ({totalVersions} {totalVersions === 1 ? 'version' : 'versions'})
                </span>
              </div>
              <p
                className="text-xs text-muted-foreground mt-0.5 truncate max-w-lg"
                title={file.name}
              >
                {file.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadSection((prev) => !prev)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 shadow-sm',
                showUploadSection
                  ? 'bg-secondary text-secondary-foreground border-border'
                  : 'bg-primary text-primary-foreground border-primary/50 hover:opacity-95'
              )}
              title="Upload a new file revision"
            >
              <UploadIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {showUploadSection ? 'Cancel Upload' : 'Upload Revision'}
              </span>
              <span className="sm:hidden">
                {showUploadSection ? 'Cancel' : 'Upload'}
              </span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl border border-border/60 hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              aria-label="Close Version History modal"
            >
              <Cross2Icon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Notifications inside modal */}
        <div className="px-6 pt-4 space-y-2 empty:hidden">
          {restoreSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircledIcon className="w-4 h-4 flex-shrink-0" />
                <span>{restoreSuccess}</span>
              </span>
              <button
                onClick={() => setRestoreSuccess(null)}
                className="hover:underline font-bold ml-2"
              >
                Dismiss
              </button>
            </div>
          )}

          {downloadError && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CrossCircledIcon className="w-4 h-4 flex-shrink-0" />
                <span>{downloadError}</span>
              </span>
              <button
                onClick={() => setDownloadError(null)}
                className="hover:underline font-bold ml-2"
              >
                Dismiss
              </button>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircledIcon className="w-4 h-4 flex-shrink-0" />
                <span>{uploadSuccess}</span>
              </span>
              <button
                onClick={() => setUploadSuccess(null)}
                className="hover:underline font-bold ml-2"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Upload Revision Drawer / Form */}
        {showUploadSection && (
          <form
            onSubmit={handleUploadNewVersion}
            className="p-5 mx-6 mt-4 bg-muted/30 border border-border/70 rounded-2xl space-y-3.5 animate-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <UploadIcon className="w-3.5 h-3.5" />
                Upload Revised Document
              </h3>
              <span className="text-[11px] text-muted-foreground">Max 5MB</span>
            </div>

            {uploadError && (
              <div className="p-2.5 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs">
                {uploadError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Select Revision File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-foreground file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer border border-border/60 rounded-xl p-1 bg-background"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Change Summary / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Updated financial tables, fixed typo"
                  value={uploadSummary}
                  onChange={(e) => setUploadSummary(e.target.value)}
                  maxLength={300}
                  className="w-full px-3 py-2 text-xs bg-background border border-border/60 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowUploadSection(false);
                  setUploadFile(null);
                  setUploadSummary('');
                }}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!uploadFile || isUploading}
                className="px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-95 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
              >
                {isUploading ? (
                  <>
                    <ReloadIcon className="w-3.5 h-3.5 animate-spin" />
                    <span>Uploading v{totalVersions + 1}...</span>
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-3.5 h-3.5" />
                    <span>Upload as v{totalVersions + 1}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Loading State */}
          {loading && (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pb-4">
                <ReloadIcon className="w-4 h-4 animate-spin text-primary" />
                <span>Loading version history...</span>
              </div>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 bg-muted/20 border border-border/50 rounded-xl space-y-2 animate-pulse"
                >
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-24 bg-muted/60 rounded-md" />
                    <div className="h-4 w-32 bg-muted/60 rounded-md" />
                  </div>
                  <div className="h-3 w-48 bg-muted/40 rounded-md" />
                  <div className="h-6 w-full bg-muted/30 rounded-md pt-2" />
                </div>
              ))}
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="py-12 px-6 text-center border border-dashed border-destructive/50 rounded-2xl bg-destructive/5 space-y-3">
              <CrossCircledIcon className="w-10 h-10 text-destructive mx-auto opacity-80" />
              <h3 className="text-sm font-bold text-foreground">
                Unable to load version history
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {error}
              </p>
              <button
                onClick={fetchVersions}
                className="mt-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-95 transition-all inline-flex items-center gap-1.5 shadow-sm"
              >
                <ReloadIcon className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && versions.length === 0 && (
            <div className="py-12 px-6 text-center border-2 border-dashed border-border/80 rounded-2xl bg-muted/10 space-y-3">
              <CounterClockwiseClockIcon className="w-10 h-10 text-muted-foreground mx-auto opacity-60" />
              <h3 className="text-sm font-bold text-foreground">
                No version history available
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                This file currently has no historical snapshots recorded. You can upload a new revision at any time.
              </p>
            </div>
          )}

          {/* Versions Timeline List */}
          {!loading && !error && versions.length > 0 && (
            <div className="relative pl-6 sm:pl-8 space-y-5 before:absolute before:left-2 sm:before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/80">
              {versions.map((v, index) => {
                const isCurrent = v.versionNumber === currentVersion;
                const isDownloading = downloadingId === v._id;

                // Calculate size delta compared to the previous version in chronology
                // Since versions is descending (v3, v2, v1), the chronologically older version is index + 1
                const olderVersion = versions[index + 1];
                let sizeDelta: number | null = null;
                if (olderVersion) {
                  sizeDelta = v.size - olderVersion.size;
                }

                return (
                  <div
                    key={v._id || v.versionNumber}
                    className={cn(
                      'relative p-4 sm:p-5 rounded-2xl border transition-all duration-300',
                      isCurrent
                        ? 'bg-primary/5 border-primary/40 shadow-sm shadow-primary/10'
                        : 'bg-card border-border/70 hover:border-border hover:bg-muted/20'
                    )}
                  >
                    {/* Timeline Node Icon */}
                    <div
                      className={cn(
                        'absolute -left-6 sm:-left-8 top-5 w-4 h-4 rounded-full border-2 bg-background flex items-center justify-center',
                        isCurrent
                          ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                          : 'border-muted-foreground/60'
                      )}
                    >
                      {isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-background" />
                      )}
                    </div>

                    {/* Version Card Top Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'text-xs font-bold px-2.5 py-0.5 rounded-lg border',
                            isCurrent
                              ? 'bg-primary text-primary-foreground border-primary/50'
                              : 'bg-muted text-foreground border-border/80'
                          )}
                        >
                          v{v.versionNumber}
                        </span>

                        {isCurrent && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircledIcon className="w-3 h-3" />
                            Current Active
                          </span>
                        )}

                        <span className="text-xs font-semibold text-foreground/90">
                          {formatBytes(v.size)}
                        </span>

                        {sizeDelta !== null && (
                          <span
                            className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded-md border',
                              sizeDelta > 0
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                : sizeDelta < 0
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-muted/50 text-muted-foreground border-border/50'
                            )}
                            title={`Size delta compared to v${olderVersion.versionNumber}`}
                          >
                            {sizeDelta > 0
                              ? `+${formatBytes(sizeDelta)}`
                              : sizeDelta < 0
                              ? `-${formatBytes(Math.abs(sizeDelta))}`
                              : 'Same size'}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatDate(v.createdAt)}
                      </span>
                    </div>

                    {/* Change Summary */}
                    {v.changeSummary && (
                      <div className="mb-3 px-3 py-1.5 bg-muted/40 border border-border/50 rounded-xl text-xs text-foreground/80 italic flex items-center gap-2">
                        <span className="font-semibold not-italic text-muted-foreground text-[10px] uppercase tracking-wider">
                          Note:
                        </span>
                        <span className="truncate">{v.changeSummary}</span>
                      </div>
                    )}

                    {/* Metadata strip: filename, hash */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-2 truncate max-w-sm">
                        <span className="truncate" title={v.originalName}>
                          {v.originalName}
                        </span>
                        {v.contentHash && (
                          <span
                            className="font-mono text-[9px] bg-muted/60 px-1.5 py-0.5 rounded border border-border/40"
                            title={`SHA-256: ${v.contentHash}`}
                          >
                            hash: {v.contentHash.slice(0, 8)}...
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 ml-auto">
                        {/* Download Historical Snapshot Button */}
                        <button
                          onClick={() => handleDownload(v)}
                          disabled={isDownloading}
                          className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border/80 bg-background hover:bg-accent text-foreground transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                          title={`Download version ${v.versionNumber}`}
                        >
                          {isDownloading ? (
                            <>
                              <ReloadIcon className="w-3 h-3 animate-spin" />
                              <span>Downloading...</span>
                            </>
                          ) : (
                            <>
                              <DownloadIcon className="w-3 h-3 text-primary" />
                              <span>Download</span>
                            </>
                          )}
                        </button>

                        {/* Restore Button (Eligible only on historical versions) */}
                        {!isCurrent ? (
                          <button
                            onClick={() => handlePromptRestore(v)}
                            disabled={isRestoring}
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                            title={`Restore v${v.versionNumber} as the latest active version`}
                          >
                            <ResetIcon className="w-3 h-3" />
                            <span>Restore to Latest</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/70 italic px-2 py-1">
                            Active version
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-border/60 bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Restoring an older version safely creates a new latest revision without modifying past history.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border/80 hover:bg-accent text-foreground font-semibold transition-all shadow-sm"
          >
            Close
          </button>
        </div>
      </div>

      {/* Restore Confirmation Sub-Modal */}
      {versionToRestore && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="restore-dialog-title"
          onClick={() => !isRestoring && setVersionToRestore(null)}
        >
          <div
            className="w-full max-w-md bg-card border border-border text-foreground rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0">
                <ResetIcon className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="restore-dialog-title"
                  className="text-base font-bold text-foreground"
                >
                  Restore Version {versionToRestore.versionNumber}?
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {versionToRestore.originalName} ({formatBytes(versionToRestore.size)})
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-muted/40 border border-border/60 rounded-xl text-xs text-foreground/85 space-y-1.5 leading-relaxed">
              <p>
                <strong>Non-Destructive Guarantee:</strong> Restoring this version will create a brand new revision{' '}
                <span className="text-primary font-bold">v{totalVersions + 1}</span> using the snapshot content from{' '}
                <span className="font-bold">v{versionToRestore.versionNumber}</span>.
              </p>
              <p className="text-muted-foreground text-[11px]">
                No historical versions will be deleted or overwritten. Your complete audit trail remains intact.
              </p>
            </div>

            {restoreError && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs">
                {restoreError}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Restoration Note (Optional)
              </label>
              <input
                type="text"
                value={restoreChangeSummary}
                onChange={(e) => setRestoreChangeSummary(e.target.value)}
                maxLength={300}
                placeholder={`Restored from version ${versionToRestore.versionNumber}`}
                className="w-full px-3 py-2 text-xs bg-background border border-border/80 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setVersionToRestore(null)}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-border hover:bg-accent text-foreground transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-95 transition-all flex items-center gap-1.5 shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <ReloadIcon className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring Version...</span>
                  </>
                ) : (
                  <>
                    <ResetIcon className="w-3.5 h-3.5" />
                    <span>Confirm Restore as v{totalVersions + 1}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
