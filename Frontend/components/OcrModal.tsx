'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { FileItem } from '@/types';
import {
  FileTextIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  Cross2Icon,
  ChatBubbleIcon,
  LightningBoltIcon,
  ReloadIcon,
} from '@radix-ui/react-icons';

interface OcrModalProps {
  isOpen: boolean;
  file: FileItem | null;
  onClose: () => void;
  onOpenChat?: (file: FileItem) => void;
}

export function OcrModal({ isOpen, file, onClose, onOpenChat }: OcrModalProps) {
  const [loading, setLoading] = useState(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isCached, setIsCached] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const performOcr = async () => {
    if (!file?._id) return;
    setLoading(true);
    setError('');

    try {
      const res = await apiClient.extractOcr(file._id);
      setExtractedText(res.text || '[No readable text detected]');
      setIsCached(res.cached);
      setWordCount(res.wordCount || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR extraction failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && file?._id) {
      setCopied(false);
      setError('');
      // If file already has cached textContent, display immediately to save API load
      const cached = file.ocrText || file.textContent;
      if (cached && cached.trim().length > 0) {
        setExtractedText(cached);
        setIsCached(true);
        setWordCount(cached.trim().split(/\s+/).filter(Boolean).length);
        setLoading(false);
      } else {
        void performOcr();
      }
    }
  }, [isOpen, file?._id]);

  if (!isOpen || !file) return null;

  const handleCopy = () => {
    void navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(file.originalName || file.name).replace(/\.[^/.]+$/, '')}_ocr.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <FileTextIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">OCR Text Intelligence</h2>
                {isCached ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    <LightningBoltIcon className="w-3 h-3" /> Cached (0 API calls)
                  </span>
                ) : (
                  <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Gemini 3.5 Flash-Lite
                  </span>
                )}
              </div>
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
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
              <div className="text-sm font-semibold text-foreground">Extracting visual text...</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Running multimodal OCR analysis with quota optimization. Results will be cached permanently in your vault.
              </p>
            </div>
          ) : (
            <>
              {/* Text Meta Bar */}
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-1">
                <div className="flex items-center gap-3">
                  <span>Words: <strong className="text-foreground">{wordCount}</strong></span>
                  <span>•</span>
                  <span>Characters: <strong className="text-foreground">{extractedText.length}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={performOcr}
                    className="p-1.5 hover:text-foreground hover:bg-accent rounded-lg transition-colors text-muted-foreground"
                    title="Re-run OCR"
                  >
                    <ReloadIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-2.5 py-1 bg-muted hover:bg-accent text-foreground rounded-lg font-medium flex items-center gap-1.5 transition-colors"
                  >
                    {copied ? (
                      <>
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTxt}
                    className="px-2.5 py-1 bg-muted hover:bg-accent text-foreground rounded-lg font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <DownloadIcon className="w-3.5 h-3.5" />
                    <span>Download .txt</span>
                  </button>
                </div>
              </div>

              {/* Text Container */}
              <div className="relative">
                <textarea
                  readOnly
                  value={extractedText}
                  rows={14}
                  className="w-full p-4 bg-muted/20 border border-border/80 rounded-xl text-foreground text-xs font-mono leading-relaxed focus:outline-none resize-none select-all"
                  placeholder="No text extracted."
                />
              </div>

              <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-foreground">
                  <ChatBubbleIcon className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>This text is now indexed and ready for grounded AI Q&A.</span>
                </div>
                {onOpenChat && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenChat(file);
                    }}
                    className="px-3 py-1.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 flex-shrink-0 transition-opacity"
                  >
                    Ask VaultMind
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/60 bg-muted/20 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-card border border-border/80 hover:bg-accent text-foreground text-xs font-semibold rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
