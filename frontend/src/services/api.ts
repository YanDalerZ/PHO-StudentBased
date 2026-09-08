import axios from 'axios';
import type {
    Student,
    Municipality,
    Barangay,
    School,
    StudentListResponse,
    StudentDetailResponse,
    StudentProfileResponse,
    PatientInfo,
    AnimalBite,
    CreatePatientInfoPayload,
    UpdatePatientInfoPayload,
    CreateAnimalBitePayload,
    UpdateAnimalBitePayload,
    PatientInfoByStudentResponse,
    OralHealth,
    CreateOralHealthPayload,
    UpdateOralHealthPayload,
    OralHealthByStudentResponse,
    Deworming,
    CreateDewormingPayload,
    UpdateDewormingPayload,
    DewormingByStudentResponse,
    Immunization,
    CreateImmunizationPayload,
    UpdateImmunizationPayload,
    ImmunizationByStudentResponse,
    VitalSigns,
    CreateVitalSignsPayload,
    UpdateVitalSignsPayload,
    VitalSignsByStudentResponse,
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

// Patient Info & Animal Bite
export const getPatientInfoByStudent = async (studentId: number | string): Promise<{ data: PatientInfoByStudentResponse }> => {
    const response = await api.get<{ data: PatientInfoByStudentResponse }>(`/modules/patient-info/student/${studentId}`);
    return response.data;
};

export const createPatientInfo = async (payload: CreatePatientInfoPayload): Promise<{ message: string; data: { patient_info: PatientInfo; animal_bite?: AnimalBite } }> => {
    const response = await api.post<{ message: string; data: { patient_info: PatientInfo; animal_bite?: AnimalBite } }>('/modules/patient-info', payload);
    return response.data;
};

export const updatePatientInfo = async (id: number | string, payload: UpdatePatientInfoPayload): Promise<{ message: string; data: { patient_info: PatientInfo; animal_bite?: AnimalBite } }> => {
    const response = await api.put<{ message: string; data: { patient_info: PatientInfo; animal_bite?: AnimalBite } }>(`/modules/patient-info/${id}`, payload);
    return response.data;
};

export const createAnimalBite = async (payload: CreateAnimalBitePayload): Promise<{ message: string; data: AnimalBite }> => {
    const response = await api.post<{ message: string; data: AnimalBite }>('/modules/patient-info/animal-bites', payload);
    return response.data;
};

export const updateAnimalBite = async (id: number | string, payload: UpdateAnimalBitePayload): Promise<{ message: string; data: AnimalBite }> => {
    const response = await api.put<{ message: string; data: AnimalBite }>(`/modules/patient-info/animal-bites/${id}`, payload);
    return response.data;
};

// Oral Health
export const getOralHealthByStudent = async (studentId: number | string): Promise<{ data: OralHealthByStudentResponse }> => {
    const response = await api.get<{ data: OralHealthByStudentResponse }>(`/modules/oral-health/student/${studentId}`);
    return response.data;
};

export const createOralHealth = async (payload: CreateOralHealthPayload): Promise<{ message: string; data: OralHealth }> => {
    const response = await api.post<{ message: string; data: OralHealth }>('/modules/oral-health', payload);
    return response.data;
};

export const updateOralHealth = async (id: number | string, payload: UpdateOralHealthPayload): Promise<{ message: string; data: OralHealth }> => {
    const response = await api.put<{ message: string; data: OralHealth }>(`/modules/oral-health/${id}`, payload);
    return response.data;
};

// Deworming
export const getDewormingByStudent = async (studentId: number | string): Promise<{ data: DewormingByStudentResponse }> => {
    const response = await api.get<{ data: DewormingByStudentResponse }>(`/modules/deworming/student/${studentId}`);
    return response.data;
};

export const createDeworming = async (payload: CreateDewormingPayload): Promise<{ message: string; data: Deworming }> => {
    const response = await api.post<{ message: string; data: Deworming }>('/modules/deworming', payload);
    return response.data;
};

export const updateDeworming = async (id: number | string, payload: UpdateDewormingPayload): Promise<{ message: string; data: Deworming }> => {
    const response = await api.put<{ message: string; data: Deworming }>(`/modules/deworming/${id}`, payload);
    return response.data;
};

// Immunization
export const getImmunizationByStudent = async (studentId: number | string): Promise<{ data: ImmunizationByStudentResponse }> => {
    const response = await api.get<{ data: ImmunizationByStudentResponse }>(`/modules/immunization/student/${studentId}`);
    return response.data;
};

export const createImmunization = async (payload: CreateImmunizationPayload): Promise<{ message: string; data: Immunization }> => {
    const response = await api.post<{ message: string; data: Immunization }>('/modules/immunization', payload);
    return response.data;
};

export const updateImmunization = async (id: number | string, payload: UpdateImmunizationPayload): Promise<{ message: string; data: Immunization }> => {
    const response = await api.put<{ message: string; data: Immunization }>(`/modules/immunization/${id}`, payload);
    return response.data;
};

// Vital Signs
export const getVitalSignsByStudent = async (studentId: number | string): Promise<{ data: VitalSignsByStudentResponse }> => {
    const response = await api.get<{ data: VitalSignsByStudentResponse }>(`/modules/vital-signs/student/${studentId}`);
    return response.data;
};

export const createVitalSigns = async (payload: CreateVitalSignsPayload): Promise<{ message: string; data: VitalSigns }> => {
    const response = await api.post<{ message: string; data: VitalSigns }>('/modules/vital-signs', payload);
    return response.data;
};

export const updateVitalSigns = async (id: number | string, payload: UpdateVitalSignsPayload): Promise<{ message: string; data: VitalSigns }> => {
    const response = await api.put<{ message: string; data: VitalSigns }>(`/modules/vital-signs/${id}`, payload);
    return response.data;
};

export default api;



