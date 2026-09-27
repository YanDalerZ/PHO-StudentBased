// Dependency-free QR Model 2 encoder for the invitation URL. It uses byte mode,
// version 10, and error-correction level L (274 data and 72 correction codewords).
const VERSION = 10;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 274;
const EC_CODEWORDS_PER_BLOCK = 18;
const BLOCK_DATA_LENGTHS = [68, 68, 69, 69] as const;

const gfExp = new Uint8Array(512);
const gfLog = new Uint8Array(256);
let value = 1;
for (let index = 0; index < 255; index += 1) {
    gfExp[index] = value;
    gfLog[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
}
for (let index = 255; index < 512; index += 1) gfExp[index] = gfExp[index - 255]!;

function multiply(left: number, right: number): number {
    if (left === 0 || right === 0) return 0;
    return gfExp[gfLog[left]! + gfLog[right]!]!;
}

function polynomialMultiply(left: number[], right: number[]): number[] {
    const result = Array<number>(left.length + right.length - 1).fill(0);
    left.forEach((a, i) => right.forEach((b, j) => { result[i + j] ^= multiply(a, b); }));
    return result;
}

function errorCorrection(data: number[]): number[] {
    let generator = [1];
    for (let degree = 0; degree < EC_CODEWORDS_PER_BLOCK; degree += 1) {
        generator = polynomialMultiply(generator, [1, gfExp[degree]!]);
    }
    const message = [...data, ...Array<number>(EC_CODEWORDS_PER_BLOCK).fill(0)];
    for (let index = 0; index < data.length; index += 1) {
        const factor = message[index]!;
        if (!factor) continue;
        generator.forEach((coefficient, offset) => {
            message[index + offset] ^= multiply(coefficient, factor);
        });
    }
    return message.slice(data.length);
}

class Bits {
    readonly values: number[] = [];
    push(valueToPush: number, length: number): void {
        for (let bit = length - 1; bit >= 0; bit -= 1) this.values.push((valueToPush >>> bit) & 1);
    }
}

function createCodewords(text: string): number[] {
    const bytes = [...new TextEncoder().encode(text)];
    if (bytes.length > 271) throw new Error('Registration URL is too long for the local QR encoder.');
    const bits = new Bits();
    bits.push(0b0100, 4);
    bits.push(bytes.length, 16);
    bytes.forEach((byte) => bits.push(byte, 8));
    const capacity = DATA_CODEWORDS * 8;
    bits.push(0, Math.min(4, capacity - bits.values.length));
    while (bits.values.length % 8) bits.values.push(0);
    let pad = true;
    while (bits.values.length < capacity) {
        bits.push(pad ? 0xec : 0x11, 8);
        pad = !pad;
    }
    const data = Array.from({ length: DATA_CODEWORDS }, (_, index) => {
        let byte = 0;
        for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits.values[index * 8 + bit]!;
        return byte;
    });

    const blocks: number[][] = [];
    let offset = 0;
    BLOCK_DATA_LENGTHS.forEach((length) => {
        blocks.push(data.slice(offset, offset + length));
        offset += length;
    });
    const corrections = blocks.map(errorCorrection);
    const result: number[] = [];
    for (let column = 0; column < 69; column += 1) {
        blocks.forEach((block) => { if (column < block.length) result.push(block[column]!); });
    }
    for (let column = 0; column < EC_CODEWORDS_PER_BLOCK; column += 1) {
        corrections.forEach((block) => result.push(block[column]!));
    }
    return result;
}

type Matrix = Array<Array<boolean | null>>;

function finder(matrix: Matrix, row: number, column: number): void {
    for (let y = -1; y <= 7; y += 1) for (let x = -1; x <= 7; x += 1) {
        const targetRow = row + y;
        const targetColumn = column + x;
        if (targetRow < 0 || targetRow >= SIZE || targetColumn < 0 || targetColumn >= SIZE) continue;
        matrix[targetRow]![targetColumn] = y >= 0 && y <= 6 && x >= 0 && x <= 6
            && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
    }
}

function bch(valueToEncode: number, polynomial: number): number {
    let valueWithPadding = valueToEncode;
    const polynomialDegree = 31 - Math.clz32(polynomial);
    while ((31 - Math.clz32(valueWithPadding)) >= polynomialDegree) {
        valueWithPadding ^= polynomial << ((31 - Math.clz32(valueWithPadding)) - polynomialDegree);
    }
    return valueWithPadding;
}

function mask(maskIndex: number, row: number, column: number): boolean {
    switch (maskIndex) {
        case 0: return (row + column) % 2 === 0;
        case 1: return row % 2 === 0;
        case 2: return column % 3 === 0;
        case 3: return (row + column) % 3 === 0;
        case 4: return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
        case 5: return (row * column) % 2 + (row * column) % 3 === 0;
        case 6: return ((row * column) % 2 + (row * column) % 3) % 2 === 0;
        default: return ((row * column) % 3 + (row + column) % 2) % 2 === 0;
    }
}

function buildMatrix(codewords: number[], maskIndex: number): boolean[][] {
    const matrix: Matrix = Array.from({ length: SIZE }, () => Array<boolean | null>(SIZE).fill(null));
    finder(matrix, 0, 0);
    finder(matrix, SIZE - 7, 0);
    finder(matrix, 0, SIZE - 7);

    const positions = [6, 28, 50];
    positions.forEach((row) => positions.forEach((column) => {
        if (matrix[row]![column] !== null) return;
        for (let y = -2; y <= 2; y += 1) for (let x = -2; x <= 2; x += 1) {
            matrix[row + y]![column + x] = Math.max(Math.abs(x), Math.abs(y)) !== 1;
        }
    }));

    for (let index = 8; index < SIZE - 8; index += 1) {
        if (matrix[index]![6] === null) matrix[index]![6] = index % 2 === 0;
        if (matrix[6]![index] === null) matrix[6]![index] = index % 2 === 0;
    }

    const versionBits = (VERSION << 12) | bch(VERSION << 12, 0x1f25);
    for (let index = 0; index < 18; index += 1) {
        const dark = ((versionBits >>> index) & 1) === 1;
        matrix[Math.floor(index / 3)]![index % 3 + SIZE - 11] = dark;
        matrix[index % 3 + SIZE - 11]![Math.floor(index / 3)] = dark;
    }

    const formatValue = (1 << 3) | maskIndex;
    const formatBits = ((formatValue << 10) | bch(formatValue << 10, 0x537)) ^ 0x5412;
    for (let index = 0; index < 15; index += 1) {
        const dark = ((formatBits >>> index) & 1) === 1;
        const verticalRow = index < 6 ? index : index < 8 ? index + 1 : SIZE - 15 + index;
        const horizontalColumn = index < 8 ? SIZE - index - 1 : index === 8 ? 7 : 15 - index - 1;
        matrix[verticalRow]![8] = dark;
        matrix[8]![horizontalColumn] = dark;
    }
    matrix[SIZE - 8]![8] = true;

    let row = SIZE - 1;
    let direction = -1;
    let byteIndex = 0;
    let bitIndex = 7;
    for (let column = SIZE - 1; column > 0; column -= 2) {
        if (column === 6) column -= 1;
        while (true) {
            for (let offset = 0; offset < 2; offset += 1) {
                const targetColumn = column - offset;
                if (matrix[row]![targetColumn] !== null) continue;
                let dark = byteIndex < codewords.length && ((codewords[byteIndex]! >>> bitIndex) & 1) === 1;
                if (mask(maskIndex, row, targetColumn)) dark = !dark;
                matrix[row]![targetColumn] = dark;
                bitIndex -= 1;
                if (bitIndex < 0) { byteIndex += 1; bitIndex = 7; }
            }
            row += direction;
            if (row < 0 || row >= SIZE) { row -= direction; direction = -direction; break; }
        }
    }
    return matrix.map((matrixRow) => matrixRow.map(Boolean));
}

function penalty(matrix: boolean[][]): number {
    let score = 0;
    const lines = [...matrix, ...Array.from({ length: SIZE }, (_, column) => matrix.map((row) => row[column]!))];
    lines.forEach((line) => {
        let run = 1;
        for (let index = 1; index <= SIZE; index += 1) {
            if (index < SIZE && line[index] === line[index - 1]) run += 1;
            else { if (run >= 5) score += 3 + run - 5; run = 1; }
        }
        const pattern = line.map((cell) => cell ? '1' : '0').join('');
        score += ((pattern.match(/00001011101/g)?.length ?? 0) + (pattern.match(/10111010000/g)?.length ?? 0)) * 40;
    });
    for (let row = 0; row < SIZE - 1; row += 1) for (let column = 0; column < SIZE - 1; column += 1) {
        const valueAtCell = matrix[row]![column];
        if (matrix[row + 1]![column] === valueAtCell && matrix[row]![column + 1] === valueAtCell
            && matrix[row + 1]![column + 1] === valueAtCell) score += 3;
    }
    const dark = matrix.flat().filter(Boolean).length;
    score += Math.floor(Math.abs((dark * 100 / (SIZE * SIZE)) - 50) / 5) * 10;
    return score;
}

export function qrSvg(text: string, pixels = 360): string {
    const codewords = createCodewords(text);
    const candidates = Array.from({ length: 8 }, (_, maskIndex) => buildMatrix(codewords, maskIndex));
    const matrix = candidates.reduce((best, candidate) => penalty(candidate) < penalty(best) ? candidate : best);
    const quiet = 4;
    const dimension = SIZE + quiet * 2;
    const path = matrix.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x + quiet} ${y + quiet}h1v1h-1z`] : [])).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges" role="img" aria-label="Registration QR code"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
