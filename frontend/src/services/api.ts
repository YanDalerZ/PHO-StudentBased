import axios from 'axios';
import type { Student, Municipality, Barangay, School } from '../types';

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

export const getMunicipalities = async (): Promise<Municipality[]> => {
    const response = await api.get('/lookup/municipalities');
    return response.data;
};

export const getBarangays = async (municipalityId: string | number): Promise<Barangay[]> => {
    const response = await api.get(`/lookup/barangays/${municipalityId}`);
    return response.data;
};

export const getSchools = async (barangayId: string | number): Promise<School[]> => {
    const response = await api.get(`/lookup/schools/${barangayId}`);
    return response.data;
};

export const createStudent = async (studentData: Student): Promise<{ message: string, id: number }> => {
    const response = await api.post('/students', studentData);
    return response.data;
};

export default api;
