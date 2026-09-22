import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
    ArrowLeft,
    Save,
    CheckCircle2,
    User,
    ShieldAlert,
    AlertTriangle,
    Loader2,
    FolderPlus,
    Activity
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    getStudent,
    updateStudent,
    getPatientInfoByStudent,
    createPatientInfo,
    updatePatientInfo,
} from '../../services/api';
import type {
    Student,
    PatientInfo,
    AnimalBite,
    AnimalBitePayload,
} from '../../types';

const ANATOMICAL_OPTIONS = [
    'Abdomen',
    'Foot',
    'Forearm/Arm',
    'Hand',
    'Head',
    'Knee',
    'Legs',
    'Neck',
];

const PatientInfoForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const isSuperUser = location.pathname.startsWith('/superuser');
    const basePath = isSuperUser ? '/superuser' : '/teacher';

    const [loading, setLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'basic' | 'animal'>('basic');

    const [student, setStudent] = useState<Student | null>(null);
    const [existingPatientInfo, setExistingPatientInfo] = useState<PatientInfo | null>(null);
    const [existingAnimalBite, setExistingAnimalBite] = useState<AnimalBite | null>(null);

    // Patient Info fields
    const [fileNo, setFileNo] = useState<string>('');

    // Student Demographic fields
    const [civilStatus, setCivilStatus] = useState<string>('SINGLE');
    const [bloodType, setBloodType] = useState<string>('');
    const [educationalAttainment, setEducationalAttainment] = useState<string>('');
    const [religion, setReligion] = useState<string>('');
    const [isIndigenous, setIsIndigenous] = useState<boolean>(false);
    const [indigenousGroup, setIndigenousGroup] = useState<string>('');
    const [motherFirstName, setMotherFirstName] = useState<string>('');
    const [motherLastName, setMotherLastName] = useState<string>('');
    const [motherMiddleName, setMotherMiddleName] = useState<string>('');
    const [motherBirthdate, setMotherBirthdate] = useState<string>('');
    const [is4psMember, setIs4psMember] = useState<boolean>(false);
    const [fourpsHouseholdNo, setFourpsHouseholdNo] = useState<string>('');
    const [isPwd, setIsPwd] = useState<boolean>(false);
    const [pwdType, setPwdType] = useState<string>('');
    const [pwdId, setPwdId] = useState<string>('');
    const [psaNationalId, setPsaNationalId] = useState<string>('');
    const [isPhilhealthMember, setIsPhilhealthMember] = useState<boolean>(false);
    const [philhealthNo, setPhilhealthNo] = useState<string>('');
    const [philhealthStatusType, setPhilhealthStatusType] = useState<string>('');
    const [philhealthCategory, setPhilhealthCategory] = useState<string>('');

    // Animal Bite sub-form fields
    const [hasAnimalBite, setHasAnimalBite] = useState<boolean>(false);
    const [rabiesCategory, setRabiesCategory] = useState<string>('');
    const [animalType, setAnimalType] = useState<string>('');
    const [washBite, setWashBite] = useState<boolean>(false);
    const [typeOfExposure, setTypeOfExposure] = useState<string>('');
    const [dateOfExposure, setDateOfExposure] = useState<string>('');
    const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
    const [exposureRegion, setExposureRegion] = useState<string>('REGION 6');
    const [exposureProvince, setExposureProvince] = useState<string>('AKLAN');
    const [exposureMunicipality, setExposureMunicipality] = useState<string>('');
    const [exposureBarangay, setExposureBarangay] = useState<string>('');
    const [arvDay0, setArvDay0] = useState<string>('');
    const [arvDay3, setArvDay3] = useState<string>('');
    const [arvDay7, setArvDay7] = useState<string>('');
    const [arvDay14, setArvDay14] = useState<string>('');
    const [arvDay28, setArvDay28] = useState<string>('');
    const [rigDate, setRigDate] = useState<string>('');
    const [isActiveCase, setIsActiveCase] = useState<boolean>(false);

    useEffect(() => {
        let isMounted = true;
        if (!id) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                const [studentRes, patientInfoRes] = await Promise.all([
                    getStudent(id),
                    getPatientInfoByStudent(id).catch((err: unknown) => {
                        // If no patient info yet, that is fine
                        if (axios.isAxiosError(err) && err.response?.status === 404) {
                            return { data: { patient_info: null, all_patient_records: [], animal_bites: [] } };
                        }
                        throw err;
                    })
                ]);

                if (!isMounted) return;

                const st = studentRes.data;
                setStudent(st);

                // Populate student demographic values
                setCivilStatus(st.civil_status || 'SINGLE');
                setBloodType(st.blood_type || '');
                setEducationalAttainment(st.educational_attainment || '');
                setReligion(st.religion || '');
                setIsIndigenous(Boolean(st.is_indigenous || st.indigenous === 'Yes'));
                setIndigenousGroup(st.indigenous_group || '');
                setMotherFirstName(st.mother_first_name || '');
                setMotherLastName(st.mother_last_name || '');
                setMotherMiddleName(st.mother_middle_name || '');
                setMotherBirthdate(st.mother_birthdate || '');
                setIs4psMember(Boolean(st.is_4ps_member || st.dswd_4ps === 'Yes'));
                setFourpsHouseholdNo(st.fourps_household_no || st.dswd_4ps_no || '');
                setIsPwd(Boolean(st.is_pwd === true || st.is_pwd === 'Yes'));
                setPwdType(st.pwd_type || '');
                setPwdId(st.pwd_id || st.pwd_id_no || '');
                setPsaNationalId(st.psa_national_id || '');
                setIsPhilhealthMember(Boolean(st.is_philhealth_member || st.philhealth_member === 'Yes'));
                setPhilhealthNo(st.philhealth_no || st.philhealth_id || '');
                setPhilhealthStatusType(st.philhealth_status_type || '');
                setPhilhealthCategory(st.philhealth_category || '');

                // Populate patient info if existing
                const piData = patientInfoRes.data;
                if (piData?.patient_info) {
                    setExistingPatientInfo(piData.patient_info);
                    setFileNo(piData.patient_info.file_no || '');
                }

                // Populate animal bite if existing
                if (piData?.animal_bites && piData.animal_bites.length > 0) {
                    const bite = piData.animal_bites[0];
                    setExistingAnimalBite(bite);
                    setHasAnimalBite(true);
                    setRabiesCategory(bite.rabies_exposure_category || '');
                    setAnimalType(bite.animal_type || '');
                    setWashBite(Boolean(bite.wash_bite));
                    setTypeOfExposure(bite.type_of_exposure || '');
                    setDateOfExposure(bite.date_of_exposure || '');
                    setSelectedLocations(bite.anatomical_locations || []);
                    setExposureRegion(bite.exposure_region || 'REGION 6');
                    setExposureProvince(bite.exposure_province || 'AKLAN');
                    setExposureMunicipality(bite.exposure_municipality || '');
                    setExposureBarangay(bite.exposure_barangay || '');
                    setArvDay0(bite.arv_day_0 || '');
                    setArvDay3(bite.arv_day_3 || '');
                    setArvDay7(bite.arv_day_7 || '');
                    setArvDay14(bite.arv_day_14 || '');
                    setArvDay28(bite.arv_day_28 || '');
                    setRigDate(bite.rig_date || '');
                    setIsActiveCase(Boolean(bite.is_active_case));
                }

                setErrorStatus(null);
                setErrorMessage(null);
            } catch (err: unknown) {
                console.error('Failed to load patient info data:', err);
                let status = 500;
                if (axios.isAxiosError(err) && err.response?.status) {
                    status = err.response.status;
                }
                setErrorStatus(status);
                if (status === 403) {
                    setErrorMessage('You do not have permission to view or manage patient info for this student.');
                } else if (status === 404) {
                    setErrorMessage('Student record was not found in the registry.');
                } else {
                    setErrorMessage('Failed to load patient information. Please try again.');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [id]);

    const toggleLocation = (location: string) => {
        setSelectedLocations(prev =>
            prev.includes(location)
                ? prev.filter(l => l !== location)
                : [...prev, location]
        );
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !student) return;

        setIsSaving(true);
        try {
            // 1. Prepare Animal Bite payload if active
            let animalBitePayload: AnimalBitePayload | null = null;
            if (hasAnimalBite) {
                animalBitePayload = {
                    id: existingAnimalBite?.id,
                    rabies_exposure_category: rabiesCategory || null,
                    animal_type: animalType || null,
                    wash_bite: washBite,
                    type_of_exposure: typeOfExposure || null,
                    date_of_exposure: dateOfExposure || null,
                    anatomical_locations: selectedLocations.length > 0 ? selectedLocations : null,
                    exposure_region: exposureRegion || null,
                    exposure_province: exposureProvince || null,
                    exposure_municipality: exposureMunicipality || null,
                    exposure_barangay: exposureBarangay || null,
                    arv_day_0: arvDay0 || null,
                    arv_day_3: arvDay3 || null,
                    arv_day_7: arvDay7 || null,
                    arv_day_14: arvDay14 || null,
                    arv_day_28: arvDay28 || null,
                    rig_date: rigDate || null,
                    is_active_case: isActiveCase,
                };
            }

            // 2. Save Patient Info (create or update)
            if (existingPatientInfo) {
                await updatePatientInfo(existingPatientInfo.id, {
                    file_no: fileNo || null,
                    animal_bite: animalBitePayload,
                });
            } else {
                await createPatientInfo({
                    student_id: Number(id),
                    file_no: fileNo || null,
                    animal_bite: animalBitePayload,
                });
            }

            // 3. Sync student socio-demographic updates
            await updateStudent(id, {
                civil_status: civilStatus,
                blood_type: bloodType || null,
                educational_attainment: educationalAttainment || null,
                religion: religion || null,
                is_indigenous: isIndigenous,
                indigenous_group: isIndigenous ? indigenousGroup || null : null,
                mother_first_name: motherFirstName || null,
                mother_last_name: motherLastName || null,
                mother_middle_name: motherMiddleName || null,
                mother_birthdate: motherBirthdate || null,
                is_4ps_member: is4psMember,
                fourps_household_no: is4psMember ? fourpsHouseholdNo || null : null,
                is_pwd: isPwd,
                pwd_type: isPwd ? pwdType || null : null,
                pwd_id: isPwd ? pwdId || null : null,
                psa_national_id: psaNationalId || null,
                is_philhealth_member: isPhilhealthMember,
                philhealth_no: isPhilhealthMember ? philhealthNo || null : null,
                philhealth_status_type: isPhilhealthMember ? philhealthStatusType || null : null,
                philhealth_category: isPhilhealthMember ? philhealthCategory || null : null,
            });

            toast.success('Patient information and clinical history saved successfully');
            navigate(`${basePath}/students/${id}`);
        } catch (err: unknown) {
            console.error('Failed to save patient information:', err);
            if (axios.isAxiosError(err) && err.response?.data?.message) {
                toast.error(err.response.data.message);
            } else {
                toast.error('Failed to save patient information. Please review the inputs.');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const inputClasses = "w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400";
    const labelClasses = "block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5";
    const sectionClasses = "space-y-6 pt-6 mt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-base font-bold text-slate-900 mb-4 flex items-center";

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                <p className="text-sm font-medium text-slate-500">Loading patient information...</p>
            </div>
        );
    }

    if (errorStatus === 403) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
                <div className="p-4 bg-amber-50 text-amber-600 rounded-full mb-4 border border-amber-200">
                    <ShieldAlert className="w-12 h-12" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
                <p className="text-sm text-slate-600 max-w-md mt-2">
                    {errorMessage}
                </p>
                <Link
                    to={`${basePath}/students`}
                    className="mt-6 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center shadow-xs"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Student Registry
                </Link>
            </div>
        );
    }

    if (!student || errorStatus === 404) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
                <h2 className="text-xl font-bold text-slate-800">Student Not Found</h2>
                <p className="text-sm text-slate-500 max-w-md mt-2">
                    {errorMessage || 'The requested student record could not be found.'}
                </p>
                <Link
                    to={`${basePath}/students`}
                    className="mt-6 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center shadow-xs"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Student Registry
                </Link>
            </div>
        );
    }

    const isRecordCompleted = Boolean(existingPatientInfo);

    const tabs = [
        { id: 'basic', label: 'Patient Info & Demographics', icon: User },
        { id: 'animal', label: 'Animal Bite / Rabies Exposure', icon: Activity },
    ] as const;

    return (
        <div className="space-y-6 pb-12 max-w-5xl mx-auto">
            <Link to={`${basePath}/students/${id}`} className="text-sm text-slate-500 hover:text-teal-600 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to Student Profile
            </Link>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Patient Information</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Student: <span className="font-semibold text-slate-800">{student.first_name} {student.middle_name ? `${student.middle_name[0]}. ` : ''}{student.last_name}</span> (LRN: <span className="font-mono text-slate-700">{student.student_lrn}</span>)
                    </p>
                </div>
                {isRecordCompleted ? (
                    <span className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200 shadow-2xs w-fit">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Completed Module</span>
                    </span>
                ) : (
                    <span className="flex items-center space-x-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-3.5 py-1.5 rounded-full border border-amber-200 shadow-2xs w-fit">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Pending Completion</span>
                    </span>
                )}
            </div>

            {/* Tab Navigation */}
            <div className="flex space-x-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 overflow-x-auto shadow-xs">
                {tabs.map(tab => (
                    <button
                        type="button"
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={cn(
                            "flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap cursor-pointer",
                            activeTab === tab.id
                                ? "bg-teal-50 text-teal-700 shadow-xs border border-teal-200/50"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <tab.icon className={cn(
                            "w-4 h-4 mr-2",
                            activeTab === tab.id ? "text-teal-600" : "text-slate-400"
                        )} />
                        {tab.label}
                        {tab.id === 'animal' && (hasAnimalBite || existingAnimalBite) && (
                            <span className="ml-2 w-2 h-2 rounded-full bg-teal-500" />
                        )}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">

                {/* TAB 1: BASIC INFO & SOCIO-DEMOGRAPHICS */}
                {activeTab === 'basic' && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        {/* Clinic Record Identification */}
                        <div>
                            <h2 className={sectionTitleClasses}>
                                <FolderPlus className="w-4 h-4 mr-2 text-teal-600" />
                                Clinic Identification
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-teal-50/50 p-4 rounded-xl border border-teal-100">
                                <div>
                                    <label className={labelClasses}>Patient / Clinic File No.</label>
                                    <input
                                        type="text"
                                        value={fileNo}
                                        onChange={e => setFileNo(e.target.value)}
                                        className={cn(inputClasses, "bg-white font-mono")}
                                        placeholder="e.g. PHO-2026-00123"
                                    />
                                    <p className="text-2xs text-slate-500 mt-1">Official health center or school clinic file tracking number.</p>
                                </div>
                                <div className="text-xs text-slate-600 flex flex-col justify-center">
                                    <p className="font-semibold text-slate-800">Assigned School:</p>
                                    <p className="mt-0.5">{student.school_name || `School ID: ${student.school_id}`}</p>
                                    <p className="font-semibold text-slate-800 mt-2">Registered By:</p>
                                    <p className="mt-0.5">{student.registered_by ? `User #${student.registered_by}` : 'N/A'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Socio-Demographics */}
                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Socio-Demographic Profile</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className={labelClasses}>Civil Status</label>
                                    <select
                                        value={civilStatus}
                                        onChange={e => setCivilStatus(e.target.value)}
                                        className={inputClasses}
                                    >
                                        <option value="SINGLE">Single</option>
                                        <option value="MARRIED">Married</option>
                                        <option value="WIDOWED">Widowed</option>
                                        <option value="SEPARATED">Separated</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClasses}>Blood Type</label>
                                    <select
                                        value={bloodType}
                                        onChange={e => setBloodType(e.target.value)}
                                        className={inputClasses}
                                    >
                                        <option value="">Select blood type...</option>
                                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClasses}>Educational Attainment</label>
                                    <input
                                        type="text"
                                        value={educationalAttainment}
                                        onChange={e => setEducationalAttainment(e.target.value)}
                                        className={inputClasses}
                                        placeholder="e.g. Grade 5, Elementary..."
                                    />
                                </div>
                                <div>
                                    <label className={labelClasses}>Religion</label>
                                    <input
                                        type="text"
                                        value={religion}
                                        onChange={e => setReligion(e.target.value)}
                                        className={inputClasses}
                                        placeholder="e.g. Roman Catholic, Christian..."
                                    />
                                </div>
                                <div className="flex flex-col space-y-2.5 p-4 border border-slate-200 rounded-xl bg-slate-50 md:col-span-2">
                                    <div className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            id="is_indigenous"
                                            checked={isIndigenous}
                                            onChange={e => setIsIndigenous(e.target.checked)}
                                            className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
                                        />
                                        <label htmlFor="is_indigenous" className="text-sm font-semibold text-slate-800 cursor-pointer">
                                            Member of Indigenous Peoples (IP) Group
                                        </label>
                                    </div>
                                    {isIndigenous && (
                                        <input
                                            type="text"
                                            value={indigenousGroup}
                                            onChange={e => setIndigenousGroup(e.target.value)}
                                            placeholder="Specify Indigenous Group (e.g. Ati)..."
                                            className={inputClasses}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Mother's Information */}
                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Parent/Guardian (Mother's Details)</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className={labelClasses}>Mother's First Name</label>
                                    <input
                                        type="text"
                                        value={motherFirstName}
                                        onChange={e => setMotherFirstName(e.target.value)}
                                        className={inputClasses}
                                    />
                                </div>
                                <div>
                                    <label className={labelClasses}>Mother's Middle Name</label>
                                    <input
                                        type="text"
                                        value={motherMiddleName}
                                        onChange={e => setMotherMiddleName(e.target.value)}
                                        className={inputClasses}
                                    />
                                </div>
                                <div>
                                    <label className={labelClasses}>Mother's Last Name</label>
                                    <input
                                        type="text"
                                        value={motherLastName}
                                        onChange={e => setMotherLastName(e.target.value)}
                                        className={inputClasses}
                                    />
                                </div>
                                <div>
                                    <label className={labelClasses}>Mother's Date of Birth</label>
                                    <input
                                        type="date"
                                        value={motherBirthdate}
                                        onChange={e => setMotherBirthdate(e.target.value)}
                                        className={inputClasses}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Other Program Identifiers */}
                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Welfare & Identification Programs</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                                    <div className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            id="is_4ps"
                                            checked={is4psMember}
                                            onChange={e => setIs4psMember(e.target.checked)}
                                            className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
                                        />
                                        <label htmlFor="is_4ps" className="text-sm font-semibold text-slate-800 cursor-pointer">
                                            DSWD 4Ps Beneficiary
                                        </label>
                                    </div>
                                    {is4psMember && (
                                        <div>
                                            <label className={labelClasses}>4Ps Household ID Number</label>
                                            <input
                                                type="text"
                                                value={fourpsHouseholdNo}
                                                onChange={e => setFourpsHouseholdNo(e.target.value)}
                                                className={inputClasses}
                                                placeholder="Enter 4Ps household number..."
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                                    <div className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            id="is_pwd"
                                            checked={isPwd}
                                            onChange={e => setIsPwd(e.target.checked)}
                                            className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
                                        />
                                        <label htmlFor="is_pwd" className="text-sm font-semibold text-slate-800 cursor-pointer">
                                            Person with Disability (PWD)
                                        </label>
                                    </div>
                                    {isPwd && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <div>
                                                <label className={labelClasses}>Disability Type</label>
                                                <input
                                                    type="text"
                                                    value={pwdType}
                                                    onChange={e => setPwdType(e.target.value)}
                                                    placeholder="e.g. Visual, Hearing..."
                                                    className={inputClasses}
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClasses}>PWD ID No.</label>
                                                <input
                                                    type="text"
                                                    value={pwdId}
                                                    onChange={e => setPwdId(e.target.value)}
                                                    placeholder="ID number..."
                                                    className={inputClasses}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="md:col-span-2">
                                    <label className={labelClasses}>PSA / PhilSys National ID</label>
                                    <input
                                        type="text"
                                        value={psaNationalId}
                                        onChange={e => setPsaNationalId(e.target.value)}
                                        className={inputClasses}
                                        placeholder="National ID / PhilSys Card Number..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* PhilHealth Details */}
                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>PhilHealth Coverage</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 md:col-span-3 flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        id="is_philhealth"
                                        checked={isPhilhealthMember}
                                        onChange={e => setIsPhilhealthMember(e.target.checked)}
                                        className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
                                    />
                                    <label htmlFor="is_philhealth" className="text-sm font-semibold text-slate-800 cursor-pointer">
                                        Covered by PhilHealth (Member or Dependent)
                                    </label>
                                </div>
                                {isPhilhealthMember && (
                                    <>
                                        <div>
                                            <label className={labelClasses}>PhilHealth Identification No.</label>
                                            <input
                                                type="text"
                                                value={philhealthNo}
                                                onChange={e => setPhilhealthNo(e.target.value)}
                                                className={inputClasses}
                                                placeholder="XX-XXXXXXXXX-X"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Membership Type</label>
                                            <select
                                                value={philhealthStatusType}
                                                onChange={e => setPhilhealthStatusType(e.target.value)}
                                                className={inputClasses}
                                            >
                                                <option value="">Select type...</option>
                                                <option value="MEMBER">Member</option>
                                                <option value="DEPENDENT">Dependent</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Category</label>
                                            <select
                                                value={philhealthCategory}
                                                onChange={e => setPhilhealthCategory(e.target.value)}
                                                className={inputClasses}
                                            >
                                                <option value="">Select category...</option>
                                                <option value="Informal Economy">Informal Economy</option>
                                                <option value="Formal Economy">Formal Economy</option>
                                                <option value="Indigent">Indigent</option>
                                                <option value="Sponsored">Sponsored</option>
                                                <option value="Lifetime">Lifetime</option>
                                                <option value="Senior Citizen">Senior Citizen</option>
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: ANIMAL BITE SUB-FORM */}
                {activeTab === 'animal' && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 flex items-start justify-between">
                            <div className="flex items-start space-x-3">
                                <Activity className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Animal Bite & Rabies Surveillance</h3>
                                    <p className="text-xs text-slate-600 mt-0.5">
                                        Record exposure details, anatomical bite locations, and anti-rabies vaccination (ARV/RIG) progress.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="toggle_bite"
                                    checked={hasAnimalBite}
                                    onChange={e => setHasAnimalBite(e.target.checked)}
                                    className="w-4 h-4 text-amber-600 rounded-sm border-amber-300 focus:ring-amber-500 cursor-pointer"
                                />
                                <label htmlFor="toggle_bite" className="text-xs font-bold text-slate-800 cursor-pointer uppercase">
                                    Record Bite Incident
                                </label>
                            </div>
                        </div>

                        {hasAnimalBite ? (
                            <>
                                <div>
                                    <h2 className={sectionTitleClasses}>Exposure & Incident Details</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className={labelClasses}>Date of Exposure</label>
                                            <input
                                                type="date"
                                                value={dateOfExposure}
                                                onChange={e => setDateOfExposure(e.target.value)}
                                                className={inputClasses}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Animal Type</label>
                                            <select
                                                value={animalType}
                                                onChange={e => setAnimalType(e.target.value)}
                                                className={inputClasses}
                                            >
                                                <option value="">Select biting animal...</option>
                                                <option value="DOG">Dog</option>
                                                <option value="CAT">Cat</option>
                                                <option value="BAT">Bat</option>
                                                <option value="MONKEY">Monkey</option>
                                                <option value="OTHERS">Others</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Rabies Exposure Category</label>
                                            <select
                                                value={rabiesCategory}
                                                onChange={e => setRabiesCategory(e.target.value)}
                                                className={inputClasses}
                                            >
                                                <option value="">Select category...</option>
                                                <option value="CATEGORY I">Category I (Touching, feeding, licks on intact skin)</option>
                                                <option value="CATEGORY II">Category II (Minor scratches, nibbling of uncovered skin)</option>
                                                <option value="CATEGORY III">Category III (Single/multiple bites, scratches, licks on broken skin)</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center space-x-3 p-3.5 border border-slate-200 rounded-xl bg-slate-50 mt-1 md:mt-5">
                                            <input
                                                type="checkbox"
                                                id="wash_bite"
                                                checked={washBite}
                                                onChange={e => setWashBite(e.target.checked)}
                                                className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
                                            />
                                            <label htmlFor="wash_bite" className="text-xs font-semibold text-slate-800 cursor-pointer">
                                                Bite wound washed immediately with soap and water
                                            </label>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className={labelClasses}>Type of Exposure / Notes</label>
                                            <input
                                                type="text"
                                                value={typeOfExposure}
                                                onChange={e => setTypeOfExposure(e.target.value)}
                                                className={inputClasses}
                                                placeholder="e.g. Deep bite wound on right forearm from stray dog..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className={sectionClasses}>
                                    <h2 className={sectionTitleClasses}>Anatomical Locations</h2>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        {ANATOMICAL_OPTIONS.map(loc => (
                                            <label key={loc} className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedLocations.includes(loc)}
                                                    onChange={() => toggleLocation(loc)}
                                                    className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500"
                                                />
                                                <span className="text-xs font-medium text-slate-700">{loc}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className={sectionClasses}>
                                    <h2 className={sectionTitleClasses}>Place of Occurrence</h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                            <label className={labelClasses}>Region</label>
                                            <input
                                                type="text"
                                                value={exposureRegion}
                                                onChange={e => setExposureRegion(e.target.value)}
                                                className={inputClasses}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Province</label>
                                            <input
                                                type="text"
                                                value={exposureProvince}
                                                onChange={e => setExposureProvince(e.target.value)}
                                                className={inputClasses}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Municipality</label>
                                            <input
                                                type="text"
                                                value={exposureMunicipality}
                                                onChange={e => setExposureMunicipality(e.target.value)}
                                                className={inputClasses}
                                                placeholder="e.g. Kalibo"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Barangay</label>
                                            <input
                                                type="text"
                                                value={exposureBarangay}
                                                onChange={e => setExposureBarangay(e.target.value)}
                                                className={inputClasses}
                                                placeholder="e.g. Poblacion"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className={sectionClasses}>
                                    <h2 className={sectionTitleClasses}>Post-Exposure Prophylaxis (PEP) Schedule</h2>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                        <div>
                                            <label className={labelClasses}>ARV Day 0</label>
                                            <input
                                                type="date"
                                                value={arvDay0}
                                                onChange={e => setArvDay0(e.target.value)}
                                                className={inputClasses}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>ARV Day 3</label>
                                            <input
                                                type="date"
                                                value={arvDay3}
                                                onChange={e => setArvDay3(e.target.value)}
                                                className={inputClasses}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>ARV Day 7</label>
                                            <input
                                                type="date"
                                                value={arvDay7}
                                                onChange={e => setArvDay7(e.target.value)}
                                                className={inputClasses}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>ARV Day 14</label>
                                            <input
                                                type="date"
                                                value={arvDay14}
                                                onChange={e => setArvDay14(e.target.value)}
                                                className={inputClasses}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>ARV Day 28</label>
                                            <input
                                                type="date"
                                                value={arvDay28}
                                                onChange={e => setArvDay28(e.target.value)}
                                                className={inputClasses}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClasses}>RIG Date</label>
                                            <input
                                                type="date"
                                                value={rigDate}
                                                onChange={e => setRigDate(e.target.value)}
                                                className={inputClasses}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-4 p-4 border border-amber-200 rounded-xl bg-amber-50 flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            id="active_case"
                                            checked={isActiveCase}
                                            onChange={e => setIsActiveCase(e.target.checked)}
                                            className="w-4 h-4 text-amber-600 rounded-sm border-amber-300 focus:ring-amber-500 cursor-pointer"
                                        />
                                        <label htmlFor="active_case" className="text-xs font-bold text-amber-900 cursor-pointer">
                                            Currently Active Rabies / Animal Bite Case (Under Active Surveillance)
                                        </label>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl">
                                <p className="text-sm font-semibold text-slate-700">No Animal Bite Case Recorded</p>
                                <p className="text-xs text-slate-500 mt-1">Check "Record Bite Incident" above if this student has suffered an animal bite or exposure.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Form Footer Actions */}
                <div className="pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-100 mt-8">
                    <p className="text-xs text-slate-500">
                        Saving creates or updates the student's official Patient Information health record and updates their clinical registry status.
                    </p>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm rounded-xl shadow-xs transition-all flex items-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Saving Record...</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                <span>Save Patient Info</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PatientInfoForm;