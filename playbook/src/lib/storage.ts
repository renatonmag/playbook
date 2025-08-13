import type { Document, Block } from "../types/document";

const STORAGE_KEY = "playbook_documents";
const CURRENT_DOCUMENT_KEY = "playbook_current_document";

export interface StorageError {
  message: string;
  code: string;
  originalError?: Error;
}

// Document storage operations
export const saveDocument = (document: Document): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const documents = getAllDocuments();
      const existingIndex = documents.findIndex(
        (doc) => doc.id === document.id
      );

      if (existingIndex >= 0) {
        documents[existingIndex] = document;
      } else {
        documents.push(document);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
      resolve();
    } catch (error) {
      const storageError: StorageError = {
        message: "Failed to save document",
        code: "SAVE_ERROR",
        originalError: error as Error,
      };
      reject(storageError);
    }
  });
};

export const loadDocument = (documentId: string): Promise<Document | null> => {
  return new Promise((resolve, reject) => {
    try {
      const documents = getAllDocuments();
      const document = documents.find((doc) => doc.id === documentId) || null;
      resolve(document);
    } catch (error) {
      const storageError: StorageError = {
        message: "Failed to load document",
        code: "LOAD_ERROR",
        originalError: error as Error,
      };
      reject(storageError);
    }
  });
};

export const deleteDocument = (documentId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const documents = getAllDocuments();
      const filteredDocuments = documents.filter(
        (doc) => doc.id !== documentId
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredDocuments));
      resolve();
    } catch (error) {
      const storageError: StorageError = {
        message: "Failed to delete document",
        code: "DELETE_ERROR",
        originalError: error as Error,
      };
      reject(storageError);
    }
  });
};

export const getAllDocuments = (): Document[] => {
  try {
    const documentsJson = localStorage.getItem(STORAGE_KEY);
    if (!documentsJson) return [];

    const documents = JSON.parse(documentsJson);
    return Array.isArray(documents) ? documents : [];
  } catch (error) {
    console.error("Error parsing documents from localStorage:", error);
    return [];
  }
};

// Current document operations
export const saveCurrentDocument = (document: Document): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      localStorage.setItem(CURRENT_DOCUMENT_KEY, JSON.stringify(document));
      resolve();
    } catch (error) {
      const storageError: StorageError = {
        message: "Failed to save current document",
        code: "CURRENT_SAVE_ERROR",
        originalError: error as Error,
      };
      reject(storageError);
    }
  });
};

export const loadCurrentDocument = (): Promise<Document | null> => {
  return new Promise((resolve, reject) => {
    try {
      const documentJson = localStorage.getItem(CURRENT_DOCUMENT_KEY);
      if (!documentJson) {
        resolve(null);
        return;
      }

      const document = JSON.parse(documentJson);
      resolve(document);
    } catch (error) {
      const storageError: StorageError = {
        message: "Failed to load current document",
        code: "CURRENT_LOAD_ERROR",
        originalError: error as Error,
      };
      reject(storageError);
    }
  });
};

// Block storage operations
export const saveBlocks = (
  documentId: string,
  blocks: Block[]
): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const document = getAllDocuments().find((doc) => doc.id === documentId);
      if (!document) {
        reject({
          message: "Document not found",
          code: "DOCUMENT_NOT_FOUND",
        });
        return;
      }

      document.blocks = blocks;
      document.updatedAt = new Date();
      document.version += 1;

      saveDocument(document).then(resolve).catch(reject);
    } catch (error) {
      const storageError: StorageError = {
        message: "Failed to save blocks",
        code: "BLOCKS_SAVE_ERROR",
        originalError: error as Error,
      };
      reject(storageError);
    }
  });
};

export const loadBlocks = (documentId: string): Promise<Block[]> => {
  return new Promise((resolve, reject) => {
    try {
      const document = getAllDocuments().find((doc) => doc.id === documentId);
      if (!document) {
        reject({
          message: "Document not found",
          code: "DOCUMENT_NOT_FOUND",
        });
        return;
      }

      resolve(document.blocks);
    } catch (error) {
      const storageError: StorageError = {
        message: "Failed to load blocks",
        code: "BLOCKS_LOAD_ERROR",
        originalError: error as Error,
      };
      reject(storageError);
    }
  });
};

// Utility functions
export const clearAllData = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CURRENT_DOCUMENT_KEY);
      resolve();
    } catch (error) {
      const storageError: StorageError = {
        message: "Failed to clear data",
        code: "CLEAR_ERROR",
        originalError: error as Error,
      };
      reject(storageError);
    }
  });
};

export const getStorageSize = (): number => {
  try {
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += key.length + value.length;
        }
      }
    }
    return totalSize;
  } catch (error) {
    console.error("Error calculating storage size:", error);
    return 0;
  }
};
