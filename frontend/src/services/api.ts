import axios from 'axios';
import type {
    Student,
    Municipality,
    Barangay,
    School,
    StudentListResponse,
    StudentDetailResponse,
    StudentProfileResponse
} from '../types';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor to handle 401s
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/Login';
        }
        return Promise.reject(error);
    }
);


// Lookups
export const getMunicipalities = async (): Promise<Municipality[]> => {
    const response = await api.get<Municipality[]>('/lookup/municipalities');
    return response.data;
};

export const getBarangays = async (municipalityId: string | number): Promise<Barangay[]> => {
    const response = await api.get<Barangay[]>(`/lookup/barangays/${municipalityId}`);
    return response.data;
};

export const getSchools = async (barangayId: string | number): Promise<School[]> => {
    const response = await api.get<School[]>(`/lookup/schools/${barangayId}`);
    return response.data;
};

// Students CRUD
export interface GetStudentsParams {
    search?: string;
    school_id?: string | number;
    grade_level?: string;
}

export const getStudents = async (params?: GetStudentsParams): Promise<StudentListResponse> => {
    const response = await api.get<StudentListResponse>('/students', { params });
    return response.data;
};

export const getStudent = async (id: number | string): Promise<StudentDetailResponse> => {
    const response = await api.get<StudentDetailResponse>(`/students/${id}`);
    return response.data;
};

export const createStudent = async (studentData: Partial<Student>): Promise<{ message: string; id: number; data?: { id: number } }> => {
    const response = await api.post<{ message: string; id: number; data?: { id: number } }>('/students', studentData);
    return response.data;
};

export const updateStudent = async (id: number | string, studentData: Partial<Student>): Promise<{ message: string; data: Student }> => {
    const response = await api.put<{ message: string; data: Student }>(`/students/${id}`, studentData);
    return response.data;
};

export const getStudentProfile = async (id: number | string): Promise<StudentProfileResponse> => {
    const response = await api.get<StudentProfileResponse>(`/students/${id}/profile`);
    return response.data;
};

export default api;

