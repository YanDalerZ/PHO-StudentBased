import type { Student } from '../types/index.ts';

export interface StudentAddressFields {
  municipality: string;
  municipality_id?: number | null;
  barangay: string;
  barangay_id?: number | null;
  address: string;
  street_address?: string;
}

function selectedId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeStudentAddress(data: Partial<Student>): StudentAddressFields {
  return {
    municipality: data.municipality_id ? String(data.municipality_id) : String(data.municipality ?? ''),
    municipality_id: data.municipality_id,
    barangay: data.barangay_id ? String(data.barangay_id) : String(data.barangay ?? ''),
    barangay_id: data.barangay_id,
    address: data.address ?? data.street_address ?? '',
    street_address: data.street_address ?? data.address ?? '',
  };
}

export function changeStudentAddress<T extends StudentAddressFields>(
  current: T,
  field: 'municipality' | 'barangay' | 'address',
  value: string,
): T {
  if (field === 'municipality') {
    return { ...current, municipality: value, municipality_id: selectedId(value), barangay: '', barangay_id: null };
  }
  if (field === 'barangay') {
    return { ...current, barangay: value, barangay_id: selectedId(value) };
  }
  return { ...current, address: value, street_address: value };
}

export function studentAddressPayload(form: StudentAddressFields) {
  // The visible selections own the payload; stale aliases must never undo an edit.
  return {
    municipality: form.municipality,
    municipality_id: selectedId(form.municipality),
    barangay: form.barangay,
    barangay_id: selectedId(form.barangay),
    address: form.address,
    street_address: form.address,
  };
}
