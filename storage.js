/**
 * OneFill - Client-Side API & Storage Bridge
 * Connects frontend UI to the secure OneFill backend:
 * Handles authenticated API calls, session persistence, and document operations.
 */

class DocumentStorage {
  constructor() {
    this.currentUser = null;
    this.token = localStorage.getItem('onefill_auth_token') || null;
  }

  getHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async checkAuth() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        this.currentUser = data.user;
        return this.currentUser;
      }
      this.currentUser = null;
      return null;
    } catch (e) {
      this.currentUser = null;
      return null;
    }
  }

  async login(identifier, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    this.token = data.token;
    this.currentUser = data.user;
    localStorage.setItem('onefill_auth_token', data.token);
    return data.user;
  }

  async register(email, username, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    this.token = data.token;
    this.currentUser = data.user;
    localStorage.setItem('onefill_auth_token', data.token);
    return data.user;
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: this.getHeaders()
      });
    } catch (e) {}

    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('onefill_auth_token');
  }

  async getAllDocuments(filters = {}) {
    let url = '/api/documents';
    const params = new URLSearchParams();
    if (filters.category && filters.category !== 'ALL') {
      params.set('category', filters.category);
    }
    if (filters.search) {
      params.set('search', filters.search);
    }
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const res = await fetch(url, {
      headers: this.getHeaders()
    });

    if (res.status === 401) {
      return [];
    }

    if (!res.ok) {
      throw new Error('Failed to retrieve documents');
    }

    const data = await res.json();
    return data.documents || [];
  }

  async getDocument(docId) {
    const res = await fetch(`/api/documents/${docId}`, {
      headers: this.getHeaders()
    });

    if (res.status === 404 || res.status === 403) {
      return null;
    }

    if (!res.ok) {
      throw new Error('Failed to retrieve document metadata');
    }

    const data = await res.json();
    return data.document;
  }

  async saveDocument(metadata, file) {
    // Convert file to base64 for secure backend transit
    const fileBase64 = await this.fileToBase64(file);

    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        name: file.name,
        title: metadata.title,
        category: metadata.category,
        description: metadata.description,
        fileBase64: fileBase64,
        extractedText: metadata.extractedText,
        thumbnail: metadata.thumbnail
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to securely store document');
    }

    return data.document;
  }

  async updateDocumentCategory(docId, newCategory) {
    const res = await fetch(`/api/documents/${docId}/category`, {
      method: 'PATCH',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ category: newCategory })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update category');
    }

    return data.document;
  }

  async deleteDocument(docId) {
    const res = await fetch(`/api/documents/${docId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete document');
    }

    return true;
  }

  async downloadDocument(docId) {
    const res = await fetch(`/api/documents/${docId}/download`, {
      headers: this.getHeaders()
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Document download failed or access denied.');
    }

    const blob = await res.blob();
    const sha256 = res.headers.get('X-Document-SHA256');
    return { blob, sha256 };
  }

  async clearAll(password) {
    const res = await fetch('/api/documents/clear-all', {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to clear documents');
    }

    return true;
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        // Strip data URL header e.g. "data:application/pdf;base64,"
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }
}

window.docStorage = new DocumentStorage();
