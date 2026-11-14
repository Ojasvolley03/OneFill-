/**
 * OneFill - Document Text Extractor & OCR Engine
 * Extracts readable text from images (via Tesseract.js OCR), PDFs (via PDF.js),
 * Word documents (via JSZip / XML parsing), and text files.
 */

class DocumentExtractor {
  /**
   * Extract readable text and generate thumbnail preview.
   * @param {File} file - Uploaded File object
   * @param {Function} onProgress - Progress status callback (message, percent)
   * @returns {Promise<{ text: string, thumbnail: string|null, pageCount: number, method: string }>}
   */
  static async extract(file, onProgress = () => {}) {
    const filename = file.name.toLowerCase();
    const mimeType = file.type;

    try {
      // 1. Image Files (PNG, JPG, WEBP, BMP, GIF) -> Tesseract OCR
      if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(filename)) {
        return await this.extractFromImage(file, onProgress);
      }

      // 2. PDF Documents -> PDF.js
      if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
        return await this.extractFromPDF(file, onProgress);
      }

      // 3. Word Documents (.docx) -> JSZip XML extraction
      if (filename.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
        return await this.extractFromDocx(file, onProgress);
      }

      // 4. Plain Text, CSV, JSON, Markdown, Code
      if (
        mimeType.startsWith('text/') ||
        mimeType.includes('json') ||
        mimeType.includes('csv') ||
        /\.(txt|md|csv|json|xml|html|log|rtf)$/i.test(filename)
      ) {
        return await this.extractFromText(file, onProgress);
      }

