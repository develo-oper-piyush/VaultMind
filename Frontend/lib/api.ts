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

      let data: any;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        if (!response.ok) {
          throw new Error(`Backend server error (HTTP ${response.status}). Please check backend API server.`);
        }
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
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

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error: any = new Error(data.error || data.message || `Upload failed with status ${response.status}`);
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
        primaryFile: any;
        duplicates: any[];
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

  // Ask VaultMind Document Chat Endpoints
  async askDocumentQuestion(payload: {
    question: string;
    conversationId?: string;
    fileFilters?: string[];
  }) {
    return this.request<{
      answer: string;
      citations: any[];
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
      messages: any[];
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
      chunks: any[];
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
      chunks: any[];
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
}

export const apiClient = new ApiClient(API_BASE_URL);
