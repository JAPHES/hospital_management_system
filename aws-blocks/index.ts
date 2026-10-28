/**
 * Backend — aws-blocks/index.ts
 *
 * Hospital Management System.
 * Uses AWS Blocks for Cognito Auth, DynamoDB Tables, KV Store, Bedrock Knowledge Base, and AI Agent.
 */
import {
  ApiNamespace,
  Scope,
  AuthCognito,
  DistributedTable,
  KVStore,
  KnowledgeBase,
  Agent,
  Realtime,
  BedrockModels
} from '@aws-blocks/blocks';
import { z } from 'zod';

const scope = new Scope('hosp');

// ─── Auth (Cognito) ──────────────────────────────────────────────────────────
const auth = new AuthCognito(scope, 'auth', {
  passwordPolicy: { minLength: 8 },
  userAttributes: [{ name: 'role', type: 'String' }] as const,
  crossDomain: process.env.BLOCKS_SANDBOX === 'true',
  // The local Cognito mock cannot send email. Surface its verification codes
  // in the dev-server terminal; deployed AWS environments use Cognito email.
  codeDelivery: async (username, code, purpose) => {
    console.log(`\n[AUTH] ${purpose} code for ${username}: ${code}\n`);
  },
});
export const authApi = auth.createApi(); //signup,signin,confirmSignUp,confirmSignIn,getAuthState,currentUser

// ─── KV Store (Hospital Settings) ────────────────────────────────────────────
const hospitalSettingsSchema = z.object({
  visitingHours: z.string(),
  erWaitTime: z.string(),
  bedCapacity: z.string(),
  announcement: z.string(),
});

const settings = new KVStore(scope, 'settings', {
  schema: hospitalSettingsSchema,
});

async function getSettingsOrDefault() {
  const data = await settings.get('hospital_config');
  if (data) return data;
  const defaults = {
    visitingHours: '24 Hours, 7 Days a Week',
    erWaitTime: '15 minutes',
    bedCapacity: '95% available',
    announcement: 'Welcome to Taita Taveta University Health Unit. All visitor check-ins must be completed at the main reception desk.',
  };
  await settings.put('hospital_config', defaults);
  return defaults;
}

// ─── Data Tables ─────────────────────────────────────────────────────────────
const appointmentSchema = z.object({
  patientId: z.string(),
  appointmentId: z.string(),
  patientName: z.string(),
  doctorId: z.string(),
  doctorName: z.string(),
  date: z.string(),
  timeSlot: z.string(),
  status: z.enum(['scheduled', 'accepted', 'completed', 'cancelled']),
  notes: z.string(),
  version: z.number(),
  createdAt: z.number(),
});

const appointments = new DistributedTable(scope, 'appointments', {
  schema: appointmentSchema,
  key: { partitionKey: 'patientId', sortKey: 'appointmentId' },
  indexes: {
    byDoctor: { partitionKey: 'doctorId', sortKey: 'date' },
  },
});

const medicalRecordSchema = z.object({
  patientId: z.string(),
  recordId: z.string(),
  date: z.string(),
  diagnosis: z.string(),
  treatment: z.string(),
  prescription: z.string(),
  doctorName: z.string(),
  createdAt: z.number(),
});

const medicalRecords = new DistributedTable(scope, 'medicalRecords', {
  schema: medicalRecordSchema,
  key: { partitionKey: 'patientId', sortKey: 'recordId' },
});

// ─── Knowledge Base ──────────────────────────────────────────────────────────
const kb = new KnowledgeBase(scope, 'docs', {
  source: './knowledge',
  description: 'Hospital policies, clinical guidelines, pediatric wellness advice, and diabetes support.',
});

