'use client';

import * as React from 'react';
import {
  ChatBubbleIcon,
  Cross2Icon,
  ResetIcon,
  PaperPlaneIcon,
  FileTextIcon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
  MagicWandIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@radix-ui/react-icons';
import { apiClient } from '@/lib/api';
import { FileItem, ChatMessage } from '@/types';

export interface AskVaultMindModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileItem[];
  initialSelectedFile?: FileItem | null;
}

const SUGGESTED_QUESTIONS = [
  "What are the main topics across my documents?",
  "Summarize key deadlines, dates, or action items.",
  "What financial numbers or revenue figures are mentioned?",
  "Give me an executive summary of the uploaded files.",
];

export function AskVaultMindModal({
  isOpen,
  onClose,
  files,
  initialSelectedFile = null,
}: AskVaultMindModalProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = React.useState('');
  const [conversationId, setConversationId] = React.useState<string>(() => `conv-${Date.now()}`);
  const [selectedFileId, setSelectedFileId] = React.useState<string>(
    () => initialSelectedFile?._id || initialSelectedFile?.name || 'all'
  );
  const [prevInitialFile, setPrevInitialFile] = React.useState(initialSelectedFile);
  if (initialSelectedFile !== prevInitialFile) {
    setPrevInitialFile(initialSelectedFile);
    setSelectedFileId(initialSelectedFile?._id || initialSelectedFile?.name || 'all');
  }

  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedCitationIndex, setExpandedCitationIndex] = React.useState<string | null>(null);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Auto-scroll to bottom of conversation
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const handleSend = async (questionToSend?: string) => {
    const question = (questionToSend || inputValue).trim();
    if (!question || isLoading) return;

    setError(null);
    setInputValue('');

    const userMessage: ChatMessage = {
      role: 'user',
      content: question,
      createdAt: new Date().toISOString(),
      fileFilters: selectedFileId !== 'all' ? [selectedFileId] : [],
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await apiClient.askDocumentQuestion({
        question,
        conversationId,
        fileFilters: selectedFileId !== 'all' ? [selectedFileId] : undefined,
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.answer,
        citations: response.citations || [],
        createdAt: new Date().toISOString(),
      };

      if (response.conversationId) {
        setConversationId(response.conversationId);
      }

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to retrieve answer from VaultMind.';
      setError(errorMsg);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Sorry, an error occurred while processing your question: ${errorMsg}`,
        citations: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleResetConversation = async () => {
    if (messages.length === 0) return;
    try {
      await apiClient.clearChatHistory(conversationId);
    } catch (err) {
      console.warn("Could not clear history on server:", err);
    }
    setMessages([]);
    setConversationId(`conv-${Date.now()}`);
    setError(null);
    setExpandedCitationIndex(null);
  };

  const toggleCitation = (citationKey: string) => {
    setExpandedCitationIndex((prev) => (prev === citationKey ? null : citationKey));
  };

  // Only consider supported document formats for Ask VaultMind
  const documentFiles = files.filter((f) => {
    const isDoc =
      f.mimetype?.includes('pdf') ||
      f.mimetype?.includes('document') ||
      f.mimetype?.includes('text') ||
      f.mimetype?.includes('word') ||
      f.mimetype?.includes('csv') ||
      /\.(pdf|docx|doc|txt|md|csv)$/i.test(f.name);
    return isDoc;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div
        className="w-full max-w-4xl h-[90vh] max-h-[860px] bg-card border border-border/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-vaultmind-title"
      >
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-border/70 bg-card/60 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary/30 to-emerald-400/20 border border-primary/40 flex items-center justify-center text-primary shadow-sm shadow-primary/20">
              <MagicWandIcon className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="ask-vaultmind-title" className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                  Ask VaultMind
                </h2>
                <span className="text-[10px] bg-primary/20 border border-primary/40 text-primary font-bold px-2 py-0.5 rounded-full">
                  AI Grounded
                </span>
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Chat with your documents grounded strictly in verified evidence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Document Scope Filter Selector */}
            <div className="relative">
              <select
                aria-label="Document Scope Filter"
                value={selectedFileId}
                onChange={(e) => setSelectedFileId(e.target.value)}
                className="select select-bordered select-sm bg-accent/60 border-border/80 text-foreground text-xs rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer max-w-[170px] sm:max-w-[240px] truncate"
              >
                <option value="all">Scope: All Documents ({documentFiles.length})</option>
                {documentFiles.map((f) => (
                  <option key={f._id || f.name} value={f._id || f.name}>
                    {f.originalName || f.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>

            {/* Clear Conversation Button */}
            <button
              onClick={handleResetConversation}
              disabled={messages.length === 0 || isLoading}
              title="Start a new chat session"
              className="p-2 rounded-xl bg-accent/60 border border-border/80 hover:bg-accent text-muted-foreground hover:text-foreground text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <ResetIcon className="w-4 h-4" />
              <span className="hidden sm:inline">New Chat</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-accent/60 border border-border/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground flex items-center justify-center transition-all"
            >
              <Cross2Icon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conversation Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-gradient-to-b from-card/30 to-background/50">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                {error}
              </span>
              <button onClick={() => setError(null)} className="font-bold underline hover:no-underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Empty Conversation State */}
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center py-8 px-4">
              <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mb-4 shadow-xl shadow-primary/10">
                <ChatBubbleIcon className="w-8 h-8 opacity-90" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                Chat with Your Workspace Documents
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mb-6 leading-relaxed">
                Ask questions about your uploaded PDFs, Word documents, text notes, and spreadsheets.
                Answers are grounded in retrieved excerpts with verified page and section citations.
              </p>

              {/* Suggested Questions */}
              <div className="w-full max-w-xl space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Suggested Prompts
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                  {SUGGESTED_QUESTIONS.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(q)}
                      className="p-3 bg-card/60 hover:bg-accent border border-border/80 hover:border-primary/40 rounded-2xl text-xs text-foreground transition-all flex items-start gap-2 shadow-sm group"
                    >
                      <MagicWandIcon className="w-3.5 h-3.5 text-primary mt-0.5 group-hover:scale-110 transition-transform flex-shrink-0" />
                      <span className="line-clamp-2">{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages Stream */}
          {messages.map((msg, msgIdx) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msgIdx}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-md ${
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-card/90 border border-border/80 text-foreground rounded-bl-sm'
                  }`}
                >
                  {/* Sender label */}
                  <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold opacity-75">
                    {isUser ? (
                      <span>You</span>
                    ) : (
                      <span className="flex items-center gap-1 text-primary">
                        <MagicWandIcon className="w-3 h-3" />
                        <span>VaultMind AI</span>
                      </span>
                    )}
                  </div>

                  {/* Message body */}
                  <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>

                  {/* Evidence Citations Drawer */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary mb-2">
                        <CheckCircledIcon className="w-3.5 h-3.5" />
                        <span>Verified Citations ({msg.citations.length})</span>
                      </div>

                      <div className="space-y-1.5">
                        {msg.citations.map((citation, citIdx) => {
                          const citationKey = `${msgIdx}-${citIdx}`;
                          const isExpanded = expandedCitationIndex === citationKey;

                          return (
                            <div
                              key={citIdx}
                              className="rounded-xl border border-border/60 bg-accent/40 overflow-hidden text-xs transition-all"
                            >
                              <button
                                onClick={() => toggleCitation(citationKey)}
                                className="w-full p-2.5 flex items-center justify-between text-left hover:bg-accent/80 transition-colors"
                              >
                                <div className="flex items-center gap-2 truncate pr-2">
                                  <FileTextIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                  <span className="font-semibold text-foreground truncate">
                                    {citation.documentName}
                                  </span>
                                  {citation.pageNumber && (
                                    <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0">
                                      Page {citation.pageNumber}
                                    </span>
                                  )}
                                  {citation.similarityScore && (
                                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                      Match: {(citation.similarityScore * 100).toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                                {isExpanded ? (
                                  <ChevronUpIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <ChevronDownIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                )}
                              </button>

                              {isExpanded && (
                                <div className="p-3 bg-black/40 border-t border-border/40 text-[11px] font-mono leading-relaxed text-muted-foreground italic">
                                  &ldquo;{citation.excerpt}&rdquo;
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-start max-w-[85%] sm:max-w-[75%]">
              <div className="bg-card/90 border border-border/80 text-foreground rounded-2xl rounded-bl-sm p-4 shadow-md space-y-2">
                <div className="flex items-center gap-2 text-xs text-primary font-semibold">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                  <span>Searching document chunks & generating grounded response...</span>
                </div>
                <div className="flex gap-1.5 items-center py-1">
                  <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 border-t border-border/70 bg-card/70 flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                placeholder={
                  selectedFileId === 'all'
                    ? "Ask a question about all uploaded documents..."
                    : `Ask about selected document...`
                }
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="w-full bg-accent/50 border border-input focus:border-primary rounded-2xl pl-4 pr-10 py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-inner disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="p-3 bg-primary text-primary-foreground hover:opacity-90 rounded-2xl transition-all shadow-md shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0"
              title="Send question"
            >
              <PaperPlaneIcon className="w-4 h-4" />
            </button>
          </form>
          <div className="flex justify-between items-center text-[10px] text-muted-foreground px-2 pt-2">
            <span>Press Enter to send. Strictly grounded in uploaded files.</span>
            <span>
              Target: {selectedFileId === 'all' ? 'All Workspace Files' : 'Filtered File'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
