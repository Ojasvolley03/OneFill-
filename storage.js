/**
 * DocVault AI - IndexedDB Storage Engine
 * Provides persistent local storage for documents and file blobs.
 */

const DB_NAME = 'DocVaultDB';
const DB_VERSION = 1;
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
        console.error('IndexedDB error:', event.target.error);
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

  async seedInitialDataIfEmpty() {
    const docs = await this.getAllDocuments();
    if (docs.length > 0) return;

    // Create 3 realistic sample initial documents
    const sampleDocs = [
      {
        id: 'sample-doc-1',
        name: 'AI_Architecture_Overview.pdf',
        title: 'AI Architecture Overview & Specifications',
        category: 'Technical',
        description: 'System specifications and pipeline design for upcoming AI analysis modules.',
        size: 1024 * 342, // ~342 KB
        type: 'application/pdf',
        createdAt: new Date(Date.now() - 3600 * 1000 * 24 * 2).toISOString(),
        fileBlob: new Blob(['%PDF-1.4 Mock Document Content: DocVault Architecture Specification v1.0'], { type: 'application/pdf' })
      },
      {
        id: 'sample-doc-2',
        name: 'Q3_Financial_Audit_Summary.csv',
        title: 'Q3 Financial Audit Summary',
        category: 'Financial',
        description: 'Consolidated quarterly balance sheet and departmental budget allocations.',
        size: 1024 * 84, // ~84 KB
        type: 'text/csv',
        createdAt: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
        fileBlob: new Blob(['Department,Budget,Actual,Variance\nEngineering,450000,432000,-18000\nOperations,120000,118500,-1500\nDesign,85000,82000,-3000\nSecurity,95000,94000,-1000'], { type: 'text/csv' })
      },
      {
        id: 'sample-doc-3',
        name: 'Service_Level_Agreement_Draft.txt',
        title: 'Enterprise Service Agreement Draft',
        category: 'Legal',
        description: 'Initial draft of service level agreements and data custody terms.',
        size: 1024 * 16, // ~16 KB
        type: 'text/plain',
        createdAt: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
        fileBlob: new Blob(['DocVault Enterprise SLA\n\n1. Purpose and Scope\nThis Service Level Agreement governs the storage, retention, and collection of user-submitted enterprise documents.\n\n2. Data Custody\nAll documents are encrypted at rest and indexed with strict access barriers.\n\n3. Future Automation Readiness\nDocuments ingested during collection are tagged for downstream intelligence pipelines.'], { type: 'text/plain' })
      }
    ];

    for (const doc of sampleDocs) {
      await this.saveDocument(doc);
    }
  }
}

window.docStorage = new DocumentStorage();
