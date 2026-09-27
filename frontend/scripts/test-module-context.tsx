import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StudentContextPanel from '../src/components/common/StudentContextPanel';
import type { StudentModuleContext } from '../src/types/moduleContext';

const context: StudentModuleContext = {
    id: 1, first_name: 'Canonical', middle_name: 'M', last_name: 'Student',
    suffix: 'NOT APPLICABLE', student_lrn: '123456789012', date_of_birth: '2014-09-27',
    age: 12, sex: 'Female', school_id: 1, school_name: 'Assigned School',
    grade_level: 'Grade 7', section: 'A',
};
const render = (student: StudentModuleContext) => renderToStaticMarkup(React.createElement(StudentContextPanel, { student }));
const html = render(context);
assert.equal((html.match(/<input /g) ?? []).length, 8);
assert.equal((html.match(/readOnly=""/g) ?? []).length, 8, 'Every shared value must be read-only');
for (const value of ['Canonical M Student', '123456789012', '2014-09-27', '12', 'Female', 'Assigned School', 'Grade 7', 'A']) {
    assert.ok(html.includes(`value="${value}"`), value);
}
assert.ok(!html.includes('NOT APPLICABLE'));
const updated = render({ ...context, section: 'Corrected', age: 0, middle_name: null });
assert.ok(updated.includes('value="Corrected"'));
assert.ok(updated.includes('value="0"'), 'Age zero must not be treated as missing');
assert.ok(render({ ...context, school_name: null }).includes('value="Not provided"'));
console.log('Canonical context read-only rendering checks passed.');
