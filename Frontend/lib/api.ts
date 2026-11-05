import type {
  Citation,
  ChatMessage,
  FileVersionsResponse,
  RestoreVersionResponse,
  UploadVersionResponse,
  RecycleBinResponse,
  RestoreTrashResponse,
  PermanentlyDeleteResponse,
  EmptyRecycleBinResponse,
} from '@/types';

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// API Client
class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies
    };

    try {
      const response = await fetch(url, config);
      const contentType = response.headers.get('content-type');

      let data: Record<string, unknown> = {};
      if (contentType && contentType.includes('application/json')) {
        data = (await response.json()) as Record<string, unknown>;
      } else {
        if (!response.ok) {
          throw new Error(`Backend server error (HTTP ${response.status}). Please check backend API server.`);
        }
        const text = await response.text();
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          data = { message: text };
        }
      }

      if (!response.ok) {
        throw new Error((data.error as string) || (data.message as string) || `Request failed with status ${response.status}`);
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error connecting to backend API');
    }
  }

  // Auth endpoints
  async register(username: string, email: string, password: string) {
    return this.request('/user/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, pass: password }),
    });
  }

  async login(username: string, password: string) {
    return this.request('/user/login', {
      method: 'POST',
      body: JSON.stringify({ username, pass: password }),
    });
  }

  async logout() {
    return this.request('/user/logout', {
      method: 'POST',
    });
  }

  async getProfile() {
    return this.request('/user/profile');
  }

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
    return this.request('/user/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
  }

  // File endpoints
  async getFiles() {
    return this.request('/files/home');
  }

  async uploadFile(file: File, allowDuplicate: boolean = false) {
    const formData = new FormData();
    formData.append('file', file);
    if (allowDuplicate) {
      formData.append('allowDuplicate', 'true');
    }

    const response = await fetch(`${this.baseURL}/files/upload-file`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const error = new Error(((data.error as string) || (data.message as string) || `Upload failed with status ${response.status}`)) as Error & { status?: number; data?: unknown };
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async checkDuplicate(payload: {
    originalName: string;
    size: number;
    mimetype?: string;
    category?: string;
    excludeFileId?: string;
  }) {
    return this.request<{
      success: boolean;
      isDuplicate: boolean;
      confidenceLevel: 'EXACT' | 'HIGH' | 'MODERATE' | 'NONE';
      highestScore: number;
      duplicates: Array<{
        fileId: string;
        fileName: string;
        originalName: string;
        size: number;
        mimetype: string;
        category?: string;
        createdAt?: string;
        similarityScore: number;
        confidenceLevel: string;
        reasons: string[];
      }>;
      message: string;
    }>('/files/check-duplicate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async scanDuplicates() {
    return this.request<{
      success: boolean;
      fileCount: number;
      duplicateGroupCount: number;
      duplicateGroups: Array<{
        primaryFile: Record<string, unknown>;
        duplicates: Array<Record<string, unknown>>;
        redundantCount: number;
        wastedBytes: number;
        formattedWastedBytes: string;
      }>;
      totalWastedBytes: number;
      formattedWastedBytes: string;
    }>('/files/duplicates');
  }

  async getSupportedFormats() {
    return this.request<{
      success: boolean;
      supportedDocumentExtensions: string[];
      maxFileSizeMB: number;
      maxFilesPerUser: number;
    }>('/files/supported-formats');
  }

  async deleteFile(fileName: string) {
    return this.request('/files/delete-file', {
      method: 'POST',
      body: JSON.stringify({ fileName }),
    });
  }

  async renameFile(oldFileName: string, newFileName: string) {
    return this.request('/files/rename-file', {
      method: 'POST',
      body: JSON.stringify({ oldFileName, newFileName }),
    });
  }

  async searchFiles(query: string) {
    return this.request('/files/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  async getFileStatus(fileId: string) {
    return this.request(`/files/file-status/${fileId}`);
  }

  getFileUrl(fileName: string) {
    return `${this.baseURL}/files/secure-file/${encodeURIComponent(fileName)}`;
  }

  // Recycle Bin Endpoints
  async getRecycleBin(): Promise<RecycleBinResponse> {
    return this.request<RecycleBinResponse>('/files/recycle-bin');
  }

  async restoreFileFromTrash(fileId: string): Promise<RestoreTrashResponse> {
    return this.request<RestoreTrashResponse>(`/files/recycle-bin/${encodeURIComponent(fileId)}/restore`, {
      method: 'POST',
    });
  }

  async permanentlyDeleteFile(fileId: string): Promise<PermanentlyDeleteResponse> {
    return this.request<PermanentlyDeleteResponse>(`/files/recycle-bin/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
  }

  async emptyRecycleBin(): Promise<EmptyRecycleBinResponse> {
    return this.request<EmptyRecycleBinResponse>('/files/recycle-bin/empty', {
      method: 'DELETE',
    });
  }

  async trashFile(fileId: string) {
    return this.request(`/files/${encodeURIComponent(fileId)}/trash`, {
      method: 'POST',
    });
  }

  // File Version History Endpoints (Day 5)
  async getFileVersions(fileId: string): Promise<FileVersionsResponse> {
    return this.request<FileVersionsResponse>(`/files/${encodeURIComponent(fileId)}/versions`);
  }

  async downloadFileVersion(
    fileId: string,
    versionId: string,
    fallbackFilename?: string
  ): Promise<{ blob: Blob; filename: string }> {
    const url = `${this.baseURL}/files/${encodeURIComponent(fileId)}/versions/${encodeURIComponent(versionId)}/download`;
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = `Failed to download version (HTTP ${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        const text = await response.text();
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }

    // Determine filename from Content-Disposition header if present
    let filename = fallbackFilename || 'download';
    const disposition = response.headers.get('content-disposition');
    if (disposition) {
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (utf8Match && utf8Match[1]) {
        try {
          filename = decodeURIComponent(utf8Match[1]);
        } catch {
          filename = utf8Match[1];
        }
      } else {
        const standardMatch = disposition.match(/filename="?([^";]+)"?/i);
        if (standardMatch && standardMatch[1]) {
          filename = standardMatch[1];
        }
      }
    }

    const blob = await response.blob();

    // Trigger browser download if running in client environment
    if (typeof window !== 'undefined') {
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    }

    return { blob, filename };
  }

  async restoreFileVersion(
    fileId: string,
    versionId: string,
    changeSummary?: string
  ): Promise<RestoreVersionResponse> {
    return this.request<RestoreVersionResponse>(
      `/files/${encodeURIComponent(fileId)}/versions/${encodeURIComponent(versionId)}/restore`,
      {
        method: 'POST',
        body: JSON.stringify({ changeSummary }),
      }
    );
  }

  async uploadFileVersion(
    fileId: string,
    file: File,
    changeSummary?: string
  ): Promise<UploadVersionResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (changeSummary) {
      formData.append('changeSummary', changeSummary);
    }

    const response = await fetch(
      `${this.baseURL}/files/${encodeURIComponent(fileId)}/versions`,
      {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || `Upload failed with status ${response.status}`);
    }

    return data as UploadVersionResponse;
  }

  // Ask VaultMind Document Chat Endpoints
  async askDocumentQuestion(payload: {
    question: string;
    conversationId?: string;
    fileFilters?: string[];
  }) {
    return this.request<{
      answer: string;
      citations: Citation[];
      conversationId: string;
      retrievedChunksCount: number;
      grounded: boolean;
    }>('/chat/ask', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getChatHistory(conversationId?: string) {
    const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
    return this.request<{
      messages: ChatMessage[];
      conversationId: string;
    }>(`/chat/history${query}`);
  }

  async clearChatHistory(conversationId?: string) {
    return this.request<{
      success: boolean;
      message: string;
    }>('/chat/clear', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
  }

  async getDocumentChunks(fileId: string) {
    return this.request<{
      chunks: Array<Record<string, unknown>>;
      totalChunks: number;
    }>(`/files/chunks/${fileId}`);
  }

  async retrieveChunks(payload: {
    query: string;
    fileFilters?: string[];
    topK?: number;
    minScore?: number;
  }) {
    return this.request<{
      success: boolean;
      query: string;
      totalFound: number;
      sufficientContext: boolean;
      chunks: Array<Record<string, unknown>>;
    }>('/files/retrieve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getConversations() {
    return this.request<{
      success: boolean;
      conversations: Array<{
        conversationId: string;
        lastMessage: string;
        updatedAt: string;
        messageCount: number;
      }>;
    }>('/chat/conversations');
  }

  // Share link endpoints
  async createShareLink(
    fileId: string,
    options: {
      expiresInHours?: number | null;
      password?: string | null;
      allowDownload?: boolean;
      maxViews?: number | null;
    }
  ) {
    return this.request<{
      success: boolean;
      message: string;
      share: {
        token: string;
        shareUrl: string;
        hasPassword: boolean;
        expiresAt: string | null;
        allowDownload: boolean;
        maxViews: number | null;
        viewsCount: number;
        createdAt: string;
      };
    }>(`/share/file/${fileId}`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async getFileShares(fileId: string) {
    return this.request<{
      success: boolean;
      shares: Array<{
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
      }>;
    }>(`/share/file/${fileId}`);
  }

  async revokeShareLink(token: string) {
    return this.request<{
      success: boolean;
      message: string;
    }>(`/share/${token}`, {
      method: 'DELETE',
    });
  }

  async getPublicShare(token: string) {
    return this.request<{
      success: boolean;
      data: {
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
      };
    }>(`/share/public/${token}`);
  }

  async verifySharePassword(token: string, password: string) {
    return this.request<{
      success: boolean;
      authorized: boolean;
      authToken?: string;
    }>(`/share/public/${token}/verify`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  getPublicShareStreamUrl(token: string, authToken?: string, download?: boolean) {
    const params = new URLSearchParams();
    if (authToken) params.append('auth', authToken);
    if (download) params.append('download', 'true');
    const qs = params.toString();
    return `${this.baseURL}/share/public/${token}/content${qs ? `?${qs}` : ''}`;
  }

  // OCR text extraction endpoint (quota-caching enabled)
  async extractOcr(fileId: string) {
    return this.request<{
      success: boolean;
      text: string;
      cached: boolean;
      wordCount: number;
      characterCount: number;
      file: {
        id: string;
        name: string;
        mimetype: string;
      };
    }>(`/files/${fileId}/ocr`, {
      method: 'POST',
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
