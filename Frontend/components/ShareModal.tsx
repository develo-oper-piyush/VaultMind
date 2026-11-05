'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { FileItem } from '@/types';
import {
  Share1Icon,
  CopyIcon,
  CheckIcon,
  LockClosedIcon,
  ClockIcon,
  DownloadIcon,
  Cross2Icon,
  TrashIcon,
  Link2Icon,
  EyeOpenIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons';

interface ShareModalProps {
  isOpen: boolean;
  file: FileItem | null;
  onClose: () => void;
}

interface ShareItem {
  id: string;
  token: string;
  shareUrl: string;
  hasPassword: boolean;
  expiresAt: string | null;
  allowDownload: boolean;
  maxViews: number | null;
  viewsCount: number;
  createdAt: string;
  isExpired: boolean;
  isViewLimitReached: boolean;
}

export function ShareModal({ isOpen, file, onClose }: ShareModalProps) {
  const [activeShares, setActiveShares] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Form state
  const [expiresInHours, setExpiresInHours] = useState<string>('24');
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [maxViews, setMaxViews] = useState('');
  const [newlyCreatedUrl, setNewlyCreatedUrl] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    if (!file?._id) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.getFileShares(file._id);
      setActiveShares(res.shares || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch existing share links');
    } finally {
      setLoading(false);
    }
  }, [file?._id]);

  useEffect(() => {
    if (isOpen && file?._id) {
      setNewlyCreatedUrl(null);
      setPassword('');
      setEnablePassword(false);
      setError('');
      setSuccessNotice('');
      void fetchShares();
    }
  }, [isOpen, file?._id, fetchShares]);

  if (!isOpen || !file) return null;

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file._id) return;

    if (enablePassword && (!password || password.trim().length < 4)) {
      setError('Password protection requires at least 4 characters');
      return;
    }

    setCreating(true);
    setError('');
    setSuccessNotice('');

    try {
      const res = await apiClient.createShareLink(file._id, {
        expiresInHours: expiresInHours === 'never' ? null : Number(expiresInHours),
        password: enablePassword ? password.trim() : null,
        allowDownload,
        maxViews: maxViews ? Number(maxViews) : null,
      });

      setNewlyCreatedUrl(res.share.shareUrl);
      setSuccessNotice('Share link generated successfully!');
      setPassword('');
      setEnablePassword(false);
      await fetchShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeShare = async (token: string) => {
    if (!confirm('Are you sure you want to revoke this link? Anyone with this link will immediately lose access.')) {
      return;
    }

    try {
      await apiClient.revokeShareLink(token);
      if (newlyCreatedUrl && newlyCreatedUrl.includes(token)) {
        setNewlyCreatedUrl(null);
      }
      setSuccessNotice('Link revoked successfully');
      await fetchShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke link');
    }
  };

  const copyToClipboard = (url: string, token: string) => {
    void navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Share1Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Secure Share Links</h2>
              <p className="text-xs text-muted-foreground truncate max-w-[280px] sm:max-w-md">
                {file.originalName || file.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
          >
            <Cross2Icon className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
              <CheckIcon className="w-4 h-4 flex-shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* Newly created link alert */}
          {newlyCreatedUrl && (
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <Link2Icon className="w-4 h-4" /> Ready to share:
                </span>
                <span className="text-[11px] text-muted-foreground">Public link</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newlyCreatedUrl}
                  className="flex-1 px-3 py-2 text-xs bg-background border border-input rounded-lg text-foreground focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(newlyCreatedUrl, 'new')}
                  className="px-3 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 flex items-center gap-1.5 transition-all shadow-sm"
                >
                  {copiedToken === 'new' ? (
                    <>
                      <CheckIcon className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Create new link form */}
          <form onSubmit={handleCreateShare} className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Create New Share Link
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Expiration Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5 text-primary" />
                  <span>Link Expiration</span>
                </label>
                <select
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="1">1 Hour</option>
                  <option value="24">24 Hours (1 Day)</option>
                  <option value="168">7 Days (1 Week)</option>
                  <option value="720">30 Days (1 Month)</option>
                  <option value="never">Never (Persistent)</option>
                </select>
              </div>

              {/* Max Views */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <EyeOpenIcon className="w-3.5 h-3.5 text-primary" />
                  <span>Max Views (Optional)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                  className="w-full px-3 py-2 bg-card border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Toggle: Password protection */}
            <div className="p-3 bg-muted/20 border border-border/60 rounded-xl space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <LockClosedIcon className="w-4 h-4 text-primary" />
                  <div>
                    <div className="text-xs font-semibold text-foreground">Password Protection</div>
                    <div className="text-[11px] text-muted-foreground">Require a passphrase before viewing or downloading</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enablePassword}
                  onChange={(e) => setEnablePassword(e.target.checked)}
                  className="checkbox checkbox-primary checkbox-sm"
                />
              </label>

              {enablePassword && (
                <div className="pt-2 animate-in fade-in duration-200">
                  <input
                    type="password"
                    placeholder="Enter link password (min 4 chars)..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}
            </div>

            {/* Toggle: Allow downloading */}
            <div className="p-3 bg-muted/20 border border-border/60 rounded-xl">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <DownloadIcon className="w-4 h-4 text-primary" />
                  <div>
                    <div className="text-xs font-semibold text-foreground">Allow Direct Download</div>
                    <div className="text-[11px] text-muted-foreground">Recipients can save a local copy of this file</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="checkbox checkbox-primary checkbox-sm"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
            >
              {creating ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  <span>Generating Secure Link...</span>
                </>
              ) : (
                <>
                  <Link2Icon className="w-4 h-4" />
                  <span>Generate Link</span>
                </>
              )}
            </button>
          </form>

          {/* Existing Active Links Section */}
          <div className="space-y-3 pt-4 border-t border-border/60">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Active Share Links ({activeShares.length})
              </h3>
              {loading && <span className="text-[11px] text-muted-foreground">Refreshing...</span>}
            </div>

            {activeShares.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4 bg-card/40 rounded-xl border border-dashed border-border/60">
                No active share links. Create one above to share this file.
              </p>
            ) : (
              <div className="space-y-2">
                {activeShares.map((s) => (
                  <div
                    key={s.token}
                    className="p-3 bg-card border border-border/80 rounded-xl flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">
                          ...{s.token.slice(-6)}
                        </span>
                        {s.hasPassword && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">
                            <LockClosedIcon className="w-2.5 h-2.5" /> Password
                          </span>
                        )}
                        {!s.allowDownload && (
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            View-Only
                          </span>
                        )}
                        {s.isExpired ? (
                          <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded font-bold">
                            Expired
                          </span>
                        ) : s.expiresAt ? (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            Expires: {new Date(s.expiresAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            Never expires
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span>Views: {s.viewsCount}{s.maxViews ? ` / ${s.maxViews}` : ''}</span>
                        <span>•</span>
                        <span>Created {new Date(s.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(s.shareUrl, s.token)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                        title="Copy link"
                      >
                        {copiedToken === s.token ? (
                          <CheckIcon className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <CopyIcon className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeShare(s.token)}
                        className="p-1.5 text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Revoke link"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/60 bg-muted/20 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-card border border-border/80 hover:bg-accent text-foreground text-xs font-semibold rounded-xl transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

