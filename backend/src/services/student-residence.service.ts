import { z } from 'zod';

type LocationInput = string | number | null;
interface ResidenceInput {
    municipality_id?: LocationInput | undefined;
    municipality?: LocationInput | undefined;
    barangay_id?: LocationInput | undefined;
    barangay?: LocationInput | undefined;
}
export interface StudentResidence {
    municipality_id: number | null;
    barangay_id: number | null;
}
interface ResidenceExecutor {
    query: (sql: string, params: unknown[]) => Promise<{ rows: Array<{ id: number }> }>;
}

function invalid(field: string, message: string): never {
    throw new z.ZodError([{ code: 'custom', path: [field], message }]);
}

function locationId(value: LocationInput, field: string): number | null {
    if (value === null || value === '') return null;
    if (typeof value === 'string' && !/^[1-9]\d*$/.test(value)) {
        return invalid(field, 'Select a valid location from the list.');
    }
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
        return invalid(field, 'Select a valid location from the list.');
    }
    return id;
}

function resolveId(canonical: LocationInput | undefined, alias: LocationInput | undefined,
    previous: number | null, field: string): number | null {
    if (canonical !== undefined) {
        const id = locationId(canonical, field);
        // Read responses also contain display names. Only numeric/empty aliases
        // represent a second selection that can contradict the canonical ID.
        if (alias !== undefined && (typeof alias !== 'string' || alias === '' || /^\d+$/.test(alias))) {
            if (locationId(alias, field) !== id) {
                invalid(field, 'The location selections disagree. Reload the student and select the location again.');
            }
        }
        return id;
    }
    return alias === undefined ? previous : locationId(alias, field);
}

export function resolveStudentResidence(input: ResidenceInput,
    previous: StudentResidence = { municipality_id: null, barangay_id: null }): StudentResidence {
    const municipality_id = resolveId(input.municipality_id, input.municipality,
        previous.municipality_id, 'municipality_id');
    const barangayWasSelected = input.barangay_id !== undefined || input.barangay !== undefined;
    const barangay_id = !barangayWasSelected && municipality_id !== previous.municipality_id
        ? null : resolveId(input.barangay_id, input.barangay, previous.barangay_id, 'barangay_id');
    if (barangay_id !== null && municipality_id === null) {
        invalid('municipality_id', 'Select a municipality before selecting a barangay.');
    }
    return { municipality_id, barangay_id };
}

// Called inside the student write transaction. Locks keep a directory edit from
// changing the validated hierarchy before the student update commits.
export async function validateStudentResidence(executor: ResidenceExecutor, residence: StudentResidence): Promise<void> {
    if (residence.municipality_id === null) return;
    const municipality = await executor.query('SELECT id FROM MUNICIPALITIES WHERE id = $1 FOR SHARE',
        [residence.municipality_id]);
    if (municipality.rows.length === 0) invalid('municipality_id', 'The selected municipality does not exist.');
    if (residence.barangay_id === null) return;
    const barangay = await executor.query('SELECT id FROM BARANGAYS WHERE id = $1 AND municipality_id = $2 FOR SHARE',
        [residence.barangay_id, residence.municipality_id]);
    if (barangay.rows.length === 0) {
        invalid('barangay_id', 'The selected barangay does not belong to the selected municipality.');
    }
}
