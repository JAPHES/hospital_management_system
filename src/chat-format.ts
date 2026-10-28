type JsonRecord = Record<string, unknown>;

const CANNED_PREFIX = 'I called the tool. Output:';
const CANNED_SUFFIX = '[canned tool response]';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

function sentenceCase(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : value;
}

function cleanExcerpt(value: string, maxLength = 500): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trimEnd()}…` : cleaned;
}

function formatDoctors(records: JsonRecord[]): string {
  const list = records.map((doctor, index) => {
    const id = stringField(doctor, 'id');
    const idLabel = id ? ` (ID: ${id})` : '';
    return `${index + 1}. ${stringField(doctor, 'name')} — ${stringField(doctor, 'specialty')}${idLabel}`;
  });

  return [
    'Here are the doctors currently available:',
    '',
    ...list,
    '',
    'Tell me the doctor’s name or ID if you would like help booking an appointment.',
  ].join('\n');
}

function formatAppointments(records: JsonRecord[]): string {
  const list = records.map((appointment, index) => {
    const doctor = stringField(appointment, 'doctorName') ?? 'Doctor not specified';
    const date = stringField(appointment, 'date') ?? 'date not specified';
    const time = stringField(appointment, 'timeSlot') ?? 'time not specified';
    const status = sentenceCase(stringField(appointment, 'status') ?? 'unknown');
    return `${index + 1}. ${doctor} — ${date} at ${time} (${status})`;
  });

  return [`You have ${records.length} appointment${records.length === 1 ? '' : 's'}:`, '', ...list].join('\n');
}

function formatKnowledgeResults(records: JsonRecord[]): string {
  const list = records.map((result, index) => {
    const text = cleanExcerpt(stringField(result, 'text') ?? 'No excerpt available.');
    const source = stringField(result, 'source');
    const sourceName = source?.split(/[\\/]/).pop();
    return `${index + 1}. ${text}${sourceName ? `\nSource: ${sourceName}` : ''}`;
  });

  return ['I found the following relevant information:', '', ...list].join('\n\n');
}

function formatSettings(record: JsonRecord): string {
  const lines = [
    stringField(record, 'visitingHours') && `• Visiting hours: ${stringField(record, 'visitingHours')}`,
    stringField(record, 'erWaitTime') && `• Estimated ER wait time: ${stringField(record, 'erWaitTime')}`,
    stringField(record, 'bedCapacity') && `• Bed capacity: ${stringField(record, 'bedCapacity')}`,
    stringField(record, 'announcement') && `• Announcement: ${stringField(record, 'announcement')}`,
  ].filter((line): line is string => Boolean(line));

  return ['Here is the current health unit information:', '', ...lines].join('\n');
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return 'Not available';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, entry]) => !isRecord(entry))
      .map(([key, entry]) => `${humanizeKey(key)}: ${displayValue(entry)}`)
      .join(', ');
  }
  return String(value);
}

function formatToolValue(value: unknown): string {
  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    if (value.length === 0) return 'I could not find any records for that request.';

    const records = value.filter(isRecord);
    if (records.length === value.length) {
      if (records.every(record => stringField(record, 'name') && stringField(record, 'specialty'))) {
        return formatDoctors(records);
      }
      if (records.every(record => stringField(record, 'doctorName') && stringField(record, 'date'))) {
        return formatAppointments(records);
      }
      if (records.every(record => stringField(record, 'text'))) {
        return formatKnowledgeResults(records);
      }
    }

    return ['Here is what I found:', '', ...value.map((item, index) => `${index + 1}. ${displayValue(item)}`)].join('\n');
  }

  if (isRecord(value)) {
    const error = stringField(value, 'error');
    if (error) return `I could not complete that request: ${error}`;

    const message = stringField(value, 'message');
    if (message) return message;

    if ('visitingHours' in value || 'erWaitTime' in value || 'bedCapacity' in value) {
      return formatSettings(value);
    }

    const details = Object.entries(value)
      .filter(([key]) => !['success', 'version', 'createdAt'].includes(key))
      .map(([key, entry]) => `• ${humanizeKey(key)}: ${displayValue(entry)}`);
    if (details.length) return ['Here is what I found:', '', ...details].join('\n');
  }

  return 'I completed the request, but there was no additional information to display.';
}

function extractCannedValue(content: string): { matched: boolean; value?: unknown } {
  const trimmed = content.trim();
  if (!trimmed.startsWith(CANNED_PREFIX) || !trimmed.endsWith(CANNED_SUFFIX)) {
    return { matched: false };
  }

  const serialized = trimmed.slice(CANNED_PREFIX.length, -CANNED_SUFFIX.length).trim();
  try {
    const payload: unknown = JSON.parse(serialized);
    if (isRecord(payload) && isRecord(payload.json) && '$value' in payload.json) {
      return { matched: true, value: payload.json.$value };
    }
    return { matched: true, value: payload };
  } catch {
    return { matched: true };
  }
}

/**
 * Converts the local Agent canned provider's serialized tool output into
 * user-friendly text. Real model responses pass through unchanged.
 */
export function formatAssistantMessage(content: string): string {
  const canned = extractCannedValue(content);
  if (!canned.matched) {
    const trimmed = content.trim();
    if (trimmed.endsWith('[canned]') || trimmed.endsWith('[canned response]')) {
      return [
        'I’m ready to help with Taita Taveta University Health Unit services.',
        '',
        'You can ask me to:',
        '• List available doctors and their specialties',
        '• Show health unit hours and current information',
        '• View, book, or cancel an appointment',
        '• Explain health unit policies and patient guidance',
      ].join('\n');
    }
    return content;
  }
  if (canned.value === undefined) {
    return 'I found the information, but I could not format the local development response. Please try again.';
  }
  return formatToolValue(canned.value);
}
