import type { Student, Municipality, Barangay, School } from '../types';

import { MOCK_MUNICIPALITIES, MOCK_BARANGAYS } from '../utils/mockLocations';

const MOCK_SCHOOLS: School[] = [
    { id: 1, name: 'Kalibo Elementary School', barangay_id: '7-013' },
    { id: 2, name: 'Aklan National High School', barangay_id: '7-001' },
    { id: 3, name: 'Malay National High School', barangay_id: '12-002' },
    { id: 4, name: 'Banga National High School', barangay_id: '3-019' }
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
