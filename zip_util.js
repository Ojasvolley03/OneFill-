/**
 * OneFill - Native Zero-Dependency ZIP Archive Builder
 * Uses standard Node.js buffers and zlib.crc32 to create compliant .zip archives.
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function createZipBuffer(entries = []) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || '', 'utf8');

    const crc = zlib.crc32(dataBuf);
    const size = dataBuf.length;

    // Local file header (30 bytes)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4);          // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6);           // General purpose bit flag
    localHeader.writeUInt16LE(0, 8);           // Compression method (0 = stored / uncompressed)
    localHeader.writeUInt16LE(0x4000, 10);     // Last mod file time (approx)
    localHeader.writeUInt16LE(0x5621, 12);     // Last mod file date (approx)
    localHeader.writeUInt32LE(crc, 14);        // CRC-32
    localHeader.writeUInt32LE(size, 18);       // Compressed size
    localHeader.writeUInt32LE(size, 22);       // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);          // Extra field length

    localHeaders.push(localHeader, nameBuf, dataBuf);

    // Central directory header (46 bytes)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4);          // Version made by
    centralHeader.writeUInt16LE(20, 6);          // Version needed
    centralHeader.writeUInt16LE(0, 8);           // General purpose bit flag
    centralHeader.writeUInt16LE(0, 10);          // Compression method (0 = stored)
    centralHeader.writeUInt16LE(0x4000, 12);     // Last mod file time
    centralHeader.writeUInt16LE(0x5621, 14);     // Last mod file date
    centralHeader.writeUInt32LE(crc, 16);        // CRC-32
    centralHeader.writeUInt32LE(size, 20);       // Compressed size
    centralHeader.writeUInt32LE(size, 24);       // Uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30);          // Extra field length
    centralHeader.writeUInt16LE(0, 32);          // File comment length
    centralHeader.writeUInt16LE(0, 34);          // Disk number start
    centralHeader.writeUInt16LE(0, 36);          // Internal file attributes
    centralHeader.writeUInt32LE(0, 38);          // External file attributes
    centralHeader.writeUInt32LE(offset, 42);     // Relative offset of local header

    centralHeaders.push(centralHeader, nameBuf);

    offset += 30 + nameBuf.length + size;
  }

  const centralDirStart = offset;
  const centralDirSize = centralHeaders.reduce((acc, b) => acc + b.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);             // Signature
  eocd.writeUInt16LE(0, 4);                      // Disk number
  eocd.writeUInt16LE(0, 6);                      // Disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8);         // Number of central directory records on this disk
  eocd.writeUInt16LE(entries.length, 10);        // Total number of central directory records
  eocd.writeUInt32LE(centralDirSize, 12);        // Size of central directory
  eocd.writeUInt32LE(centralDirStart, 16);       // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);                     // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function zipDirectory(dirPath) {
  const entries = [];

  function walk(currentDir, relativePrefix = '') {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const relPath = relativePrefix ? `${relativePrefix}/${item}` : item;
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        entries.push({
          name: relPath,
          data: fs.readFileSync(fullPath)
        });
      }
    }
  }

  walk(dirPath);
  return createZipBuffer(entries);
}

module.exports = {
  createZipBuffer,
  zipDirectory
};
