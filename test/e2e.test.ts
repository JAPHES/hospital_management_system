/**
 * End-to-end tests — tests the API via direct imports (same typed client the frontend uses).
 *
 * Run:  npm run test:e2e
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { installCookieJar, isServerRunning } from '@aws-blocks/blocks/utils';
import type { api as ApiType, authApi as AuthApiType } from 'aws-blocks';
import fs from 'fs';
import path from 'path';

// Install cookie jar before importing the API client — Node's fetch doesn't
// persist cookies between requests, which breaks authenticated API calls.
installCookieJar();

let server: ChildProcess | null = null;
let api: typeof ApiType;
let authApi: typeof AuthApiType;

// Dynamic, unique username to avoid state collision in mock DB across test runs
const testUsername = `patient-${Date.now()}@example.com`;

// ─── Setup (don't touch) ─────────────────────────────────────────────────────

test.before(async () => {
  // Use existing dev server if running, otherwise start one
  if (!await isServerRunning()) {
    server = spawn('npm', ['run', 'dev:server'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: { ...process.env, NODE_OPTIONS: '' },
    });
    server.unref();
    await setTimeout(3000);
  }

  const mod = await import('aws-blocks');
  api = mod.api;
  authApi = mod.authApi;

  // Wait for server readiness
  for (let i = 0; i < 30; i++) {
    try {
      await authApi.getAuthState();
      return;
    } catch {
      await setTimeout(1000);
    }
  }
  throw new Error('Dev server did not become ready within 30s');
});

test.after(() => {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  }
});

// Helper to get confirmation code in Cognito mock
function getConfirmationCode() {
  const codePath = path.join(process.cwd(), '.bb-data', 'hosp-auth', 'last-code.json');
  const data = JSON.parse(fs.readFileSync(codePath, 'utf8'));
  return data.code;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

test('auth: starts signed out', async () => {
  const state = await authApi.getAuthState();
  assert.strictEqual(state.state, 'signedOut');
});

test('auth: sign up and confirm signs in user', async () => {
  let state = await authApi.setAuthState({
    action: 'signUp',
    username: testUsername,
    password: 'TestPass123!',
  });
  assert.strictEqual(state.state, 'confirmingSignUp');

  const code = getConfirmationCode();
  state = await authApi.setAuthState({
    action: 'confirmSignUp',
    username: testUsername,
    code,
  });

  assert.strictEqual(state.state, 'confirmingSignUp');
  assert.strictEqual(state.actions[0].name, 'autoSignIn');

  state = await authApi.setAuthState({
    action: 'autoSignIn',
    username: testUsername,
  });

  assert.strictEqual(state.state, 'signedIn');
  assert.strictEqual(state.user?.username, testUsername);
});

// ─── Hospital Portal Business Logic Tests ────────────────────────────────────

test('portal: default profile has patient role', async () => {
  const profile = await api.getUserProfile();
  assert.strictEqual(profile.role, 'patient');
  assert.strictEqual(profile.username, testUsername);
});

test('portal: list doctors', async () => {
  const doctors = await api.listDoctors();
  assert.strictEqual(doctors.length, 4);
  assert.strictEqual(doctors[0].name, 'Dr. Sarah Connor');
});

test('portal: default settings', async () => {
  const settings = await api.getHospitalSettings();
  assert.ok(settings.visitingHours);
  assert.ok(settings.erWaitTime);
});

test('portal: switch role to admin and update settings', async () => {
  // Update role to admin
  const roleResult = await api.setUserRole('admin');
  assert.strictEqual(roleResult.role, 'admin');

  // Verify updated profile role
  const profile = await api.getUserProfile();
  assert.strictEqual(profile.role, 'admin');

  // Update hospital settings
  const updateRes = await api.updateHospitalSettings({
    visitingHours: '10 AM - 5 PM',
    erWaitTime: '5 minutes',
    bedCapacity: '80% available',
    announcement: 'Sandbox admin update.',
  });
  assert.strictEqual(updateRes.success, true);

  // Check update took place
  const settings = await api.getHospitalSettings();
  assert.strictEqual(settings.visitingHours, '10 AM - 5 PM');
  assert.strictEqual(settings.erWaitTime, '5 minutes');
});

test('portal: switch role to doctor and add medical record', async () => {
  // Update role to doctor
  await api.setUserRole('doctor');
  const profile = await api.getUserProfile();
  assert.strictEqual(profile.role, 'doctor');

  // Try adding a record for the patient
  const record = await api.addMedicalRecord(
    testUsername,
    'Common Cold',
    'Rest and stay hydrated',
    'Ibuprofen 200mg as needed'
  );
  assert.strictEqual(record.patientId, testUsername);
  assert.strictEqual(record.diagnosis, 'Common Cold');
  assert.ok(record.recordId);
});

test('portal: switch role to patient, book appt, view records', async () => {
  // Update role to patient
  await api.setUserRole('patient');
  const profile = await api.getUserProfile();
  assert.strictEqual(profile.role, 'patient');

  // Patient views their medical records (added by doctor)
  const records = await api.listMedicalRecords();
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].diagnosis, 'Common Cold');

  // Patient books an appointment
  const appt = await api.bookAppointment('doc-4', '2026-08-10', '10:30 AM', 'Heart checkup');
  assert.strictEqual(appt.status, 'scheduled');

  // Switch to doctor to accept appointment
  await api.setUserRole('doctor');
  const acceptRes = await api.acceptAppointment(testUsername, appt.appointmentId);
  assert.strictEqual(acceptRes.success, true);

  // Switch to patient to verify accepted status
  await api.setUserRole('patient');
  let appts = await api.listMyAppointments();
  let checkedAppt = appts.find(a => a.appointmentId === appt.appointmentId);
  assert.strictEqual(checkedAppt?.status, 'accepted');

  // Switch back to doctor to complete appointment
  await api.setUserRole('doctor');
  const completeRes = await api.completeAppointment(testUsername, appt.appointmentId);
  assert.strictEqual(completeRes.success, true);

  // Switch to patient to verify completed status
  await api.setUserRole('patient');
  appts = await api.listMyAppointments();
  checkedAppt = appts.find(a => a.appointmentId === appt.appointmentId);
  assert.strictEqual(checkedAppt?.status, 'completed');

  // Patient books a second appointment to test cancellation
  const appt2 = await api.bookAppointment('doc-4', '2026-08-11', '11:00 AM', 'Follow-up');
  assert.strictEqual(appt2.status, 'scheduled');

  // Patient cancels the second appointment
  const cancelRes = await api.cancelAppointment(testUsername, appt2.appointmentId);
  assert.strictEqual(cancelRes.success, true);

  appts = await api.listMyAppointments();
  const cancelledAppt = appts.find(a => a.appointmentId === appt2.appointmentId);
  assert.strictEqual(cancelledAppt?.status, 'cancelled');
});
