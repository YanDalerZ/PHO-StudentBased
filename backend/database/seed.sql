-- Seed Data for PHO-StudentBased

-- 1. Geography
INSERT INTO COUNTRIES (name, code) VALUES ('Philippines', 'PH');

INSERT INTO REGIONS (name, code, country_id) VALUES ('Region 6 - Western Visayas', '6', 1);

INSERT INTO PROVINCES (name, region_id) VALUES ('Aklan', 1);

-- Aklan Municipalities
INSERT INTO MUNICIPALITIES (name, province_id) VALUES 
('Altavas', 1), ('Balete', 1), ('Banga', 1), ('Batan', 1), 
('Buruanga', 1), ('Ibajay', 1), ('Kalibo', 1), ('Lezo', 1), 
('Libacao', 1), ('Madalag', 1), ('Makato', 1), ('Malay', 1), 
('Malinao', 1), ('Nabas', 1), ('New Washington', 1), 
('Numancia', 1), ('Tangalan', 1);

-- Sample Barangays for Kalibo (ID=7)
INSERT INTO BARANGAYS (name, municipality_id) VALUES 
('Andagao', 7), ('Bakhaw Norte', 7), ('Bakhaw Sur', 7), 
('Briones', 7), ('Buswang New', 7), ('Buswang Old', 7), 
('Caano', 7), ('Estancia', 7), ('Linabuan Norte', 7), 
('Mabilo', 7), ('Mobo', 7), ('Nalook', 7), 
('Poblacion', 7), ('Pook', 7), ('Tigayon', 7), ('Tinigaw', 7);

-- 2. Users (Passwords are 'password123' hashed with bcrypt, round 10: $2a$10$X13z0wBOnUqJ.Xo24zI2dOYU2mX6x3K/s5B84y4N3r4zK7Zt0GZ5W)
-- I am inserting an admin, superuser, and a teacher
INSERT INTO USERS (email, password_hash, role, first_name, last_name, is_active) VALUES 
('admin@pho.gov.ph', '$2b$10$BT3iHLjxOkdQ3apKbAhZVuJllbRBZX07SdECFZWDRnma2hzJ0EvUO', 'admin', 'System', 'Admin', true),
('super@pho.gov.ph', '$2b$10$BT3iHLjxOkdQ3apKbAhZVuJllbRBZX07SdECFZWDRnma2hzJ0EvUO', 'superuser', 'PHO', 'Doctor', true),
('teacher@pho.gov.ph', '$2b$10$BT3iHLjxOkdQ3apKbAhZVuJllbRBZX07SdECFZWDRnma2hzJ0EvUO', 'teacher', 'Juan', 'Dela Cruz', true);

-- 3. Schools
INSERT INTO SCHOOLS (name, address, barangay_id, district) VALUES 
('Kalibo Elementary School', 'Poblacion, Kalibo', 13, 'District I'),
('Aklan National High School', 'Andagao, Kalibo', 1, 'District I');

-- 4. Modules
INSERT INTO MODULES (name, slug, description, sort_order) VALUES
('Patient Information', 'patient-info', 'Basic client registry and animal bite records', 1),
('Oral Health', 'oral-health', 'Routine Preventive Oral Care (RPOC)', 2),
('Deworming', 'deworming', 'Deworming medication tracking', 3),
('Immunization', 'immunization', 'School and community based immunization', 4),
('Vital Signs', 'vital-signs', 'Basic vital signs screening', 5);
