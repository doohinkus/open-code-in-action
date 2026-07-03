"use client";

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
}

function u32(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
}

export function createZipBlob(files: Map<string, string>): Blob {
  const encoder = new TextEncoder();
  const entries = Array.from(files.entries())
    .map(([path, content]) => ({
      path: path.replace(/^\//, ""),
      data: encoder.encode(content),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const localParts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    local.set([0x50, 0x4b, 0x03, 0x04], 0);
    local[5] = 0x0a;
    local[7] = 0x08;
    local.set(u32(crc), 14);
    local.set(u32(size), 18);
    local.set(u32(size), 22);
    local.set(u16(name.length), 26);
    local.set(name, 30);

    localParts.push(local, entry.data);

    const cd = new Uint8Array(46 + name.length);
    cd.set([0x50, 0x4b, 0x01, 0x02], 0);
    cd[4] = 0x14;
    cd[5] = 0x0a;
    cd[7] = 0x08;
    cd.set(u32(crc), 16);
    cd.set(u32(size), 20);
    cd.set(u32(size), 24);
    cd.set(u16(name.length), 28);
    cd.set(u32(offset), 42);
    cd.set(name, 46);

    central.push(cd);
    offset += 30 + name.length + size;
  }

  const cdSize = central.reduce((s, e) => s + e.length, 0);
  const eocd = new Uint8Array(22);
  eocd.set([0x50, 0x4b, 0x05, 0x06], 0);
  eocd.set(u16(entries.length), 8);
  eocd.set(u16(entries.length), 10);
  eocd.set(u32(cdSize), 12);
  eocd.set(u32(offset), 16);

  return new Blob([...localParts, ...central, eocd] as BlobPart[], { type: "application/zip" });
}

export function downloadProjectZip(
  files: Map<string, string>,
  filename = "project.zip"
) {
  const blob = createZipBlob(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
