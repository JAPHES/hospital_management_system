import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAssistantMessage } from '../src/chat-format';

test('formats a canned doctor result as a readable list', () => {
  const raw = 'I called the tool. Output: {"json":{"$value":[{"id":"doc-1","name":"Dr. Sarah Connor","specialty":"General Medicine"},{"id":"doc-2","name":"Dr. Gregory House","specialty":"Diagnostic Medicine"}]}} [canned tool response]';
  const formatted = formatAssistantMessage(raw);

  assert.match(formatted, /Here are the doctors currently available/);
  assert.match(formatted, /1\. Dr\. Sarah Connor — General Medicine \(ID: doc-1\)/);
  assert.match(formatted, /2\. Dr\. Gregory House — Diagnostic Medicine \(ID: doc-2\)/);
  assert.doesNotMatch(formatted, /canned|\$value|json/i);
});

test('formats current health unit settings', () => {
  const raw = 'I called the tool. Output: {"json":{"$value":{"visitingHours":"24 Hours, 7 Days a Week","erWaitTime":"15 minutes","bedCapacity":"95% available","announcement":"Welcome."}}} [canned tool response]';
  const formatted = formatAssistantMessage(raw);

  assert.match(formatted, /current health unit information/i);
  assert.match(formatted, /Visiting hours: 24 Hours, 7 Days a Week/);
  assert.match(formatted, /Estimated ER wait time: 15 minutes/);
});

test('uses a tool success message without exposing its payload', () => {
  const raw = 'I called the tool. Output: {"json":{"$value":{"success":true,"message":"Appointment cancelled successfully."}}} [canned tool response]';
  assert.equal(formatAssistantMessage(raw), 'Appointment cancelled successfully.');
});

test('leaves real model responses unchanged', () => {
  const response = 'The health unit is open 24 hours a day, seven days a week.';
  assert.equal(formatAssistantMessage(response), response);
});

test('replaces a generic local canned response with useful guidance', () => {
  const formatted = formatAssistantMessage('This is a canned mock response. No real model was called. [canned]');

  assert.match(formatted, /ready to help with Taita Taveta University Health Unit services/i);
  assert.match(formatted, /List available doctors/);
  assert.doesNotMatch(formatted, /canned|mock|model/i);
});

test('replaces malformed canned payloads with a helpful fallback', () => {
  const raw = 'I called the tool. Output: not-json [canned tool response]';
  const formatted = formatAssistantMessage(raw);

  assert.match(formatted, /could not format/i);
  assert.doesNotMatch(formatted, /not-json|canned/i);
});
