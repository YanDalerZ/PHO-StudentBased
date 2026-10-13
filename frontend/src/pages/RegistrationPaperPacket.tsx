import { createPortal } from 'react-dom';
import {
    BLOOD_TYPE_OPTIONS, CIVIL_STATUS_OPTIONS, EDUCATIONAL_ATTAINMENT_OPTIONS,
    EMPLOYMENT_STATUS_OPTIONS, PHILHEALTH_STATUS_OPTIONS, PWD_TYPE_OPTIONS,
    SUFFIX_OPTIONS,
} from '../utils/constants';

export type PaperSection = 1 | 2 | 3 | 'all';

type PaperField = {
    label: string;
    required?: boolean;
    condition?: string;
    choices?: readonly string[];
    lines?: number;
    wide?: boolean;
    fixed?: string;
};

const yesNo = ['Yes', 'No'];
const grades = ['Kindergarten', ...Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`)];

// These are deliberately blank and never read from RegistrationForm's student data.
const fields: Record<1 | 2 | 3, PaperField[]> = {
    1: [
        { label: 'Learner Reference Number (LRN)', required: true },
        { label: 'First Name', required: true },
        { label: 'Middle Name', required: true },
        { label: 'Last Name', required: true },
        { label: 'Photo', condition: 'Attach or provide a photo to the encoder, if available.' },
        { label: 'Suffix', choices: SUFFIX_OPTIONS },
        { label: 'Date of Birth', required: true, condition: 'YYYY-MM-DD' },
        { label: 'Sex', required: true, choices: ['Male', 'Female'] },
        { label: 'Birth Place' },
        { label: 'Civil Status', choices: CIVIL_STATUS_OPTIONS },
        { label: 'Educational Attainment', choices: EDUCATIONAL_ATTAINMENT_OPTIONS },
        { label: 'Employment Status', choices: EMPLOYMENT_STATUS_OPTIONS },
        { label: 'TIN No.' },
        { label: 'Religion', condition: 'Write the exact religion for selection in the web list.' },
        { label: 'Indigenous People?', required: true, choices: yesNo },
        { label: 'Indigenous (Ethnic Group)', condition: 'If Yes, write the ethnic group for selection in the web list.' },
        { label: 'Blood Type', choices: BLOOD_TYPE_OPTIONS },
        { label: "Mother's First Name" },
        { label: "Mother's Middle Name" },
        { label: "Mother's Last Name" },
        { label: "Mother's Date of Birth", condition: 'YYYY-MM-DD' },
    ],
    2: [
        { label: 'Country', fixed: 'Philippines' },
        { label: 'Region', fixed: 'Region VI' },
        { label: 'Province', fixed: 'Aklan' },
        { label: 'City/Municipality', condition: 'Residential address; optional.' },
        { label: 'Barangay', required: true, condition: 'Required if a municipality is selected.' },
        { label: 'Number/Street Name/Purok', wide: true, lines: 2 },
        { label: 'Zip Code' },
        { label: 'Email' },
        { label: 'Mobile' },
        { label: 'Landline' },
        { label: 'Parent / Guardian Name' },
        { label: 'Guardian Contact No.' },
        { label: 'DSWD 4Ps member', required: true, choices: yesNo },
        { label: '4Ps Household Number', condition: 'If Yes, if available.' },
        { label: 'Person With Disability?', required: true, choices: yesNo },
        { label: 'PWD TYPE', required: true, condition: 'Required if PWD is Yes.', choices: PWD_TYPE_OPTIONS },
        { label: 'PWD ID', condition: 'If available.' },
        { label: 'PSA NATIONAL ID #' },
        { label: 'Philhealth Member?', required: true, choices: yesNo },
        { label: 'Philhealth Number', required: true, condition: 'Required if membership is Yes.' },
        { label: 'Philhealth Status Type', required: true, condition: 'Required if membership is Yes.', choices: PHILHEALTH_STATUS_OPTIONS },
        { label: 'Philhealth Category', required: true, condition: 'Required if membership is Yes; write the exact category for selection in the web list.' },
    ],
    3: [
        { label: 'School', required: true, wide: true, lines: 2, condition: 'Encoder selects an eligible active school. Home address does not restrict this choice.' },
        { label: 'Grade Level', required: true, wide: true, choices: grades },
        { label: 'Section', wide: true, lines: 2 },
    ],
};

const sectionNames = { 1: 'Personal', 2: 'Contact', 3: 'Academic' };

const pageGroups: Record<1 | 2 | 3, PaperField[][]> = {
    1: [fields[1].slice(0, 12), fields[1].slice(12)],
    2: [fields[2].slice(0, 12), fields[2].slice(12)],
    3: [fields[3]],
};

function PaperFieldBlock({ field }: { field: PaperField }) {
    return (
        <div className={`paper-field${field.wide ? ' paper-field-wide' : ''}`}>
            <div className="paper-label">{field.label}{field.required && <span aria-label="required"> *</span>}</div>
            {field.condition && <div className="paper-note">{field.condition}</div>}
            {field.fixed && <div className="paper-fixed">{field.fixed}</div>}
            {field.choices && <div className="paper-choices">{field.choices.map(choice => <span key={choice}>□ {choice}</span>)}</div>}
            {Array.from({ length: field.lines ?? (field.choices || field.fixed ? 0 : 1) }, (_, index) => <div key={index} className="paper-writing-line" />)}
        </div>
    );
}

export default function RegistrationPaperPacket({ id, section }: { id: string; section: PaperSection }) {
    const sections: Array<1 | 2 | 3> = section === 'all' ? [1, 2, 3] : [section];
    const pages = sections.flatMap(currentSection => pageGroups[currentSection].map((pageFields, part) => ({ currentSection, pageFields, part })));
    return createPortal(
        <>
            <style media="print">{`
                @page { size: A4 portrait; margin: 10mm; }
                body { background: white !important; margin: 0 !important; }
                body > :not(.registration-paper):not(style) { display: none !important; }
                body * { visibility: hidden !important; }
                .registration-paper, .registration-paper * { visibility: visible !important; }
                .registration-paper { display: block !important; position: static; width: 100%; color: #0f172a; background: white; font-family: Arial, sans-serif; }
                .paper-page { box-sizing: border-box; display: flex; flex-direction: column; width: 100%; height: 277mm; break-after: page; page-break-after: always; overflow: hidden; }
                .paper-page:last-child { break-after: auto; page-break-after: auto; }
                .paper-header { border-bottom: 2px solid #047857; padding-bottom: 4mm; margin-bottom: 4mm; }
                .paper-heading { display: flex; justify-content: space-between; align-items: baseline; font-size: 16pt; font-weight: 700; }
                .paper-heading small { font-size: 9pt; font-weight: 600; }
                .paper-id { margin-top: 2mm; font-size: 10pt; font-weight: 700; }
                .paper-hint { margin-top: 1mm; font-size: 8pt; color: #475569; }
                .paper-identity { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-top: 4mm; }
                .paper-identity > div { font-size: 9pt; }
                .paper-identity span { display: block; border-bottom: 1px solid #334155; height: 10mm; }
                .paper-instruction { font-size: 8pt; margin-bottom: 4mm; }
                .paper-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; align-items: start; }
                .paper-field { break-inside: avoid; page-break-inside: avoid; min-height: 13mm; }
                .paper-field-wide { grid-column: 1 / -1; }
                .paper-label { font-size: 9pt; font-weight: 700; }
                .paper-label span { color: #b91c1c; }
                .paper-note { font-size: 7pt; color: #475569; margin-top: 1mm; }
                .paper-fixed { font-size: 9pt; margin-top: 2mm; }
                .paper-writing-line { border-bottom: 1px solid #64748b; height: 10mm; }
                .paper-choices { display: flex; flex-wrap: wrap; column-gap: 3mm; row-gap: 1mm; font-size: 7.5pt; margin-top: 2mm; line-height: 1.3; }
                .paper-choices span { white-space: nowrap; }
                .paper-footer { border-top: 1px solid #cbd5e1; margin-top: auto; padding-top: 2mm; font-size: 7pt; color: #475569; }
            `}</style>
            <div className="registration-paper hidden" aria-hidden="true">
                {pages.map(({ currentSection, pageFields, part }, index) => (
                    <section className="paper-page" key={`${currentSection}-${part}`}>
                        <header className="paper-header">
                            <div className="paper-heading">Student Registration — {sectionNames[currentSection]} <small>Page {index + 1} of {pages.length}</small></div>
                            <div className="paper-id">Paper Form ID: {id}</div>
                            <div className="paper-hint">Paper-tracking reference only. This is not a saved student ID; printing creates no student record.</div>
                            <div className="paper-identity">
                                <div>Student name <span /></div>
                                <div>LRN <span /></div>
                                <div>Assigned school (encoder) <span /></div>
                            </div>
                        </header>
                        <div className="paper-instruction">Write clearly. * Required in the web form when the stated condition applies. Leave optional answers blank if unknown.</div>
                        <div className="paper-grid">{pageFields.map(field => <PaperFieldBlock field={field} key={field.label} />)}</div>
                        <footer className="paper-footer">{sectionNames[currentSection]} section • Paper Form ID {id} • Give all pages with this ID to the encoder.</footer>
                    </section>
                ))}
            </div>
        </>,
        document.body,
    );
}
