// Residence changes must never change the independently selected school.
export function changeResidence<T extends { municipality: string; barangay: string; municipality_id?: number | null; barangay_id?: number | null }>(
    current: T, field: 'municipality' | 'barangay', value: string
): T {
    return field === 'municipality'
        ? { ...current, municipality: value, municipality_id: Number(value) || null, barangay: '', barangay_id: null }
        : { ...current, barangay: value, barangay_id: Number(value) || null };
}
