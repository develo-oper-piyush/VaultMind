export interface User {
  id: string;
  username: string;
  email: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
}

export interface FileItem {
  _id?: string;
  name: string;
  originalName?: string;
  fullPath?: string;
  url: string;
  createdAt: string;
  size: number;
  mimetype: string;
  tags?: string[];
  category?: string;
  summary?: string | null;
  chunkCount?: number;
  processingStatus?: {
    textExtracted: boolean;
    chunked?: boolean;
    indexed?: boolean;
    tagged: boolean;
    summarized: boolean;
    error?: string | null;
  };
}

export interface FilesResponse {
  files: FileItem[];
  user: User;
  fileCount: number;
  maxFiles: number;
  maxFileSize: number;
}

export interface SearchResult extends FileItem {
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface ApiError {
  error: string;
  message?: string;
}

// Ask VaultMind Feature Types
export interface Citation {
  documentName: string;
  fileId?: string;
  pageNumber?: number | null;
  chunkIndex?: number;
  excerpt: string;
  similarityScore?: number;
}

export interface DocumentChunk {
  _id?: string;
  fileId: string;
  fileName: string;
  originalName: string;
  chunkIndex: number;
  text: string;
  pageNumber?: number | null;
  charStart?: number;
  charEnd?: number;
  keywords?: string[];
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  createdAt?: string;
  fileFilters?: string[];
}

export interface ChatConversation {
  conversationId: string;
  messages: ChatMessage[];
  updatedAt: string;
}

export interface AskDocumentRequest {
  question: string;
  conversationId?: string;
  fileFilters?: string[]; // Optional specific file IDs/names to limit scope
}

export interface AskDocumentResponse {
  answer: string;
  citations: Citation[];
  conversationId: string;
  retrievedChunksCount: number;
  modelUsed?: string;
  grounded: boolean;
}
