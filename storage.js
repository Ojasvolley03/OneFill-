/**
 * OneFill - Persistent IndexedDB Storage Engine
 * Stores user-uploaded documents, extracted OCR text, thumbnails, and classification tags.
 */

const DB_NAME = 'OneFillDB';
const DB_VERSION = 2;
const STORE_NAME = 'documents';

class DocumentStorage {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('OneFill IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async saveDocument(doc) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(doc);

      request.onsuccess = () => resolve(doc);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async updateDocumentCategory(id, newCategory) {
    await this.init();
    const doc = await this.getDocument(id);
    if (!doc) throw new Error('Document not found');
    
    doc.category = newCategory;
    doc.isUserCorrected = true;
    doc.updatedAt = new Date().toISOString();
    return await this.saveDocument(doc);
  }

  async getAllDocuments() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        // Sort newest first
        const docs = request.result || [];
        docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(docs);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getDocument(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteDocument(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async clearAll() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }
}

window.docStorage = new DocumentStorage();
