import axios from 'axios';

export interface CloudinaryUploadResponse {
    secure_url: string;
    public_id: string;
    format: string;
    bytes: number;
    width: number;
    height: number;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Validates photo file type and size before uploading.
 */
export const validatePhotoFile = (file: File): { valid: boolean; error?: string } => {
    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
        return {
            valid: false,
            error: 'Invalid file type. Only JPEG, PNG, and WebP images are supported.',
        };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        return {
            valid: false,
            error: `Image size (${sizeMb} MB) exceeds maximum allowed size of 5 MB.`,
        };
    }

    return { valid: true };
};

/**
 * Direct unsigned upload of student profile photo to Cloudinary.
 *
 * Saves only Cloudinary's returned HTTPS `secure_url`.
 * Rejects base64 encoding and validates file constraints.
 */
export const uploadStudentPhoto = async (
    file: File,
    onProgress?: (percent: number) => void
): Promise<string> => {
    // 1. Client-side validation
    const validation = validatePhotoFile(file);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    // 2. Read Cloudinary frontend environment variables
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
        throw new Error(
            'Cloudinary configuration missing. Please set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in frontend/.env.'
        );
    }

    // 3. Prepare Multipart Form Data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    // 4. Post directly to Cloudinary unsigned upload endpoint
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    try {
        const response = await axios.post<CloudinaryUploadResponse>(uploadUrl, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
                if (progressEvent.total && onProgress) {
                    const percent = Math.min(
                        100,
                        Math.round((progressEvent.loaded * 100) / progressEvent.total)
                    );
                    onProgress(percent);
                }
            },
        });

        if (!response.data?.secure_url) {
            throw new Error('Cloudinary response did not return a secure_url.');
        }

        return response.data.secure_url;
    } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
            throw new Error(`Cloudinary upload failed: ${err.response.data.error.message}`, { cause: err });
        }
        if (err instanceof Error) {
            throw err;
        }
        throw new Error('Failed to upload image to Cloudinary. Please check your network connection.', { cause: err });
    }
};
