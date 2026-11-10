import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import pool from '../dist/database/db.js';
import { requireVerifiedTestDatabase } from '../dist/utils/verifyTestDatabase.js';

const stamp = randomUUID();
const adminEmail = `support-admin-${stamp}@example.test`;
const reportEmail = `support-report-${stamp}@example.test`;
const accountEmail = `support-account-${stamp}@example.test`;
const password = randomUUID();
const targetPassword = randomUUID();
const originalFetch = globalThis.fetch;
let listener;
let browser;
let verified = false;
try {
  await requireVerifiedTestDatabase(pool);
  verified = true;
  // Exercise missing configuration first, then capture the link without sending external mail.
  delete process.env.SUPPORT_EMAILJS_PRIVATE_KEY;
  const modulePath = process.env.PHO_QA_PLAYWRIGHT_MODULE;
  assert.ok(modulePath, 'Set PHO_QA_PLAYWRIGHT_MODULE to an installed Playwright entrypoint.');
  const { chromium } = await import(pathToFileURL(modulePath).href);
  const school = (await pool.query('SELECT id, name FROM SCHOOLS WHERE is_active ORDER BY name, id LIMIT 1')).rows[0];
  assert.ok(school);
  await pool.query(`INSERT INTO USERS (email, password_hash, role, portal_role, job_title, first_name, last_name, is_active)
    VALUES ($1, $2, 'admin', 'admin', 'QA', 'Support', 'Tester', TRUE)`, [adminEmail, await bcrypt.hash(password, 10)]);
  listener = createServer();
  listener.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject); });
  const origin = `http://127.0.0.1:${listener.address().port}`;
  process.env.APP_ORIGIN = origin;
  let setupLink;
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).origin === origin) return originalFetch(url, init);
    assert.equal(String(url), 'https://api.emailjs.com/api/v1.0/email/send');
    const message = JSON.parse(init.body);
    assert.equal(message.accessToken, 'qa-private');
    assert.equal(message.template_params.to_email, accountEmail);
    setupLink = message.template_params.setup_link;
    return new Response('OK');
  };
  const { app } = await import('../dist/index.js');
  listener.on('request', app);
  browser = await chromium.launch({ headless: true, executablePath: process.env.PHO_QA_BROWSER_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => console.error('Public page error:', error.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && /module|script|MIME/i.test(msg.text())) console.error(msg.text());
  });
  page.on('requestfailed', request => {
    if (request.resourceType() === 'script') console.error('Browser script request failed:', request.failure()?.errorText, new URL(request.url()).pathname);
  });
  const requests = [];
  page.on('request', req => {
    if (new URL(req.url()).pathname.startsWith('/api/')) requests.push(req);
  });
  const navigation = await page.goto(`${origin}/Login`);
  assert.equal(navigation?.status(), 200);
  await page.getByRole('heading', { name: 'Sign In to Portal' }).waitFor().catch(async error => {
    console.error('Login page did not render.', { title: await page.title(), url: page.url(),
      assetCount: await page.locator('script[src]').count(), rootChildren: await page.locator('#root > *').count() });
    throw error;
  });
  await page.getByRole('link', { name: 'Contact & Support' }).click();
  await page.getByRole('heading', { name: 'Contact & Support' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/contact');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile contact page must fit the viewport');
  await page.getByLabel('Problem category').selectOption('technical');
  await page.getByLabel('Full name').fill('Browser QA Reporter');
  await page.getByLabel('Reply email').fill(reportEmail);
  await page.getByLabel('Describe the problem').fill('Synthetic support problem from the mobile browser test.');
  await page.getByRole('button', { name: 'Submit problem report' }).click();
  await page.getByText(/^Reference:/).waitFor();

  const adminPage = await context.newPage();
  adminPage.setDefaultTimeout(12_000);
  adminPage.on('pageerror', error => console.error('Admin page error:', error.message));
  await adminPage.setViewportSize({ width: 1280, height: 800 });
  await adminPage.goto(`${origin}/Login`);
  await adminPage.locator('input[type=email]').fill(adminEmail);
  await adminPage.locator('input[type=password]').fill(password);
  await adminPage.getByRole('button', { name: 'Sign In to Account' }).click();
  await adminPage.waitForURL('**/admin/dashboard');
  await page.getByRole('button', { name: 'Request an account' }).click();
  await page.getByText(/does not create an account or grant access/).waitFor();
  await page.getByLabel('Full name').fill('Browser Applicant');
  await page.getByLabel('Work email').fill(accountEmail);
  await page.getByLabel('Contact number').fill('09171234567');
  await page.getByLabel('Job title').fill('Teacher');
  await page.getByLabel('School or office').fill('Informational browser QA school');
  await page.getByLabel('Reason for access').fill('Synthetic access request from the browser test.');
  await page.getByRole('button', { name: 'Submit account request' }).click();
  await page.getByText(/Your request was received/).waitFor();
  assert.equal(new URL(page.url()).pathname, '/contact');
  assert.equal(requests.length, 2);
  for (const req of requests) {
    assert.match(new URL(req.url()).pathname, /^\/api\/v1\/contact\/(?:reports|accounts)$/);
    assert.equal(await req.headerValue('authorization'), null);
  }
  await adminPage.goto(`${origin}/admin/support`);
  await adminPage.getByRole('button', { name: 'Problem reports' }).click();
  const report = adminPage.getByRole('article').filter({ hasText: reportEmail });
  await report.getByLabel('Status').selectOption('resolved');
  await report.getByLabel('Resolution notes').fill('Verified in browser QA.');
  await report.getByRole('button', { name: 'Save report' }).click();
  await report.getByRole('heading', { name: /Resolved/ }).waitFor();
  await adminPage.getByRole('button', { name: 'Account requests' }).click();
  const request = adminPage.getByRole('article').filter({ hasText: accountEmail });
  await request.getByRole('link', { name: 'Approve & prepare account' }).click();
  const dialog = adminPage.getByRole('dialog', { name: 'Create New User Account' });
  await dialog.waitFor();
  assert.equal(await dialog.getByLabel('Email Address').inputValue(), accountEmail);
  assert.equal(await dialog.getByRole('button', { name: 'Confirm and create account' }).isDisabled(), true);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await request.getByRole('link', { name: 'Approve & prepare account' }).click();
  assert.equal(await dialog.getByLabel('Account Password').count(), 0);
  await dialog.getByLabel('Job Title', { exact: true }).fill('School Nurse');
  await dialog.getByLabel('System Role', { exact: true }).selectOption('school_staff');
  await dialog.getByLabel('Find a school').fill(school.name);
  await dialog.getByRole('checkbox', { name: school.name, exact: false }).first().check();
  await dialog.getByText(/Patient Information.*selected/).click();
  await dialog.getByRole('checkbox', { name: 'View', exact: true }).check();
  await dialog.getByRole('checkbox', { name: /I verified the requester/ }).check();
  await dialog.getByRole('button', { name: 'Confirm and create account' }).click();
  await request.getByRole('heading', { name: /Approved/ }).waitFor();
  await request.getByText('EmailJS or the PHO setup page address is not configured.').waitFor();
  await request.getByText('Pending password setup').waitFor();
  process.env.SUPPORT_EMAILJS_SERVICE_ID = 'qa-service';
  process.env.SUPPORT_EMAILJS_TEMPLATE_ID = 'qa-template';
  process.env.SUPPORT_EMAILJS_PUBLIC_KEY = 'qa-public';
  process.env.SUPPORT_EMAILJS_PRIVATE_KEY = 'qa-private';
  process.env.SUPPORT_SETUP_ORIGIN = origin;
  await request.getByRole('button', { name: 'Send a new setup link' }).click();
  await request.getByText('Send attempts: 2').waitFor();
  await request.getByText(/Accepted by email provider/).waitFor();
  assert.ok(setupLink);
  await page.goto(setupLink);
  await page.getByRole('heading', { name: 'Set up your PHO account' }).waitFor();
  assert.equal(new URL(page.url()).hash, '');
  await page.getByLabel('New password', { exact: true }).fill(targetPassword);
  await page.getByLabel('Confirm password', { exact: true }).fill(randomUUID());
  await page.getByRole('button', { name: 'Set password' }).click();
  await page.getByText('The passwords must match.').waitFor();
  await page.getByLabel('Confirm password', { exact: true }).fill(targetPassword);
  await page.getByRole('button', { name: 'Set password' }).click();
  await page.getByText(/Your password is saved/).waitFor();
  assert.equal(await requests.at(-1).headerValue('authorization'), null);
  const saved = await pool.query(`SELECT job_title, portal_role, is_active FROM USERS WHERE email = $1`, [accountEmail]);
  assert.deepEqual(saved.rows, [{ job_title: 'School Nurse', portal_role: 'school_staff', is_active: true }]);
  console.log('PASS: Edge public intake, admin approval without a password, EmailJS retry, and mobile password setup.');
} finally {
  globalThis.fetch = originalFetch;
  await browser?.close();
  if (listener) await new Promise(resolve => listener.close(() => resolve()));
  try {
    if (verified) {
      await pool.query('DELETE FROM SUPPORT_ACCOUNT_NOTIFICATIONS WHERE request_id IN (SELECT id FROM SUPPORT_ACCOUNT_REQUESTS WHERE work_email = $1)', [accountEmail]);
      await pool.query('DELETE FROM SUPPORT_ACCOUNT_REQUESTS WHERE work_email = $1', [accountEmail]);
      await pool.query('DELETE FROM SUPPORT_REPORTS WHERE reply_email = $1', [reportEmail]);
      for (const [table, column] of [['AUDIT_EVENTS', 'actor_id'], ['USER_SCHOOL_ASSIGNMENTS', 'user_id'],
        ['USER_MODULE_PERMISSIONS', 'user_id'], ['PORTAL_SESSIONS', 'user_id']]) {
        await pool.query(`DELETE FROM ${table} WHERE ${column} IN (SELECT id FROM USERS WHERE email = ANY($1))`, [[adminEmail, accountEmail]]);
      }
      await pool.query('DELETE FROM USERS WHERE email = ANY($1)', [[adminEmail, accountEmail]]);
    }
  } finally { await pool.end(); }
}
