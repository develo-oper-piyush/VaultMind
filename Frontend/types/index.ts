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
  processingStatus?: {
    textExtracted: boolean;
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
