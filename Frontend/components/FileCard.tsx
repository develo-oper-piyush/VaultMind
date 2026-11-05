'use client';

import * as React from "react";
import { cn } from "@/lib/utils";
import { FileItem } from "@/types";
import { apiClient } from "@/lib/api";
import {
  DotsVerticalIcon,
  TrashIcon,
  ReaderIcon,
  FileTextIcon,
  ImageIcon,
  VideoIcon,
  SpeakerLoudIcon,
  ArchiveIcon,
  ArrowRightIcon,
  CounterClockwiseClockIcon,
  ChatBubbleIcon,
  Share1Icon,
  Pencil1Icon,
} from "@radix-ui/react-icons";

interface FileCardProps extends React.HTMLAttributes<HTMLDivElement> {
  file: FileItem;
  isProcessing?: boolean;
  onDelete: (fileName: string) => void;
  onChat?: (file: FileItem) => void;
  onOpenVersionHistory?: (file: FileItem) => void;
  onShare?: (file: FileItem) => void;
  onOcr?: (file: FileItem) => void;
  onRename?: (file: FileItem) => void;
  onTagClick?: (tag: string) => void;
}

const FileCard = React.forwardRef<HTMLDivElement, FileCardProps>(
  ({ className, file, isProcessing = false, onDelete, onChat, onOpenVersionHistory, onShare, onOcr, onRename, onTagClick, ...props }, ref) => {
    const isImage = React.useMemo(() => {
      if (!file.mimetype) return /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(file.name);
      return file.mimetype.startsWith("image/");
    }, [file]);

    const isVideo = React.useMemo(() => file.mimetype?.startsWith("video/"), [file]);
    const isAudio = React.useMemo(() => file.mimetype?.startsWith("audio/"), [file]);
    const isDocument = React.useMemo(() => {
      return (
        file.mimetype?.includes("pdf") ||
        file.mimetype?.includes("document") ||
        file.mimetype?.includes("text") ||
        file.mimetype?.includes("word") ||
        file.mimetype?.includes("excel") ||
        /\.(pdf|doc|docx|txt|xls|xlsx|ppt|pptx)$/i.test(file.name)
      );
    }, [file]);

    // Determine HSL theme color based on file type / category
    const themeColor = React.useMemo(() => {
      if (isImage) return "155 65% 25%"; // Deep vibrant emerald green for images
      if (isDocument) return "220 70% 22%"; // Deep royal blue/indigo for documents
      if (isVideo || isAudio) return "275 60% 24%"; // Deep purple/magenta for media
      if (file.category === "Invoice") return "35 80% 24%"; // Amber gold for invoices
      if (file.category === "Contract") return "180 60% 22%"; // Deep teal for contracts
      return "200 50% 22%"; // Dark cyan/slate for general files
    }, [isImage, isDocument, isVideo, isAudio, file.category]);

    const fileUrl = React.useMemo(() => {
      let rawUrl = file.url;
      if (rawUrl && rawUrl.includes("localhost:5000")) {
        rawUrl = rawUrl.replace("localhost:5000", "localhost:3000");
      }
      let url = rawUrl?.startsWith("http") ? rawUrl : apiClient.getFileUrl(file.name);
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("token");
        if (token && !url.includes("token=")) {
          url += (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
        }
      }
      return url;
    }, [file]);

    const handleCardClick = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.dropdown')) {
        return;
      }
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDelete(file.name);
    };

    const formattedSize = (file.size / 1024).toFixed(1) + " KB";

    return (
      <div
        ref={ref}
        style={
          {
            "--theme-color": themeColor,
            boxShadow: `0 0 40px -15px hsl(var(--theme-color) / 0.45)`,
          } as React.CSSProperties
        }
        onClick={handleCardClick}
        className={cn(
          "group relative w-full rounded-2xl overflow-hidden shadow-lg transition-all duration-500 ease-in-out group-hover:scale-105 group-hover:shadow-[0_0_60px_-15px_hsl(var(--theme-color)/0.6)] border border-border/40 flex flex-col justify-between min-h-[320px] cursor-pointer",
          className
        )}
        {...props}
      >
        {/* Background Layer: Parallax Image for Image files, Gradient for Non-Image files */}
        {isImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-110"
            style={{ backgroundImage: `url(${fileUrl})` }}
          />
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-br from-card via-card/90 to-[hsl(var(--theme-color)/0.35)] transition-all duration-500 group-hover:scale-105"
          />
        )}

        {/* Themed Gradient Overlay for contrast and readability */}
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            background: isImage
              ? `linear-gradient(to top, hsl(var(--theme-color) / 0.95), hsl(var(--theme-color) / 0.65) 40%, hsl(var(--theme-color) / 0.25) 75%, transparent)`
              : `linear-gradient(to top, hsl(var(--theme-color) / 0.8), transparent 80%)`,
          }}
        />

        {/* Card Header Content */}
        <div className="relative z-10 p-6 flex flex-col justify-between h-full">
          <div>
            {/* Top Badges */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                {isProcessing ? (
                  <span className="text-[11px] bg-primary/20 backdrop-blur-md border border-primary/40 text-primary px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                    AI Processing...
                  </span>
                ) : (
                  <span className="text-[11px] bg-black/40 backdrop-blur-md text-white/90 border border-white/20 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    {isImage && <ImageIcon className="w-3 h-3 text-emerald-400" />}
                    {isDocument && <FileTextIcon className="w-3 h-3 text-blue-400" />}
                    {isVideo && <VideoIcon className="w-3 h-3 text-purple-400" />}
                    {isAudio && <SpeakerLoudIcon className="w-3 h-3 text-pink-400" />}
                    {!isImage && !isDocument && !isVideo && !isAudio && (
                      <ArchiveIcon className="w-3 h-3 text-cyan-400" />
                    )}
                    <span>{formattedSize}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {file._id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenVersionHistory?.(file);
                    }}
                    className="text-[11px] bg-black/40 backdrop-blur-md text-white/90 border border-white/20 hover:border-primary/60 hover:bg-black/60 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 transition-all"
                    title={`Version ${file.currentVersion || 1} (Click to view history)`}
                  >
                    <CounterClockwiseClockIcon className="w-3 h-3 text-primary" />
                    <span>v{file.currentVersion || 1}</span>
                  </button>
                )}

                {file.category && file.category !== "Other" && (
                  <span className="text-[11px] bg-[hsl(var(--theme-color)/0.4)] backdrop-blur-md text-white border border-white/20 px-2.5 py-1 rounded-full font-semibold">
                    {file.category}
                  </span>
                )}
              </div>
            </div>

            {/* File Name & Document Status Badge */}
            <div className="flex items-center gap-2 mb-2">
              <h3
                className="text-xl font-bold tracking-tight text-white drop-shadow-md truncate group-hover:text-white transition-colors flex-1"
                title={file.originalName || file.name}
              >
                {file.originalName || file.name}
              </h3>
              {isDocument && (
                <span className="text-[10px] bg-blue-500/25 border border-blue-400/40 text-blue-200 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                  {file.chunkCount ? `${file.chunkCount} chunks` : 'Document'}
                </span>
              )}
            </div>

            {/* Tags */}
            {file.tags && file.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {file.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={(e) => {
                      if (onTagClick) {
                        e.stopPropagation();
                        onTagClick(tag);
                      }
                    }}
                    className={cn(
                      'text-[10px] bg-black/30 backdrop-blur-md border border-white/15 text-white/90 px-2 py-0.5 rounded-md font-medium transition-colors',
                      onTagClick && 'hover:bg-primary/30 hover:border-primary/50 cursor-pointer'
                    )}
                    title={onTagClick ? `Filter by #${tag}` : undefined}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {/* AI Summary */}
            {file.summary && (
              <div className="p-3.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 text-xs text-white/85 italic mb-4 line-clamp-3 leading-relaxed flex items-start gap-2 shadow-inner">
                <ReaderIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-300" />
                <span>{file.summary}</span>
              </div>
            )}
          </div>

          {/* Bottom Bar: View Now button & DaisyUI Dropdown */}
          <div className="mt-6 flex items-center gap-3 pt-2">
            {/* View / Open Now Button */}
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-between bg-[hsl(var(--theme-color)/0.3)] backdrop-blur-md border border-white/20 text-white rounded-xl px-4 py-3 transition-all duration-300 group-hover:bg-[hsl(var(--theme-color)/0.5)] group-hover:border-white/40 shadow-md"
            >
              <span className="text-xs font-semibold tracking-wide">View Now</span>
              <ArrowRightIcon className="h-4 w-4 transform transition-transform duration-300 group-hover:translate-x-1" />
            </a>

            {/* DaisyUI Menu Options Dropdown */}
            <div className="dropdown dropdown-top dropdown-end">
              <div
                tabIndex={0}
                role="button"
                className="btn btn-square btn-sm border border-white/20 bg-black/40 backdrop-blur-md hover:bg-black/60 text-white rounded-xl flex items-center justify-center shadow-md"
                title="More Options"
                onClick={(e) => e.stopPropagation()}
              >
                <DotsVerticalIcon className="w-4 h-4" />
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-card/95 backdrop-blur-2xl border border-border/80 rounded-xl z-30 w-48 p-2 shadow-2xl space-y-1 text-xs text-foreground"
              >
                <li>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(fileUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="flex items-center gap-2 py-2 font-medium hover:text-primary transition-colors"
                  >
                    <ArrowRightIcon className="w-3.5 h-3.5 text-primary" />
                    <span>Open / Preview</span>
                  </button>
                </li>
                {onRename && (
                  <li>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRename(file);
                      }}
                      className="flex items-center gap-2 py-2 font-medium hover:text-primary transition-colors"
                    >
                      <Pencil1Icon className="w-3.5 h-3.5 text-primary" />
                      <span>Rename...</span>
                    </button>
                  </li>
                )}
                {file._id && onOpenVersionHistory && (
                  <li>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenVersionHistory(file);
                      }}
                      className="flex items-center gap-2 py-2 font-medium hover:text-primary transition-colors"
                    >
                      <CounterClockwiseClockIcon className="w-3.5 h-3.5 text-primary" />
                      <span>Version History</span>
                    </button>
                  </li>
                )}
                {file._id && onShare && (
                  <li>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onShare(file);
                      }}
                      className="flex items-center gap-2 py-2 font-medium hover:text-primary transition-colors"
                    >
                      <Share1Icon className="w-3.5 h-3.5 text-primary" />
                      <span>Share Link...</span>
                    </button>
                  </li>
                )}
                {(isImage || isDocument) && file._id && onOcr && (
                  <li>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOcr(file);
                      }}
                      className="flex items-center gap-2 py-2 font-medium hover:text-primary transition-colors"
                    >
                      <FileTextIcon className="w-3.5 h-3.5 text-primary" />
                      <span>Extract Text (OCR)</span>
                    </button>
                  </li>
                )}
                {isDocument && onChat && (
                  <li>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onChat(file);
                      }}
                      className="text-primary hover:text-primary font-medium flex items-center gap-2 py-2"
                    >
                      <ChatBubbleIcon className="w-3.5 h-3.5" />
                      <span>Ask VaultMind</span>
                    </button>
                  </li>
                )}
                <li>
                  <button
                    onClick={handleDelete}
                    className="text-destructive font-semibold flex items-center gap-2 py-2 hover:bg-destructive/10 rounded-lg px-2 transition-colors w-full"
                    title="Move to Recycle Bin (30-day retention)"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    <span>Move to Trash</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
FileCard.displayName = "FileCard";

export { FileCard };
