/**
 * Minimal read-only ZIP reader (pipeline lane, W0b; plan §10.1 re-fetch).
 *
 * Just enough to hash a downloaded archive and check every staged source file
 * against its member, with node built-ins only (no dependency, no network):
 *
 *   const z = await openZip(file);          // central directory, Zip64-aware
 *   z.entries                               // [{ name, method, crc32, csize, size, offset, dir }]
 *   await z.read(entry)                     // Buffer of the uncompressed member (stored or deflate)
 *   await z.close()
 *   await sha256File(file)                  // { sha256, bytes } streamed, constant memory
 *
 * Reads are random-access (fs.FileHandle.read at offsets), so a 300 MB archive
 * is never held in memory; one member at a time is inflated.
 */
import { open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync, crc32 as zcrc32 } from 'node:zlib';

const EOCD = 0x06054b50, EOCD64 = 0x06064b50, EOCD64_LOC = 0x07064b50, CEN = 0x02014b50, LOC = 0x04034b50;

/** SHA-256 + byte count of a file, streamed. */
export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    let bytes = 0;
    createReadStream(file)
      .on('data', (c) => { h.update(c); bytes += c.length; })
      .on('error', reject)
      .on('end', () => resolve({ sha256: h.digest('hex'), bytes }));
  });
}

/** CRC-32 of a buffer (zlib's, node >= 22.2). */
export const crc32 = (buf) => zcrc32(buf) >>> 0;

export async function openZip(file) {
  const fh = await open(file, 'r');
  const { size } = await fh.stat();
  const readAt = async (pos, len) => {
    const b = Buffer.alloc(len);
    const { bytesRead } = await fh.read(b, 0, len, pos);
    return bytesRead === len ? b : b.subarray(0, bytesRead);
  };
  // End of central directory: last 22 bytes + up to 64 KB comment
  const tailLen = Math.min(size, 22 + 0xffff);
  const tail = await readAt(size - tailLen, tailLen);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === EOCD) { e = i; break; }
  if (e < 0) { await fh.close(); throw new Error(`${file}: not a zip (no end-of-central-directory record)`); }
  let count = tail.readUInt16LE(e + 10);
  let cdSize = tail.readUInt32LE(e + 12);
  let cdOff = tail.readUInt32LE(e + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    // Zip64: the locator sits just before the EOCD
    const loc = e - 20;
    if (loc < 0 || tail.readUInt32LE(loc) !== EOCD64_LOC) { await fh.close(); throw new Error(`${file}: Zip64 locator missing`); }
    const rec = await readAt(Number(tail.readBigUInt64LE(loc + 8)), 56);
    if (rec.readUInt32LE(0) !== EOCD64) { await fh.close(); throw new Error(`${file}: Zip64 record missing`); }
    count = Number(rec.readBigUInt64LE(32));
    cdSize = Number(rec.readBigUInt64LE(40));
    cdOff = Number(rec.readBigUInt64LE(48));
  }
  const cd = await readAt(cdOff, cdSize);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.readUInt32LE(p) !== CEN) throw new Error(`${file}: bad central directory entry ${i}`);
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    const crc = cd.readUInt32LE(p + 16);
    let csize = cd.readUInt32LE(p + 20);
    let usize = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28), xlen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
    let offset = cd.readUInt32LE(p + 42);
    const name = cd.subarray(p + 46, p + 46 + nlen).toString(flags & 0x800 ? 'utf8' : 'latin1');
    // Zip64 extra field (id 1): the 0xffffffff fields, in order
    let x = p + 46 + nlen;
    const xend = x + xlen;
    while (x + 4 <= xend) {
      const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2);
      if (id === 1) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (offset === 0xffffffff) { offset = Number(cd.readBigUInt64LE(q)); q += 8; }
      }
      x += 4 + len;
    }
    entries.push({ name, method, crc32: crc >>> 0, csize, size: usize, offset, dir: name.endsWith('/'), encrypted: !!(flags & 1) });
    p += 46 + nlen + xlen + clen;
  }
  async function read(entry) {
    if (entry.encrypted) throw new Error(`${entry.name}: encrypted member`);
    const lh = await readAt(entry.offset, 30);
    if (lh.readUInt32LE(0) !== LOC) throw new Error(`${entry.name}: bad local header`);
    const start = entry.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const raw = await readAt(start, entry.csize);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return inflateRawSync(raw);
    throw new Error(`${entry.name}: unsupported compression method ${entry.method}`);
  }
  return { file, size, entries, read, close: () => fh.close() };
}
