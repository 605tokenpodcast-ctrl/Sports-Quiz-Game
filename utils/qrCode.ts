// Pure TypeScript Standard QR Code Generator (Byte Mode, Error Correction L/M)
// Generates a 2D boolean matrix for crisp SVG or Canvas rendering without any external dependencies.

// GF(256) tables for Reed-Solomon computation
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d; // QR standard primitive polynomial
    }
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    const root = GF256_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMul(poly[j], root);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsCalculateRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    for (let j = 0; j < ecCount - 1; j++) {
      remainder[j] = remainder[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    remainder[ecCount - 1] = gfMul(gen[ecCount], factor);
  }
  return remainder;
}

// Version metadata (Versions 1 to 6 - Low/Medium Error Correction, plenty for room URLs)
interface VersionInfo {
  version: number;
  totalBytes: number;
  dataBytes: number;
  ecBytes: number;
  alignments: number[];
}

const QR_VERSIONS: VersionInfo[] = [
  { version: 1, totalBytes: 26, dataBytes: 19, ecBytes: 7, alignments: [] },
  { version: 2, totalBytes: 44, dataBytes: 34, ecBytes: 10, alignments: [6, 18] },
  { version: 3, totalBytes: 70, dataBytes: 55, ecBytes: 15, alignments: [6, 22] },
  { version: 4, totalBytes: 100, dataBytes: 80, ecBytes: 20, alignments: [6, 26] },
  { version: 5, totalBytes: 134, dataBytes: 108, ecBytes: 26, alignments: [6, 30] },
  { version: 6, totalBytes: 172, dataBytes: 136, ecBytes: 36, alignments: [6, 34] },
];

export function generateQRCodeMatrix(text: string): boolean[][] {
  const utf8Encoder = new TextEncoder();
  const textBytes = utf8Encoder.encode(text);

  // Find minimum version that fits data
  let vInfo = QR_VERSIONS[0];
  for (const v of QR_VERSIONS) {
    // 4 bits mode + 8/16 bits char count + data
    const maxChars = v.dataBytes - 2;
    if (textBytes.length <= maxChars) {
      vInfo = v;
      break;
    }
    vInfo = v;
  }

  const numModules = vInfo.version * 4 + 17;
  const grid: (boolean | null)[][] = Array.from({ length: numModules }, () =>
    Array(numModules).fill(null)
  );
  const isFunction: boolean[][] = Array.from({ length: numModules }, () =>
    Array(numModules).fill(false)
  );

  // 1. Finder Patterns (Top-Left, Top-Right, Bottom-Left)
  const drawFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < numModules && nc >= 0 && nc < numModules) {
          isFunction[nr][nc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            grid[nr][nc] =
              r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          } else {
            grid[nr][nc] = false; // separator
          }
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, numModules - 7);
  drawFinder(numModules - 7, 0);

  // 2. Alignment Patterns
  if (vInfo.alignments.length > 0) {
    const coords = vInfo.alignments;
    for (const r of coords) {
      for (const c of coords) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            isFunction[nr][nc] = true;
            grid[nr][nc] =
              Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          }
        }
      }
    }
  }

  // 3. Timing Patterns
  for (let i = 8; i < numModules - 8; i++) {
    if (!isFunction[6][i]) {
      grid[6][i] = i % 2 === 0;
      isFunction[6][i] = true;
    }
    if (!isFunction[i][6]) {
      grid[i][6] = i % 2 === 0;
      isFunction[i][6] = true;
    }
  }

  // Dark module
  grid[4 * vInfo.version + 9][8] = true;
  isFunction[4 * vInfo.version + 9][8] = true;

  // Reserve format information area
  for (let i = 0; i <= 8; i++) {
    if (i < numModules) {
      isFunction[8][i] = true;
      isFunction[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][numModules - 1 - i] = true;
    isFunction[numModules - 1 - i][8] = true;
  }

  // 4. Encode Data Bytes
  const bitStream: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitStream.push((val >> i) & 1);
    }
  };

  // Mode Indicator for Byte: 0100
  pushBits(0b0100, 4);
  // Character count (8 bits for versions 1-9)
  pushBits(textBytes.length, 8);
  // Data payload
  for (let i = 0; i < textBytes.length; i++) {
    pushBits(textBytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const maxDataBits = vInfo.dataBytes * 8;
  const termBits = Math.min(4, maxDataBits - bitStream.length);
  pushBits(0, termBits);

  // Pad to byte boundary
  while (bitStream.length % 8 !== 0) {
    bitStream.push(0);
  }

  // Pad bytes (0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < maxDataBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bitStream to byte array
  const dataBytes = new Uint8Array(vInfo.dataBytes);
  for (let i = 0; i < dataBytes.length; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitStream[i * 8 + b];
    }
    dataBytes[i] = byteVal;
  }

  // Error Correction
  const ecRemainder = rsCalculateRemainder(dataBytes, vInfo.ecBytes);

  // Interleaved / Final Codewords
  const finalCodewords = new Uint8Array(vInfo.totalBytes);
  finalCodewords.set(dataBytes, 0);
  finalCodewords.set(ecRemainder, dataBytes.length);

  // 5. Place Data Bits in Matrix
  let bitIdx = 0;
  const allBits: number[] = [];
  for (let i = 0; i < finalCodewords.length; i++) {
    for (let b = 7; b >= 0; b--) {
      allBits.push((finalCodewords[i] >> b) & 1);
    }
  }

  let upward = true;
  for (let right = numModules - 1; right > 0; right -= 2) {
    if (right === 6) right--; // skip vertical timing line
    const rows = upward
      ? Array.from({ length: numModules }, (_, idx) => numModules - 1 - idx)
      : Array.from({ length: numModules }, (_, idx) => idx);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r][c]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          // Apply Mask 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          grid[r][c] = (bit === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  // 6. Format Information (Mask 0, Error Correction L = 01)
  // Format bit sequence for EC 'L' and Mask 0 is 0b111011111000100 (after masking with 0x5412: 0b111011111000100 ^ 0x5412 = 0x77c4 -> 0b111011111000100)
  // Let's compute format string:
  const formatBits = 0x77c4 ^ 0x5412; // 0x23d6 (or Standard EC L mask 0 pattern 0b111011111000100)
  const formatStr = (0x77c4).toString(2).padStart(15, '0');

  // Place format information on top-left and split corners
  const formatPositionsTopLeft = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = formatStr[14 - i] === '1';
    const [r, c] = formatPositionsTopLeft[i];
    grid[r][c] = bit;
  }

  // Split corner format placement
  for (let i = 0; i < 7; i++) {
    grid[numModules - 1 - i][8] = formatStr[i] === '1';
  }
  for (let i = 7; i < 15; i++) {
    grid[8][numModules - 15 + i] = formatStr[i] === '1';
  }

  // Convert (boolean | null) to boolean
  return grid.map((row) => row.map((cell) => Boolean(cell)));
}
