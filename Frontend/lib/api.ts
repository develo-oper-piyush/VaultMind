// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

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
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'An error occurred');
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error');
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

  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    return fetch(`${this.baseURL}/files/upload-file`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }).then(res => res.json());
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
}

export const apiClient = new ApiClient(API_BASE_URL);