// ─── AI Chat Agent ───────────────────────────────────────────────────────────
const agent = new Agent(scope, 'hospital-bot', {
  model: { deployed: BedrockModels.BALANCED },
  systemPrompt: 'You are the reception desk chatbot for Taita Taveta University Health Unit. You can help patients get information about health unit hours, check ER wait times, look up their appointments, list available doctors, or book appointments. Always be polite, empathetic, and professional. Present tool results as clear, natural-language answers with short lists where helpful. Never expose raw JSON, internal tool names, or implementation details to the user. Always use the searchKnowledgeBase tool to retrieve medical policies, pediatric guidelines, cardiology information, or diabetes questions before answering.',
  toolContextSchema: z.object({
    username: z.string(),
    name: z.string().optional(),
  }),
  tools: (tool) => ({
    searchKnowledgeBase: tool({
      description: 'Search the hospital knowledge base for medical information, patient guides, pediatric care, diabetes management, or hospital policies.',
      parameters: z.object({ query: z.string().describe('The search query for the documents') }),
      handler: async ({ input }) => {
        return await kb.retrieve(input.query, { maxResults: 3 }) as any;
      }
    }),
    getHospitalInfo: tool({
      description: 'Get information about hospital visiting hours, ER wait times, and current announcements.',
      parameters: z.object({}),
      handler: async () => {
        return await getSettingsOrDefault();
      }
    }),
    listDoctors: tool({
      description: 'List the names and specialties of all doctors working at the hospital.',
      parameters: z.object({}),
      handler: async () => DOCTORS
    }),
    listMyAppointments: tool({
      description: 'Retrieve a list of all appointments booked by the current user.',
      parameters: z.object({}),
      handler: async ({ context }) => {
        const userAppointments = await appointments.query({
          where: { patientId: { equals: context.username } }
        });
        return await Array.fromAsync(userAppointments) as any;
      }
    }),
    bookAppointment: tool({
      description: 'Book an appointment with a doctor for a specific date and time.',
      parameters: z.object({
        doctorId: z.string().describe('The ID of the doctor to book (e.g., doc-1, doc-2, doc-3, doc-4)'),
        date: z.string().describe('The date of the appointment in YYYY-MM-DD format'),
        timeSlot: z.string().describe('The time slot for the appointment (e.g., 09:00 AM, 02:30 PM)'),
        notes: z.string().optional().describe('Any symptoms or patient notes for the doctor')
      }),
      handler: async ({ input, context }) => {
        const doctor = DOCTORS.find(d => d.id === input.doctorId);
        if (!doctor) return { error: `Doctor with ID ${input.doctorId} not found. Available doctors are doc-1, doc-2, doc-3, doc-4.` } as any;

        const appointmentId = `appt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const appt = {
          patientId: context.username,
          appointmentId,
          patientName: context.name || context.username,
          doctorId: input.doctorId,
          doctorName: doctor.name,
          date: input.date,
          timeSlot: input.timeSlot,
          status: 'scheduled' as const,
          notes: input.notes ?? '',
          version: 1,
          createdAt: Date.now()
        };
        await appointments.put(appt);
        await rt.publish('hospital', 'updates', { action: 'appointment_created', patientId: context.username, doctorId: input.doctorId });
        return { success: true, message: `Appointment booked successfully with ${doctor.name} on ${input.date} at ${input.timeSlot}.`, appointment: appt } as any;
      }
    }),
    cancelAppointment: tool({
      description: 'Cancel an existing appointment by its ID.',
      parameters: z.object({
        appointmentId: z.string().describe('The ID of the appointment to cancel')
      }),
      handler: async ({ input, context }) => {
        const appt = await appointments.get({ patientId: context.username, appointmentId: input.appointmentId });
        if (!appt) return { error: `Appointment ${input.appointmentId} not found.` } as any;

        await appointments.put({
          ...appt,
          status: 'cancelled',
          version: appt.version + 1
        }, { ifFieldEquals: { version: appt.version } });

        await rt.publish('hospital', 'updates', { action: 'appointment_updated', patientId: context.username, doctorId: appt.doctorId });
        return { success: true, message: 'Appointment cancelled successfully.' } as any;
      }
    })
  })
});


// ─── Doctors List ────────────────────────────────────────────────────────────
const DOCTORS = [
  { id: 'doc-1', name: 'Dr. Sarah Connor', specialty: 'General Medicine' },
  { id: 'doc-2', name: 'Dr. Gregory House', specialty: 'Diagnostic Medicine' },
  { id: 'doc-3', name: 'Dr. Stephen Strange', specialty: 'Neurosurgery' },
  { id: 'doc-4', name: 'Dr. Leonard McCoy', specialty: 'Cardiology' },
];

// ─── Realtime Messaging ──────────────────────────────────────────────────────
const rt = new Realtime(scope, 'live', {
  namespaces: {
    hospital: Realtime.namespace(z.object({
      action: z.enum(['appointment_created', 'appointment_updated', 'record_created', 'settings_updated']),
      patientId: z.string().optional(),
      doctorId: z.string().optional(),
    })),
  },
});


// ─── API Namespace ───────────────────────────────────────────────────────────
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getUserProfile() {
    const user = await auth.requireAuth(context);
    const attributes = await auth.fetchUserAttributes(context);
    const role = attributes['custom:role'] || 'patient';
    return { username: user.username, name: user.username.split('@')[0], role };
  },

  async setUserRole(role: 'patient' | 'doctor' | 'admin') {
    const user = await auth.requireAuth(context);
    await auth.updateUserAttribute(context, 'custom:role', role);
    return { success: true, role };
  },

  async listDoctors() {
    return DOCTORS;
  },

  async bookAppointment(doctorId: string, date: string, timeSlot: string, notes: string = '') {
    const user = await auth.requireAuth(context);
    const doctor = DOCTORS.find(d => d.id === doctorId);
    if (!doctor) throw new Error('Doctor not found');

    const appointmentId = `appt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const appt = {
      patientId: user.username,
      appointmentId,
      patientName: user.username.split('@')[0],
      doctorId,
      doctorName: doctor.name,
      date,
      timeSlot,
      status: 'scheduled' as const,
      notes,
      version: 1,
      createdAt: Date.now(),
    };
    await appointments.put(appt);
    await rt.publish('hospital', 'updates', { action: 'appointment_created', patientId: user.username, doctorId });
    return appt;
  },

  async listMyAppointments() {
    const user = await auth.requireAuth(context);
    const userAppts = appointments.query({
      where: { patientId: { equals: user.username } }
    });
    return await Array.fromAsync(userAppts);
  },

  async listDoctorAppointments() {
    const user = await auth.requireAuth(context);
    
    // Map email/username to a doctor ID for testing convenience
    let doctorId = 'doc-1';
    if (user.username.includes('doc-2')) doctorId = 'doc-2';
    else if (user.username.includes('doc-3')) doctorId = 'doc-3';
    else if (user.username.includes('doc-4')) doctorId = 'doc-4';
    else if (user.username.includes('doc-1')) doctorId = 'doc-1';

    const doctorAppts = appointments.query({
      index: 'byDoctor',
      where: { doctorId: { equals: doctorId } }
    });
    return await Array.fromAsync(doctorAppts);
  },

  async cancelAppointment(patientId: string, appointmentId: string) {
    const user = await auth.requireAuth(context);
    const appt = await appointments.get({ patientId, appointmentId });
    if (!appt) throw new Error('Appointment not found');

    const attributes = await auth.fetchUserAttributes(context);
    const role = attributes['custom:role'] || 'patient';
    if (role === 'patient' && appt.patientId !== user.username) {
      throw new Error('Not authorized to cancel this appointment');
    }

    await appointments.put({
      ...appt,
      status: 'cancelled',
      version: appt.version + 1
    }, { ifFieldEquals: { version: appt.version } });

    await rt.publish('hospital', 'updates', { action: 'appointment_updated', patientId, doctorId: appt.doctorId });
    return { success: true };
  },

  async acceptAppointment(patientId: string, appointmentId: string) {
    const user = await auth.requireAuth(context);
    const appt = await appointments.get({ patientId, appointmentId });
    if (!appt) throw new Error('Appointment not found');

    const attributes = await auth.fetchUserAttributes(context);
    const role = attributes['custom:role'] || 'patient';
    if (role !== 'doctor' && role !== 'admin') {
      throw new Error('Not authorized to accept this appointment');
    }

    await appointments.put({
      ...appt,
      status: 'accepted',
      version: appt.version + 1
    }, { ifFieldEquals: { version: appt.version } });

    await rt.publish('hospital', 'updates', { action: 'appointment_updated', patientId, doctorId: appt.doctorId });
    return { success: true };
  },

  async completeAppointment(patientId: string, appointmentId: string) {
    const user = await auth.requireAuth(context);
    const appt = await appointments.get({ patientId, appointmentId });
    if (!appt) throw new Error('Appointment not found');

    const attributes = await auth.fetchUserAttributes(context);
    const role = attributes['custom:role'] || 'patient';
    if (role !== 'doctor' && role !== 'admin') {
      throw new Error('Not authorized to complete this appointment');
    }

    await appointments.put({
      ...appt,
      status: 'completed',
      version: appt.version + 1
    }, { ifFieldEquals: { version: appt.version } });

    await rt.publish('hospital', 'updates', { action: 'appointment_updated', patientId, doctorId: appt.doctorId });
    return { success: true };
  },

  async addMedicalRecord(patientId: string, diagnosis: string, treatment: string, prescription: string) {
    const user = await auth.requireAuth(context);
    const attributes = await auth.fetchUserAttributes(context);
    const role = attributes['custom:role'] || 'patient';
    if (role !== 'doctor') {
      throw new Error('Unauthorized: Doctor role required.');
    }

    const recordId = `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const record = {
      patientId,
      recordId,
      date: new Date().toISOString().split('T')[0],
      diagnosis,
      treatment,
      prescription,
      doctorName: user.username.split('@')[0],
      createdAt: Date.now(),
    };
    await medicalRecords.put(record);
    await rt.publish('hospital', 'updates', { action: 'record_created', patientId });
    return record;
  },

  async listMedicalRecords(patientId?: string) {
    const user = await auth.requireAuth(context);
    const attributes = await auth.fetchUserAttributes(context);
    const role = attributes['custom:role'] || 'patient';

    let targetPatientId = user.username;
    if (role === 'doctor' && patientId) {
      targetPatientId = patientId;
    }

    const recordsList = medicalRecords.query({
      where: { patientId: { equals: targetPatientId } }
    });
    return await Array.fromAsync(recordsList);
  },

  async getHospitalSettings() {
    return await getSettingsOrDefault();
  },

  async updateHospitalSettings(settingsData: { visitingHours: string, erWaitTime: string, bedCapacity: string, announcement: string }) {
    const user = await auth.requireAuth(context);
    const attributes = await auth.fetchUserAttributes(context);
    const role = attributes['custom:role'] || 'patient';
    if (role !== 'admin') {
      throw new Error('Unauthorized: Admin role required.');
    }

    await settings.put('hospital_config', settingsData);
    await rt.publish('hospital', 'updates', { action: 'settings_updated' });
    return { success: true };
  },

  async createChatConversation() {
    const user = await auth.requireAuth(context);
    return { conversationId: await agent.createConversationId(user.username) };
  },

  async sendChatMessage(conversationId: string, message: string, channelId: string) {
    const user = await auth.requireAuth(context);
    const name = user.username.split('@')[0];
    await agent.stream(message, {
      conversationId,
      channelId,
      userId: user.username,
      context: { username: user.username, name },
    });
  },

  async getChatConversation(conversationId: string) {
    const user = await auth.requireAuth(context);
    const owned = await agent.listConversations(user.username);
    if (!owned.some(c => c.conversationId === conversationId)) {
      throw new Error('Conversation not found or unauthorized');
    }
    return { messages: await agent.getConversation(conversationId) };
  },

  async getChatChannel(channelId: string) {
    return agent.getChannel(channelId);
  },

  async subscribeHospital() {
    return rt.getChannel('hospital', 'updates');
  }
}));
