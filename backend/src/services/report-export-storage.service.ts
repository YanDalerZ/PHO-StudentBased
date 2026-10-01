import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type ExportFileFormat = 'csv' | 'xlsx';

export interface StoredExportFile {
    reference: string;
    bytes: number;
}

export interface PrivateExportStorage {
    write(format: ExportFileFormat, data: Buffer): Promise<StoredExportFile>;
    read(reference: string): Promise<Buffer>;
    remove(reference: string): Promise<void>;
}

const referencePattern = /^[0-9a-f-]{36}\.(?:csv|xlsx)$/i;

export class FilesystemExportStorage implements PrivateExportStorage {
    readonly root: string;

    constructor(root: string) {
        this.root = path.resolve(root);
    }

    private resolveReference(reference: string): string {
        if (!referencePattern.test(reference)) throw new Error('INVALID_STORAGE_REFERENCE');
        const resolved = path.resolve(this.root, reference);
        if (path.dirname(resolved) !== this.root) throw new Error('INVALID_STORAGE_REFERENCE');
        return resolved;
    }

    async write(format: ExportFileFormat, data: Buffer): Promise<StoredExportFile> {
        await mkdir(this.root, { recursive: true });
        const reference = `${randomUUID()}.${format}`;
        await writeFile(this.resolveReference(reference), data, { flag: 'wx', mode: 0o600 });
        return { reference, bytes: data.byteLength };
    }

    async read(reference: string): Promise<Buffer> {
        return readFile(this.resolveReference(reference));
    }

    async remove(reference: string): Promise<void> {
        await rm(this.resolveReference(reference), { force: true });
    }
}

export function createPrivateExportStorage(): PrivateExportStorage {
    const configuredRoot = process.env.REPORT_EXPORT_STORAGE_ROOT?.trim();
    if (process.env.NODE_ENV === 'production' && !configuredRoot) {
        throw new Error('REPORT_EXPORT_STORAGE_ROOT must point to a durable private volume in production.');
    }
    const root = configuredRoot || path.resolve(process.cwd(), 'private-report-exports');
    return new FilesystemExportStorage(root);
}
