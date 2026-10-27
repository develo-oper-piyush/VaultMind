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
  currentVersion?: number;
  totalVersions?: number;
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

// File Version History Types
export interface FileVersion {
  _id: string;
  fileId: string;
  versionNumber: number;
  originalName: string;
  size: number;
  mimetype: string;
  contentHash?: string;
  changeSummary?: string;
  summarySnapshot?: string | null;
  tagsSnapshot?: string[];
  createdBy?: string;
  createdAt: string;
}

export interface FileVersionsResponse {
  success: boolean;
  fileId: string;
  currentVersion: number;
  totalVersions: number;
  count: number;
  versions: FileVersion[];
}

export interface RestoreVersionResponse {
  success: boolean;
  message: string;
  version: FileVersion;
  file: {
    _id: string;
    currentVersion: number;
    totalVersions: number;
    originalName: string;
    size: number;
    mimetype: string;
    updatedAt: string;
  };
}

export interface UploadVersionResponse {
  success: boolean;
  message: string;
  version: FileVersion;
  file: {
    _id: string;
    currentVersion: number;
    totalVersions: number;
    originalName: string;
    size: number;
    mimetype: string;
    updatedAt: string;
  };
}

// Recycle Bin Types (Day 6)
export interface RecycleBinItem {
  _id: string;
  fileName: string;
  originalName: string;
  size: number;
  mimetype: string;
  category?: string;
  tags?: string[];
  summary?: string | null;
  isDeleted: boolean;
  deletedAt: string;
  deletionExpiresAt?: string | null;
  deletedBy?: string | null;
  daysRemaining: number;
  versionCount: number;
  originalFolder?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecycleBinResponse {
  success: boolean;
  count: number;
  files: RecycleBinItem[];
}

export interface RestoreTrashResponse {
  success: boolean;
  message: string;
  renamed?: boolean;
  restoredName?: string;
  alreadyActive?: boolean;
  file?: {
    _id: string;
    fileName: string;
    originalName: string;
    isDeleted: boolean;
    deletedAt: string | null;
    updatedAt: string;
  };
}

export interface PermanentlyDeleteResponse {
  success: boolean;
  message: string;
  deletedFileId: string;
  deletedStoragePaths?: string[];
}

export interface EmptyRecycleBinResponse {
  success: boolean;
  message: string;
  deletedCount: number;
  deletedFileIds: string[];
  deletedStoragePathsCount: number;
}
