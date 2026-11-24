import assert from 'node:assert/strict';
import { changeStudentAddress, normalizeStudentAddress, studentAddressPayload } from '../src/lib/studentAddress.ts';

const existing = {
  id: 501,
  municipality_id: 1,
  municipality: 'Original municipality',
  barangay_id: 10,
  barangay: 'Original barangay',
  address: 'Original street',
  street_address: 'Original street',
  school_id: 123,
};
const loaded = { ...existing, ...normalizeStudentAddress(existing) };
assert.equal(loaded.municipality, '1');
assert.equal(loaded.barangay, '10');

const changedMunicipality = changeStudentAddress(loaded, 'municipality', '2');
assert.equal(changedMunicipality.municipality_id, 2);
assert.equal(changedMunicipality.barangay, '');
assert.equal(changedMunicipality.barangay_id, null, 'Changing municipality must clear the former barangay ID.');
assert.equal(changedMunicipality.school_id, existing.school_id, 'Residence edits must preserve school assignment.');

const changed = changeStudentAddress(
  changeStudentAddress(changedMunicipality, 'barangay', '20'), 'address', 'Updated street',
);
const submitted = { ...changed, ...studentAddressPayload(changed) };
assert.equal(submitted.municipality_id, 2, 'The API prioritizes this canonical field over municipality.');
assert.equal(submitted.barangay_id, 20, 'The API prioritizes this canonical field over barangay.');
assert.equal(submitted.street_address, 'Updated street', 'The API prioritizes street_address over address.');
assert.equal(submitted.id, existing.id);
assert.equal(submitted.school_id, existing.school_id);

// Reopen from the canonical fields returned by a successful update/read.
const reopened = normalizeStudentAddress({
  ...submitted, municipality: 'New municipality', barangay: 'New barangay', address: submitted.street_address,
});
assert.equal(reopened.municipality, '2');
assert.equal(reopened.barangay, '20');
assert.equal(reopened.address, 'Updated street');
assert.deepEqual(studentAddressPayload(reopened), {
  municipality: '2', municipality_id: 2, barangay: '20', barangay_id: 20,
  address: 'Updated street', street_address: 'Updated street',
});

const changedBarangay = changeStudentAddress(loaded, 'barangay', '11');
assert.equal(studentAddressPayload(changedBarangay).municipality_id, 1);
assert.equal(studentAddressPayload(changedBarangay).barangay_id, 11);

// Serialization also prevents stale aliases from overriding current visible values.
assert.deepEqual(studentAddressPayload({
  municipality: '3', municipality_id: 1, barangay: '30', barangay_id: 10,
  address: 'Visible street', street_address: 'Old street',
}), {
  municipality: '3', municipality_id: 3, barangay: '30', barangay_id: 30,
  address: 'Visible street', street_address: 'Visible street',
});

const cleared = changeStudentAddress(changeStudentAddress(loaded, 'municipality', ''), 'address', '');
assert.deepEqual(studentAddressPayload(cleared), {
  municipality: '', municipality_id: null, barangay: '', barangay_id: null, address: '', street_address: '',
});
const legacy = normalizeStudentAddress({ municipality: 4, barangay: 40, street_address: 'Legacy street' });
assert.equal(studentAddressPayload(legacy).municipality_id, 4);
assert.equal(studentAddressPayload(legacy).barangay_id, 40);
assert.equal(studentAddressPayload(legacy).street_address, 'Legacy street');
assert.equal(studentAddressPayload(normalizeStudentAddress({ municipality_id: null, barangay_id: null })).municipality_id, null);

console.log('Student address edit, payload, and reopen regression checks passed.');
