import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { Student } from '../types';

export interface ModuleStatus {
  patientInfo: 'Pending' | 'Completed';
  oralHealth: 'Pending' | 'Completed';
  deworming: 'Pending' | 'Completed';
  immunization: 'Pending' | 'Completed';
  vitalSigns: 'Pending' | 'Completed';
}

interface MockDataContextType {
  students: Student[];
  moduleStatuses: Record<number, ModuleStatus>;
  registerStudent: (student: Omit<Student, 'id'>) => void;
  updateModuleStatus: (studentId: number, moduleName: keyof ModuleStatus, status: 'Pending' | 'Completed') => void;
}

const defaultModuleStatus: ModuleStatus = {
  patientInfo: 'Pending',
  oralHealth: 'Pending',
  deworming: 'Pending',
  immunization: 'Pending',
  vitalSigns: 'Pending',
};

const mockStudents: Student[] = [
  {
    id: 1,
    prefix: 'MR.',
    student_lrn: '123456789012',
    first_name: 'Juan',
    middle_name: 'Dela',
    last_name: 'Cruz',
    date_of_birth: '2010-05-15',
    sex: 'Male',
    school_id: 1,
    grade_level: 'Grade 7',
    section: 'A',
  },
  {
    id: 2,
    prefix: 'MISS',
    student_lrn: '987654321098',
    first_name: 'Maria',
    middle_name: '',
    last_name: 'Clara',
    date_of_birth: '2011-08-20',
    sex: 'Female',
    school_id: 1,
    grade_level: 'Grade 7',
    section: 'B',
  },
];

const mockModuleStatuses: Record<number, ModuleStatus> = {
  1: {
    patientInfo: 'Completed',
    oralHealth: 'Completed',
    deworming: 'Pending',
    immunization: 'Completed',
    vitalSigns: 'Completed',
  },
  2: { ...defaultModuleStatus },
};

const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

export const MockDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [students, setStudents] = useState<Student[]>(mockStudents);
  const [moduleStatuses, setModuleStatuses] = useState<Record<number, ModuleStatus>>(mockModuleStatuses);

  const registerStudent = (student: Omit<Student, 'id'>) => {
    const newId = students.length > 0 ? Math.max(...students.map(s => s.id || 0)) + 1 : 1;
    const newStudent = { ...student, id: newId };
    setStudents((prev) => [...prev, newStudent]);
    setModuleStatuses((prev) => ({
      ...prev,
      [newId]: { ...defaultModuleStatus },
    }));
  };

  const updateModuleStatus = (studentId: number, moduleName: keyof ModuleStatus, status: 'Pending' | 'Completed') => {
    setModuleStatuses((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [moduleName]: status,
      },
    }));
  };

  return (
    <MockDataContext.Provider value={{ students, moduleStatuses, registerStudent, updateModuleStatus }}>
      {children}
    </MockDataContext.Provider>
  );
};

export const useMockData = () => {
  const context = useContext(MockDataContext);
  if (!context) {
    throw new Error('useMockData must be used within a MockDataProvider');
  }
  return context;
};
