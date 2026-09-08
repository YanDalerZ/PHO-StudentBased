-- 1. Geography & Lookup Tables
CREATE TABLE COUNTRIES (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL
);

CREATE TABLE REGIONS (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    country_id INT NOT NULL,
    FOREIGN KEY (country_id) REFERENCES COUNTRIES(id)
);

CREATE TABLE PROVINCES (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    region_id INT NOT NULL,
    FOREIGN KEY (region_id) REFERENCES REGIONS(id)
);

CREATE TABLE MUNICIPALITIES (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    province_id INT NOT NULL,
    FOREIGN KEY (province_id) REFERENCES PROVINCES(id)
);

CREATE TABLE BARANGAYS (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    municipality_id INT NOT NULL,
    FOREIGN KEY (municipality_id) REFERENCES MUNICIPALITIES(id)
);

-- 2. Users, Schools, Modules
CREATE TYPE user_role AS ENUM ('teacher', 'superuser', 'admin');

CREATE TABLE USERS (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    contact_no VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    failed_login_attempts INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE SCHOOLS (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    barangay_id INT,
    district VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (barangay_id) REFERENCES BARANGAYS(id)
);

CREATE TABLE MODULES (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Students
CREATE TYPE gender_enum AS ENUM ('Male', 'Female');

CREATE TABLE STUDENTS (
    id SERIAL PRIMARY KEY,

    -- I. PERSONAL INFORMATION
    prefix VARCHAR(20) DEFAULT 'NOT APPLICABLE',
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(20) DEFAULT 'NOT APPLICABLE',
    sex gender_enum NOT NULL,
    date_of_birth DATE NOT NULL,
    photo_url TEXT,

    -- II. OTHER PERSONAL INFORMATION
    birth_place VARCHAR(200),
    civil_status VARCHAR(50),
    educational_attainment VARCHAR(100),
    employment_status VARCHAR(100),
    tax_id_no VARCHAR(50),
    religion VARCHAR(200),
    is_indigenous BOOLEAN DEFAULT FALSE,
    indigenous_group VARCHAR(100),
    blood_type VARCHAR(5),

    -- Mother's Information
    mother_first_name VARCHAR(100),
    mother_last_name VARCHAR(100),
    mother_middle_name VARCHAR(100),
    mother_birthdate DATE,

    -- III. ADDRESS AND CONTACT INFO
    country VARCHAR(100) DEFAULT 'PHILIPPINES',
    region VARCHAR(100) DEFAULT 'REGION 6',
    province VARCHAR(100) DEFAULT 'AKLAN',
    municipality_id INT,
    barangay_id INT,
    street_address VARCHAR(300),
    zip_code VARCHAR(10),
    email VARCHAR(200),
    mobile VARCHAR(20),
    landline VARCHAR(20),

    -- IV. OTHER INFO (4Ps/PWD)
    is_4ps_member BOOLEAN DEFAULT FALSE,
    fourps_household_no VARCHAR(50),
    is_pwd BOOLEAN DEFAULT FALSE,
    pwd_type VARCHAR(100),
    pwd_id VARCHAR(50),
    psa_national_id VARCHAR(50),

    -- V. PHILHEALTH INFO
    is_philhealth_member BOOLEAN DEFAULT FALSE,
    philhealth_no VARCHAR(50),
    philhealth_status_type VARCHAR(20),
    philhealth_category VARCHAR(200),

    -- School / Academic Info
    student_lrn VARCHAR(50) UNIQUE,
    school_id INT,
    grade_level VARCHAR(30),
    section VARCHAR(100),

    -- Parent/Guardian
    parent_guardian_name VARCHAR(200),
    parent_guardian_contact VARCHAR(20),

    -- System fields
    registered_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (municipality_id) REFERENCES MUNICIPALITIES(id),
    FOREIGN KEY (barangay_id) REFERENCES BARANGAYS(id),
    FOREIGN KEY (school_id) REFERENCES SCHOOLS(id),
    FOREIGN KEY (registered_by) REFERENCES USERS(id)
);

-- 4. Module 1: Patient Info
CREATE TABLE PATIENT_INFO (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    file_no VARCHAR(50),
    recorded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES STUDENTS(id),
    FOREIGN KEY (recorded_by) REFERENCES USERS(id)
);

CREATE TABLE ANIMAL_BITES (
    id SERIAL PRIMARY KEY,
    patient_info_id INT NOT NULL,
    student_id INT NOT NULL,

    -- Case Information
    rabies_exposure_category VARCHAR(20),
    anatomical_locations JSONB,
    animal_type VARCHAR(50),
    type_of_exposure VARCHAR(500),
    wash_bite BOOLEAN,
    date_of_exposure DATE,

    -- Place of Occurrence
    exposure_region VARCHAR(100),
    exposure_province VARCHAR(100),
    exposure_municipality VARCHAR(100),
    exposure_barangay VARCHAR(100),

    -- Vaccine Information
    arv_day_0 DATE,
    arv_day_3 DATE,
    arv_day_7 DATE,
    arv_day_14 DATE,
    arv_day_28 DATE,
    rig_date DATE,
    is_active_case BOOLEAN DEFAULT FALSE,

    recorded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_info_id) REFERENCES PATIENT_INFO(id),
    FOREIGN KEY (student_id) REFERENCES STUDENTS(id),
    FOREIGN KEY (recorded_by) REFERENCES USERS(id)
);

-- 5. Module 2: Oral Health
CREATE TYPE service_location_enum AS ENUM ('FACILITY', 'NON-FACILITY');
CREATE TYPE visit_type_enum AS ENUM ('1ST VISIT', '2ND VISIT');

CREATE TABLE ORAL_HEALTH (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    date_examined DATE NOT NULL,

    is_pregnant BOOLEAN DEFAULT FALSE,

    has_oral_screening BOOLEAN DEFAULT FALSE,
    has_risk_assessment BOOLEAN DEFAULT FALSE,
    has_oral_prophylaxis BOOLEAN DEFAULT FALSE,
    has_counseling BOOLEAN DEFAULT FALSE,
    has_fluoride_varnish BOOLEAN DEFAULT FALSE,

    is_rpoc_complete BOOLEAN DEFAULT FALSE,

    service_location service_location_enum,
    visit_type visit_type_enum,
    administered_by VARCHAR(200),

    remarks TEXT,

    recorded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES STUDENTS(id),
    FOREIGN KEY (recorded_by) REFERENCES USERS(id)
);

-- 6. Module 3: Deworming
CREATE TYPE school_type_enum AS ENUM ('public', 'private');

CREATE TABLE DEWORMING (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    date_dewormed DATE NOT NULL,
    age_group VARCHAR(10),
    medication_given VARCHAR(100),
    is_dewormed BOOLEAN DEFAULT TRUE,
    school_type school_type_enum,
    in_school BOOLEAN DEFAULT TRUE,
    school_id INT,
    remarks TEXT,
    recorded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES STUDENTS(id),
    FOREIGN KEY (school_id) REFERENCES SCHOOLS(id),
    FOREIGN KEY (recorded_by) REFERENCES USERS(id)
);

-- 7. Module 4: Immunization
CREATE TABLE IMMUNIZATION (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    immunization_date DATE NOT NULL,

    immunization_type VARCHAR(100) DEFAULT 'SCHOOL & COMMUNITY BASED IMMUNIZATION',

    vaccine_td1 BOOLEAN DEFAULT FALSE,
    vaccine_mr1 BOOLEAN DEFAULT FALSE,
    vaccine_hpv1 BOOLEAN DEFAULT FALSE,
    vaccine_hpv2 BOOLEAN DEFAULT FALSE,
    vaccine_td2 BOOLEAN DEFAULT FALSE,
    vaccine_mr2 BOOLEAN DEFAULT FALSE,

    is_school_based BOOLEAN DEFAULT TRUE,
    educational_level VARCHAR(30),

    is_from_other_facility BOOLEAN DEFAULT FALSE,
    other_facility_name VARCHAR(200),

    lot_batch_no VARCHAR(100),

    consent_given BOOLEAN,
    is_sick_today BOOLEAN DEFAULT FALSE,
    history_of_allergies VARCHAR(500),
    is_deferred BOOLEAN DEFAULT FALSE,
    is_refused BOOLEAN DEFAULT FALSE,
    refusal_reason_code VARCHAR(10),
    refusal_reason_text TEXT,

    is_fully_immunized BOOLEAN DEFAULT FALSE,

    vaccinator_name VARCHAR(200),
    supervisor_name VARCHAR(200),
    remarks TEXT,

    school_id INT,
    recorded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES STUDENTS(id),
    FOREIGN KEY (school_id) REFERENCES SCHOOLS(id),
    FOREIGN KEY (recorded_by) REFERENCES USERS(id)
);

-- 8. Module 5: Vital Signs
CREATE TABLE VITAL_SIGNS (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    date_checked DATE NOT NULL,
    
    blood_pressure_systolic INT,
    blood_pressure_diastolic INT,
    heart_rate INT,
    respiratory_rate INT,
    temperature DECIMAL(4,2),
    
    weight_kg DECIMAL(5,2),
    height_cm DECIMAL(5,2),
    bmi DECIMAL(5,2),
    
    remarks TEXT,
    
    recorded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES STUDENTS(id),
    FOREIGN KEY (recorded_by) REFERENCES USERS(id)
);
