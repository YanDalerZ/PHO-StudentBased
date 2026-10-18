import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [app, sidebar, reportPage, api, styles] = await Promise.all([
  readSource('src/App.tsx'),
  readSource('src/components/common/Sidebar.tsx'),
  readSource('src/pages/reports/ConsolidatedReportPage.tsx'),
  readSource('src/services/api.ts'),
  readSource('src/index.css'),
]);

assert.match(app, /path="reports\/:moduleSlug"/,
  'Teacher and superuser layouts must expose the module report route.');
assert.match(app, /canReport \? 'can_report' : 'can_export'/,
  'The shared report route must admit report users and export-only masterlist users.');
assert.match(sidebar, /hasModulePermission\(effectiveAccess, module, 'can_report'\) \|\| hasModulePermission\(effectiveAccess, module, 'can_export'\)/,
  'Report navigation must be derived from report or export access.');
assert.match(reportPage, /hasModulePermission\(effectiveAccess, moduleSlug, 'can_export'\)/,
  'Export controls must be derived from the separate can_export grant.');
assert.match(reportPage, /canReport \? 'municipality' : 'masterlist'/,
  'Export-only users must default to the masterlist view.');
assert.match(reportPage, /await recordReportPrint[\s\S]*window\.print\(\)/,
  'Printing must be audited successfully before opening the print dialog.');
assert.match(reportPage, /await downloadReportExport\(moduleSlug, format, appliedFilters, document\.view\)/,
  'The UI must download the generated export directly from the canonical endpoint.');
assert.doesNotMatch(reportPage, /getReportExport|setTimeout|job\.status/,
  'The UI must not poll an asynchronous export job.');
assert.match(api, /`\/reports\/\$\{moduleSlug\}\$\{view === 'masterlist' \? '\/masterlist' : ''\}`/,
  'The UI must call the canonical municipality or masterlist preview endpoint.');
assert.match(api, /`\/reports\/\$\{moduleSlug\}\/exports`/,
  'The UI must call the canonical report export endpoint.');
assert.match(styles, /@media print/,
  'The consolidated report must include print-specific styles.');
assert.match(styles, /\.report-controls[\s\S]*display:\s*none/,
  'Interactive report controls must be hidden when printing.');

console.log('Phase 3 reporting UI contract checks passed.');
