'use client';

import React, { useState, useEffect, use } from 'react';
import { apiClient } from '@/lib/api';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import {
  ArchiveIcon,
  DownloadIcon,
  LockClosedIcon,
  FileTextIcon,
  ImageIcon,
  VideoIcon,
  SpeakerLoudIcon,
  ClockIcon,
  EyeOpenIcon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function PublicSharePage({ params }: PageProps) {
  const { token } = use(params);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProtected, setIsProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [shareData, setShareData] = useState<{
    token: string;
    isProtected: boolean;
    hasPassword?: boolean;
    fileName?: string;
    mimetype?: string;
    size?: number;
    allowDownload?: boolean;
    expiresAt?: string | null;
    viewsCount?: number;
    file?: {
      id: string;
      name: string;
      mimetype: string;
      size: number;
      category?: string;
      createdAt?: string;
    };
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMetadata = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.getPublicShare(token);
        if (isMounted) {
          setShareData(res.data);
          setIsProtected(res.data.isProtected);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Share link unavailable');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadMetadata();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setVerifying(true);
    setError(null);

    try {
      const res = await apiClient.verifySharePassword(token, password);
      if (res.authorized && res.authToken) {
        setAuthToken(res.authToken);
        setIsProtected(false);
        // Refresh full metadata with authorization
        const fullRes = await apiClient.getPublicShare(token);
        setShareData(fullRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect password');
    } finally {
      setVerifying(false);
    }
  };

  const formatFileSize = (bytes: number = 0) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const activeMimetype = shareData?.file?.mimetype || shareData?.mimetype || '';
  const activeFileName = shareData?.file?.name || shareData?.fileName || 'Shared File';
  const activeSize = shareData?.file?.size ?? shareData?.size ?? 0;
  const allowDownload = shareData?.allowDownload !== false;

  const streamUrl = apiClient.getPublicShareStreamUrl(
    token,
    authToken || undefined,
    false
  );

  const downloadUrl = apiClient.getPublicShareStreamUrl(
    token,
    authToken || undefined,
    true
  );

  const isImage = activeMimetype.startsWith('image/');
  const isPdf = activeMimetype === 'application/pdf';
  const isVideo = activeMimetype.startsWith('video/');
  const isAudio = activeMimetype.startsWith('audio/');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Navigation Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
              <ArchiveIcon className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight">VaultMind</span>
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                Public Share
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-card border border-border/80 hover:bg-accent transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-6">
        {loading ? (
          <div className="text-center space-y-4 py-20">
            <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground font-medium">Loading shared file...</p>
          </div>
        ) : error && !isProtected ? (
          /* Error Screen */
          <div className="w-full max-w-md p-8 bg-card border border-border/80 rounded-2xl shadow-xl text-center space-y-4 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center mx-auto">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-foreground">File Unavailable</h2>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:opacity-90 transition-opacity"
            >
              Go to VaultMind Home
            </Link>
          </div>
        ) : isProtected ? (
          /* Password Protection Screen */
          <div className="w-full max-w-md p-8 bg-card border border-border/80 rounded-2xl shadow-2xl space-y-6 animate-in fade-in duration-200">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
                <LockClosedIcon className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Password Protected File</h2>
              <p className="text-xs text-muted-foreground">
                Enter the passphrase provided by the file owner to unlock <strong>{activeFileName}</strong>
              </p>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <input
                type="password"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 bg-card border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="submit"
                disabled={verifying || !password}
                className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
              >
                {verifying ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                    <span>Unlocking...</span>
                  </>
                ) : (
                  <>
                    <LockClosedIcon className="w-4 h-4" />
                    <span>Unlock & View File</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* File Preview & Download Card */
          <div className="w-full max-w-4xl bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col space-y-0 animate-in fade-in duration-200">
            {/* File Info Bar */}
            <div className="p-6 border-b border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-muted/10">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  {isImage && <ImageIcon className="w-6 h-6" />}
                  {isPdf && <FileTextIcon className="w-6 h-6" />}
                  {isVideo && <VideoIcon className="w-6 h-6" />}
                  {isAudio && <SpeakerLoudIcon className="w-6 h-6" />}
                  {!isImage && !isPdf && !isVideo && !isAudio && <FileTextIcon className="w-6 h-6" />}
                </div>
                <div className="min-w-0 space-y-1">
                  <h1 className="text-base sm:text-lg font-bold text-foreground truncate max-w-md">
                    {activeFileName}
                  </h1>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{formatFileSize(activeSize)}</span>
                    <span>•</span>
                    <span className="uppercase text-[10px] tracking-wider font-semibold bg-muted px-1.5 py-0.5 rounded">
                      {activeMimetype.split('/')[1] || activeMimetype}
                    </span>
                    {shareData?.expiresAt && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                          <ClockIcon className="w-3 h-3" />
                          Expires {new Date(shareData.expiresAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto">
                {allowDownload ? (
                  <a
                    href={downloadUrl}
                    download={activeFileName}
                    className="w-full sm:w-auto px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    <span>Download File</span>
                  </a>
                ) : (
                  <span className="w-full sm:w-auto px-4 py-2 bg-muted text-muted-foreground text-xs font-medium rounded-xl text-center">
                    View-Only Document
                  </span>
                )}
              </div>
            </div>

            {/* Document Viewer Preview Body */}
            <div className="p-6 bg-muted/5 flex items-center justify-center min-h-[420px]">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={streamUrl}
                  alt={activeFileName}
                  className="max-h-[600px] max-w-full rounded-xl object-contain shadow-lg border border-border/40"
                />
              ) : isPdf ? (
                <iframe
                  src={streamUrl}
                  title={activeFileName}
                  className="w-full h-[650px] rounded-xl border border-border/40 shadow-inner bg-card"
                />
              ) : isVideo ? (
                <video
                  src={streamUrl}
                  controls
                  className="max-h-[500px] max-w-full rounded-xl shadow-lg border border-border/40"
                />
              ) : isAudio ? (
                <div className="p-8 text-center space-y-4">
                  <SpeakerLoudIcon className="w-16 h-16 text-primary mx-auto opacity-70" />
                  <audio src={streamUrl} controls className="w-full max-w-md mx-auto" />
                </div>
              ) : (
                <div className="text-center py-16 space-y-4 max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
                    <FileTextIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{activeFileName}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Direct online preview is not available for this file format. You can download it directly below.
                    </p>
                  </div>
                  {allowDownload && (
                    <a
                      href={downloadUrl}
                      download={activeFileName}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:opacity-90 transition-all shadow-md shadow-primary/20"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      <span>Download {formatFileSize(activeSize)}</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Viewer Footer */}
            <div className="px-6 py-4 border-t border-border/60 bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircledIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified Cloud Transmission</span>
              </span>
              <span>Encrypted with VaultMind Security</span>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        <p>Powered by <strong className="text-foreground">VaultMind</strong> Intelligent Cloud Storage</p>
      </footer>
    </div>
  );
}