      // 5. Unsupported binary file fallback
      onProgress('Scanning metadata for unsupported format...', 80);
      return {
        text: filename.replace(/[-_.]/g, ' '),
        thumbnail: null,
        pageCount: 1,
        method: 'Metadata Fallback'
      };
    } catch (err) {
      console.warn('Extraction warning, using graceful fallback:', err);
      return {
        text: filename.replace(/[-_.]/g, ' '),
        thumbnail: null,
        pageCount: 1,
        method: 'Graceful Fallback'
      };
    }
  }

  /**
   * Generate a persistent resized JPEG data URL thumbnail for image files
   */
  static createImageThumbnail(file, maxDimension = 420) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const img = new Image();
        img.onload = () => {
          try {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;
            if (!width || !height) {
              resolve(dataUrl);
              return;
            }
            if (width > maxDimension || height > maxDimension) {
              const scale = Math.min(maxDimension / width, maxDimension / height);
              width = Math.max(1, Math.round(width * scale));
              height = Math.max(1, Math.round(height * scale));
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } catch (e) {
            resolve(dataUrl);
          }
        };
        img.onerror = () => resolve(typeof dataUrl === 'string' ? dataUrl : null);
        img.src = dataUrl;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Run OCR on image using Tesseract.js
   */
  static async extractFromImage(file, onProgress) {
    onProgress('Initializing OCR engine...', 15);
    const thumbnail = await this.createImageThumbnail(file);

    if (typeof Tesseract === 'undefined') {
      onProgress('OCR library offline; analyzing image metadata...', 80);
      return {
        text: file.name.replace(/[-_.]/g, ' '),
        thumbnail,
        pageCount: 1,
        method: 'Image Metadata'
      };
    }

    try {
      onProgress('Performing neural OCR optical scan...', 40);
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress) {
            const pct = Math.round(30 + m.progress * 55);
            onProgress(`OCR optical recognition: ${Math.round(m.progress * 100)}%`, pct);
          }
        }
      });

      onProgress('OCR completed successfully.', 90);
      const cleanText = result.data.text.trim();
      return {
        text: cleanText || file.name.replace(/[-_.]/g, ' '),
        thumbnail,
        pageCount: 1,
        method: 'Tesseract OCR'
      };
    } catch (ocrErr) {
      console.warn('Tesseract OCR error:', ocrErr);
      return {
        text: file.name.replace(/[-_.]/g, ' '),
        thumbnail,
        pageCount: 1,
        method: 'Image Fallback'
      };
    }
  }

  /**
   * Extract text and generate canvas thumbnail for PDF
   */
  static async extractFromPDF(file, onProgress) {
    onProgress('Parsing PDF structure...', 20);

    if (typeof pdfjsLib === 'undefined') {
      const rawText = await file.text().catch(() => '');
      return {
        text: rawText.slice(0, 3000) || file.name,
        thumbnail: null,
        pageCount: 1,
        method: 'Raw Stream'
      };
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageCount = pdf.numPages;
    let fullText = '';
    let thumbnail = null;

    // Render Page 1 to generate realistic thumbnail
    try {
      const page1 = await pdf.getPage(1);
      const viewport = page1.getViewport({ scale: 0.8 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page1.render({ canvasContext: ctx, viewport }).promise;
      thumbnail = canvas.toDataURL('image/jpeg', 0.85);
    } catch (renderErr) {
      console.warn('Could not render PDF canvas thumbnail:', renderErr);
    }

    // Extract text from up to first 5 pages for speed and high classification accuracy
    const maxPagesToRead = Math.min(pageCount, 5);
    for (let i = 1; i <= maxPagesToRead; i++) {
      onProgress(`Reading text streams from page ${i} of ${pageCount}...`, Math.round(30 + (i / maxPagesToRead) * 55));
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      fullText += ` ${pageText}`;
    }

    onProgress('PDF text extraction complete.', 90);
    return {
      text: fullText.trim() || file.name.replace(/[-_.]/g, ' '),
      thumbnail,
      pageCount,
      method: 'PDF.js Stream Parser'
    };
  }

  /**
   * Extract text from Word document (.docx) using JSZip to read word/document.xml
   */
  static async extractFromDocx(file, onProgress) {
    onProgress('Extracting Word document structure...', 30);

    if (typeof JSZip === 'undefined') {
      return {
        text: file.name.replace(/[-_.]/g, ' '),
        thumbnail: null,
        pageCount: 1,
        method: 'Word Metadata'
      };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXmlFile = zip.file('word/document.xml');

      if (!docXmlFile) {
        return {
          text: file.name.replace(/[-_.]/g, ' '),
          thumbnail: null,
          pageCount: 1,
          method: 'Docx Fallback'
        };
      }

      onProgress('Parsing Word document XML text nodes...', 65);
      const xmlString = await docXmlFile.async('string');
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
      let textNodes = xmlDoc.getElementsByTagName('w:t');
      if (!textNodes || textNodes.length === 0) {
        textNodes = xmlDoc.getElementsByTagNameNS('*', 't');
      }

      let extractedText = '';
      for (let i = 0; i < textNodes.length; i++) {
        extractedText += textNodes[i].textContent + ' ';
      }

      onProgress('Word text extraction complete.', 90);
      return {
        text: extractedText.trim() || file.name.replace(/[-_.]/g, ' '),
        thumbnail: null,
        pageCount: 1,
        method: 'DOCX XML Parser'
      };
    } catch (docxErr) {
      console.warn('Docx parsing error:', docxErr);
      return {
        text: file.name.replace(/[-_.]/g, ' '),
        thumbnail: null,
        pageCount: 1,
        method: 'Docx Error Fallback'
      };
    }
  }

  /**
   * Read plain text files directly
   */
  static async extractFromText(file, onProgress) {
    onProgress('Reading plain text file...', 50);
    let text = await file.text();
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || lowerName.endsWith('.xml')) {
      text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
    } else if (lowerName.endsWith('.rtf')) {
      text = text.replace(/\\[a-z]+\d*\s?/gi, ' ').replace(/[{}]/g, ' ').replace(/\s+/g, ' ');
    }
    onProgress('Text extraction complete.', 90);
    return {
      text: text.trim() || file.name.replace(/[-_.]/g, ' '),
      thumbnail: null,
      pageCount: 1,
      method: 'Text Stream'
    };
  }
}

window.DocumentExtractor = DocumentExtractor;
