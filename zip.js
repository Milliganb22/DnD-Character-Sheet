"use strict";

// Minimal ZIP support for map backups. The writer stores files uncompressed (images are already compressed);
// the reader also accepts ordinary deflate-compressed zips, such as a folder zipped on a Mac.
const Zip = (() => {
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crcUpdate(state, bytes) {
    let crc = state;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    }
    return crc >>> 0;
  }

  async function crcOfBlob(blob) {
    const CHUNK = 4 * 1024 * 1024;
    let state = 0xffffffff;
    for (let start = 0; start < blob.size; start += CHUNK) {
      state = crcUpdate(state, new Uint8Array(await blob.slice(start, start + CHUNK).arrayBuffer()));
    }
    return (state ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  // entries: [{ name, blob }]. Returns a Blob containing the zip file.
  async function build(entries) {
    if (entries.length > 65534) {
      throw new Error("Too many files for one zip.");
    }
    const encoder = new TextEncoder();
    const { time, day } = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (const { name, blob } of entries) {
      if (blob.size >= 0xffffffff) {
        throw new Error(`${name} is too large for a zip file.`);
      }
      const nameBytes = encoder.encode(name);
      const crc = await crcOfBlob(blob);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, time, true);
      local.setUint16(12, day, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, blob.size, true);
      local.setUint32(22, blob.size, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      parts.push(local, nameBytes, blob);
      central.push({ nameBytes, crc, size: blob.size, offset });
      offset += 30 + nameBytes.length + blob.size;
    }

    const centralStart = offset;
    central.forEach((entry) => {
      const header = new DataView(new ArrayBuffer(46));
      header.setUint32(0, 0x02014b50, true);
      header.setUint16(4, 20, true);
      header.setUint16(6, 20, true);
      header.setUint16(8, 0x0800, true);
      header.setUint16(10, 0, true);
      header.setUint16(12, time, true);
      header.setUint16(14, day, true);
      header.setUint32(16, entry.crc, true);
      header.setUint32(20, entry.size, true);
      header.setUint32(24, entry.size, true);
      header.setUint16(28, entry.nameBytes.length, true);
      header.setUint32(42, entry.offset, true);
      parts.push(header, entry.nameBytes);
      offset += 46 + entry.nameBytes.length;
    });

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, central.length, true);
    end.setUint16(10, central.length, true);
    end.setUint32(12, offset - centralStart, true);
    end.setUint32(16, centralStart, true);
    parts.push(end);
    return new Blob(parts, { type: "application/zip" });
  }

  // Returns [{ name, size, directory, blob() }]. blob() decompresses on demand.
  async function read(blob) {
    const size = blob.size;
    if (size < 22) {
      throw new Error("This is not a zip file.");
    }
    const tailLength = Math.min(size, 65557);
    const tail = new DataView(await blob.slice(size - tailLength).arrayBuffer());
    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i -= 1) {
      if (tail.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw new Error("This is not a zip file.");
    }
    const count = tail.getUint16(eocd + 10, true);
    const directorySize = tail.getUint32(eocd + 12, true);
    const directoryOffset = tail.getUint32(eocd + 16, true);
    if (count === 0xffff || directoryOffset === 0xffffffff) {
      throw new Error("Zip files larger than 4 GB are not supported.");
    }

    const directory = new DataView(await blob.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer());
    const decoder = new TextDecoder();
    const entries = [];
    let p = 0;
    for (let i = 0; i < count; i += 1) {
      if (directory.getUint32(p, true) !== 0x02014b50) {
        throw new Error("The zip file is damaged.");
      }
      const method = directory.getUint16(p + 10, true);
      const compressedSize = directory.getUint32(p + 20, true);
      const uncompressedSize = directory.getUint32(p + 24, true);
      const nameLength = directory.getUint16(p + 28, true);
      const extraLength = directory.getUint16(p + 30, true);
      const commentLength = directory.getUint16(p + 32, true);
      const offset = directory.getUint32(p + 42, true);
      const name = decoder.decode(new Uint8Array(directory.buffer, directory.byteOffset + p + 46, nameLength));
      entries.push({ name, method, compressedSize, uncompressedSize, offset });
      p += 46 + nameLength + extraLength + commentLength;
    }

    return entries.map((entry) => ({
      name: entry.name,
      size: entry.uncompressedSize,
      directory: entry.name.endsWith("/"),
      async blob() {
        const local = new DataView(await blob.slice(entry.offset, entry.offset + 30).arrayBuffer());
        if (local.getUint32(0, true) !== 0x04034b50) {
          throw new Error("The zip file is damaged.");
        }
        const start = entry.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
        const raw = blob.slice(start, start + entry.compressedSize);
        if (entry.method === 0) {
          return raw;
        }
        if (entry.method === 8) {
          if (typeof DecompressionStream === "undefined") {
            throw new Error("This browser cannot open compressed zip files. Try a newer browser.");
          }
          return new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
        }
        throw new Error(`Unsupported zip compression (method ${entry.method}).`);
      }
    }));
  }

  return { build, read };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Zip;
}
