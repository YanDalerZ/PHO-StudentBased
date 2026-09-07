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
    DashboardFilters,
    DashboardOverviewResponse,
    PatientInfoDashboardResponse,
    OralHealthDashboardResponse,
    DewormingDashboardResponse,
    DewormingReportResponse,
    VitalSignsDashboardResponse,
    ImmunizationDashboardResponse,
    AdminDashboardStats,
    AdminUserSummary,
    GetAdminUsersParams,
    AdminUserListResponse,
    CreateAdminUserPayload,
    UpdateAdminUserPayload,
    UpdateAdminUserStatusPayload,
    AdminModule,
    CreateAdminModulePayload,
    UpdateAdminModulePayload,
    AdminSchool,
    GetAdminSchoolsParams,
    AdminSchoolListResponse,
    CreateAdminSchoolPayload,
    UpdateAdminSchoolPayload,
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

export const getLookupModules = async (): Promise<AdminModule[]> => {
    const response = await api.get<AdminModule[]>('/lookup/modules');
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

// Dashboard
export const getDashboardOverview = async (
    filters?: DashboardFilters
): Promise<DashboardOverviewResponse> => {
    const params: Record<string, string | number> = {};
    if (filters?.municipality_id) params.municipality_id = filters.municipality_id;
    if (filters?.barangay_id) params.barangay_id = filters.barangay_id;
    if (filters?.school_id) params.school_id = filters.school_id;
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;

    const response = await api.get<{ data: DashboardOverviewResponse }>(
        '/dashboard/overview',
        { params }
    );
    return response.data.data;
};

export const getPatientInfoDashboard = async (
    filters?: DashboardFilters
): Promise<PatientInfoDashboardResponse> => {
    const params: Record<string, string | number> = {};
    if (filters?.municipality_id) params.municipality_id = filters.municipality_id;
    if (filters?.barangay_id) params.barangay_id = filters.barangay_id;
    if (filters?.school_id) params.school_id = filters.school_id;
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;

    const response = await api.get<{ data: PatientInfoDashboardResponse }>(
        '/modules/patient-info/dashboard',
        { params }
    );
    return response.data.data;
};

export const getOralHealthDashboard = async (
    filters?: DashboardFilters
): Promise<OralHealthDashboardResponse> => {
    const params: Record<string, string | number> = {};
    if (filters?.municipality_id) params.municipality_id = filters.municipality_id;
    if (filters?.barangay_id) params.barangay_id = filters.barangay_id;
    if (filters?.school_id) params.school_id = filters.school_id;
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;

    const response = await api.get<{ data: OralHealthDashboardResponse }>(
        '/modules/oral-health/dashboard',
        { params }
    );
    return response.data.data;
};

export const getDewormingDashboard = async (
    filters?: DashboardFilters
): Promise<DewormingDashboardResponse> => {
    const params: Record<string, string | number> = {};
    if (filters?.municipality_id) params.municipality_id = filters.municipality_id;
    if (filters?.barangay_id) params.barangay_id = filters.barangay_id;
    if (filters?.school_id) params.school_id = filters.school_id;
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;

    const response = await api.get<{ data: DewormingDashboardResponse }>(
        '/modules/deworming/dashboard',
        { params }
    );
    return response.data.data;
};

export const getDewormingReport = async (
    period: string
): Promise<DewormingReportResponse> => {
    const response = await api.get<{ data: DewormingReportResponse }>(
        '/modules/deworming/report',
        { params: { period } }
    );
    return response.data.data;
};

export const getVitalSignsDashboard = async (
    filters?: DashboardFilters
): Promise<VitalSignsDashboardResponse> => {
    const params: Record<string, string | number> = {};
    if (filters?.municipality_id) params.municipality_id = filters.municipality_id;
    if (filters?.barangay_id) params.barangay_id = filters.barangay_id;
    if (filters?.school_id) params.school_id = filters.school_id;
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;

    const response = await api.get<{ data: VitalSignsDashboardResponse }>(
        '/modules/vital-signs/dashboard',
        { params }
    );
    return response.data.data;
};

export const getImmunizationDashboard = async (
    filters?: DashboardFilters
): Promise<ImmunizationDashboardResponse> => {
    const params: Record<string, string | number> = {};
    if (filters?.municipality_id) params.municipality_id = filters.municipality_id;
    if (filters?.barangay_id) params.barangay_id = filters.barangay_id;
    if (filters?.school_id) params.school_id = filters.school_id;
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;

    const response = await api.get<{ data: ImmunizationDashboardResponse }>(
        '/modules/immunization/dashboard',
        { params }
    );
    return response.data.data;
};

// Admin Dashboard
export const getAdminDashboard = async (): Promise<AdminDashboardStats> => {
    const response = await api.get<{ data: AdminDashboardStats }>('/admin/dashboard');
    return response.data.data;
};

// Admin User Management
export const getAdminUsers = async (params?: GetAdminUsersParams): Promise<AdminUserListResponse> => {
    const response = await api.get<AdminUserListResponse>('/admin/users', { params });
    return response.data;
};

export const createAdminUser = async (payload: CreateAdminUserPayload): Promise<AdminUserSummary> => {
    const response = await api.post<{ data: AdminUserSummary }>('/admin/users', payload);
    return response.data.data;
};

export const updateAdminUser = async (id: number, payload: UpdateAdminUserPayload): Promise<AdminUserSummary> => {
    const response = await api.put<{ data: AdminUserSummary }>(`/admin/users/${id}`, payload);
    return response.data.data;
};

export const updateAdminUserStatus = async (id: number, payload: UpdateAdminUserStatusPayload): Promise<AdminUserSummary> => {
    const response = await api.patch<{ data: AdminUserSummary }>(`/admin/users/${id}/status`, payload);
    return response.data.data;
};

// Admin Module Management
export const getAdminModules = async (): Promise<AdminModule[]> => {
    const response = await api.get<{ data: AdminModule[]; total: number }>('/admin/modules');
    return response.data.data;
};

export const createAdminModule = async (payload: CreateAdminModulePayload): Promise<AdminModule> => {
    const response = await api.post<{ data: AdminModule }>('/admin/modules', payload);
    return response.data.data;
};

export const updateAdminModule = async (id: number, payload: UpdateAdminModulePayload): Promise<AdminModule> => {
    const response = await api.put<{ data: AdminModule }>(`/admin/modules/${id}`, payload);
    return response.data.data;
};

// Admin School Management
export const getAdminSchools = async (params?: GetAdminSchoolsParams): Promise<AdminSchoolListResponse> => {
    const response = await api.get<AdminSchoolListResponse>('/admin/schools', { params });
    return response.data;
};

export const createAdminSchool = async (payload: CreateAdminSchoolPayload): Promise<AdminSchool> => {
    const response = await api.post<{ data: AdminSchool }>('/admin/schools', payload);
    return response.data.data;
};

export const updateAdminSchool = async (id: number, payload: UpdateAdminSchoolPayload): Promise<AdminSchool> => {
    const response = await api.put<{ data: AdminSchool }>(`/admin/schools/${id}`, payload);
    return response.data.data;
};

export default api;





