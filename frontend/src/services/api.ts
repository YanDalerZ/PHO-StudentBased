import type { Student, Municipality, Barangay, School } from '../types';

// Mock data for location cascading dropdowns
const MOCK_MUNICIPALITIES: Municipality[] = [
    { id: '1', name: 'Kalibo' },
    { id: '2', name: 'Malay' },
    { id: '3', name: 'Banga' }
];

const MOCK_BARANGAYS: Barangay[] = [
    { id: '101', municipality_id: '1', name: 'Andagao' },
    { id: '102', municipality_id: '1', name: 'Poblacion' },
    { id: '201', municipality_id: '2', name: 'Boracay' },
    { id: '202', municipality_id: '2', name: 'Caticlan' },
    { id: '301', municipality_id: '3', name: 'Bacan' }
];

const MOCK_SCHOOLS: School[] = [
    { id: 1, name: 'Kalibo Elementary School', barangay_id: '102' },
    { id: 2, name: 'Aklan National High School', barangay_id: '101' },
    { id: 3, name: 'Malay National High School', barangay_id: '202' }
];

export const getMunicipalities = async (): Promise<Municipality[]> => {
    return new Promise(resolve => setTimeout(() => resolve(MOCK_MUNICIPALITIES), 400));
};

export const getBarangays = async (municipalityId: string): Promise<Barangay[]> => {
    return new Promise(resolve => 
        setTimeout(() => resolve(MOCK_BARANGAYS.filter(b => b.municipality_id === municipalityId)), 400)
    );
};

export const getSchools = async (barangayId: string): Promise<School[]> => {
    return new Promise(resolve => 
        setTimeout(() => resolve(MOCK_SCHOOLS.filter(s => s.barangay_id === barangayId)), 400)
    );
};

export const createStudent = async (studentData: Student): Promise<{ message: string, id: number }> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // Simulate random failure for robust testing, or just succeed
            if (!studentData.student_lrn) {
                reject(new Error("LRN is required"));
            } else {
                resolve({ message: "Student registered successfully", id: Math.floor(Math.random() * 1000) });
            }
        }, 1200);
    });
};
