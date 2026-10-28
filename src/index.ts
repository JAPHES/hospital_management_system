/**
 * Frontend — src/index.ts
 *
 * Hospital care and administration portal with streaming chatbot support.
 */
import { api, authApi } from 'aws-blocks';
import { AccountMenuBar, AuthenticatedContent, onAuthChange } from '@aws-blocks/blocks/ui';
import { html, render } from 'lit-html';
import { useChat } from '@aws-blocks/bb-agent/client';
import { formatAssistantMessage } from './chat-format';

// ─── Auth state coordination ──────────────────────────────────────────────────
const menuBarEl = document.getElementById('menu-bar')!;
menuBarEl.appendChild(AccountMenuBar(authApi));

const chatToggleBtn = document.getElementById('chat-toggle')!;
const chatDrawer = document.getElementById('chat-drawer')!;
const chatBackdrop = document.getElementById('chat-backdrop')!;
const devBanner = document.getElementById('dev-banner')!;
const activeRoleText = document.getElementById('active-role-text')!;
const roleSelect = document.getElementById('role-select') as HTMLSelectElement;

// Toggle chat drawer visibility
function toggleChat() {
  chatDrawer.classList.toggle('open');
  chatBackdrop.classList.toggle('open');
}

chatToggleBtn.onclick = toggleChat;
document.getElementById('chat-close')!.onclick = toggleChat;
chatBackdrop.onclick = toggleChat;

// Watch for authentication changes to adjust floating button and dev switcher banner
onAuthChange(authApi, async (user) => {
  const loggedIn = user != null;
  document.getElementById('signInMessage')!.style.display = loggedIn ? 'none' : '';
  chatToggleBtn.style.display = loggedIn ? '' : 'none';
  
  if (loggedIn) {
    try {
      const profile = await api.getUserProfile();
      devBanner.style.display = '';
      activeRoleText.innerText = profile.role.toUpperCase();
      roleSelect.value = profile.role;
      initChat(user.username);
    } catch (e) {
      console.error('Error fetching user profile', e);
    }
  } else {
    devBanner.style.display = 'none';
    chatDrawer.classList.remove('open');
    chatBackdrop.classList.remove('open');
  }
});

// Dev role switcher callback
roleSelect.onchange = async () => {
  const newRole = roleSelect.value as 'patient' | 'doctor' | 'admin';
  try {
    await api.setUserRole(newRole);
    window.location.reload();
  } catch (err: any) {
    alert('Failed to switch role: ' + err.message);
  }
};

// ─── Chatbot integration using useChat ──────────────────────────────────────────
let chatInstance: any = null;

function initChat(username: string) {
  if (chatInstance) {
    chatInstance.destroy();
  }

  const messagesContainer = document.getElementById('chat-messages')!;
  const inputEl = document.getElementById('chat-input') as HTMLInputElement;
  const sendBtn = document.getElementById('chat-send') as HTMLButtonElement;

  function renderMessages(messages: any[]) {
    render(html`
      <div class="chat-bubble chat-bubble-assistant">
        👋 Welcome to the Taita Taveta University Health Unit AI Assistant. Ask me about doctors, health unit guidelines, ER wait times, or ask me to book/cancel an appointment for you!
      </div>
      ${messages.map(msg => {
        const content = msg.role === 'assistant'
          ? formatAssistantMessage(msg.content)
          : msg.content;
        return html`
          <div class="chat-bubble chat-bubble-${msg.role}">
            ${content.split('\n').map((para: string) => html`<p style="margin-bottom: 6px;">${para}</p>`)}
          </div>
        `;
      })}
      ${chatInstance?.isLoading() ? html`
        <div class="chat-bubble chat-bubble-assistant" style="opacity: 0.6; display: flex; align-items: center; gap: 8px;">
          <span style="font-style: italic;">Assistant is typing...</span>
        </div>
      ` : ''}
    `, messagesContainer);
    
    // Auto-scroll to the latest message
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  chatInstance = useChat({
    api: {
      sendMessage: (convId, msg, chId) => api.sendChatMessage(convId, msg, chId),
      createConversation: () => api.createChatConversation(),
      getConversation: (id) => api.getChatConversation(id),
    },
    subscribe: async (channelId, handler) => {
      const channel = await api.getChatChannel(channelId);
      return channel.subscribe(handler);
    },
    onMessagesChange: (msgs) => {
      renderMessages(msgs);
    },
    onLoadingChange: () => {
      renderMessages(chatInstance.getMessages());
    },
  });

  async function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    await chatInstance.sendMessage(text);
  }

  sendBtn.onclick = send;
  inputEl.onkeydown = (e) => {
    if (e.key === 'Enter') send();
  };

  renderMessages([]);
}

// ─── App Dashboard ─────────────────────────────────────────────────────────────
document.getElementById('app')!.appendChild(
  AuthenticatedContent(authApi, (user) => {
    const container = document.createElement('div');
    
    let role = 'patient';
    let appointments: any[] = [];
    let medicalRecords: any[] = [];
    let doctors: any[] = [];
    let settings = { visitingHours: '', erWaitTime: '', bedCapacity: '', announcement: '' };
    
    let activeTab = 'appointments';

    async function loadData() {
      try {
        const profile = await api.getUserProfile();
        role = profile.role;
        doctors = await api.listDoctors();
        settings = await api.getHospitalSettings();

        if (role === 'patient') {
          appointments = await api.listMyAppointments();
          medicalRecords = await api.listMedicalRecords();
          activeTab = 'appointments';
        } else if (role === 'doctor') {
          appointments = await api.listDoctorAppointments();
          activeTab = 'appointments';
        } else if (role === 'admin') {
          activeTab = 'settings';
        }
        
        redraw();
      } catch (err) {
        console.error('Error loading dashboard data', err);
      }
    }

    async function bookAppointment(e: Event) {
      e.preventDefault();
      const docSelect = container.querySelector('#book-doctor') as HTMLSelectElement;
      const dateInput = container.querySelector('#book-date') as HTMLInputElement;
      const timeSelect = container.querySelector('#book-time') as HTMLSelectElement;
      const notesInput = container.querySelector('#book-notes') as HTMLTextAreaElement;

      const doctorId = docSelect.value;
      const date = dateInput.value;
      const timeSlot = timeSelect.value;
      const notes = notesInput.value.trim();

      if (!date) {
        alert('Please select a date.');
        return;
      }

      try {
        await api.bookAppointment(doctorId, date, timeSlot, notes);
        notesInput.value = '';
        alert('Appointment scheduled successfully!');
        await loadData();
      } catch (err: any) {
        alert('Booking failed: ' + err.message);
      }
    }

    async function addMedicalRecord(e: Event) {
      e.preventDefault();
      const patientInput = container.querySelector('#rec-patient') as HTMLInputElement;
      const diagInput = container.querySelector('#rec-diagnosis') as HTMLInputElement;
      const treatInput = container.querySelector('#rec-treatment') as HTMLInputElement;
      const prescInput = container.querySelector('#rec-prescription') as HTMLTextAreaElement;

      const patientId = patientInput.value.trim();
      const diagnosis = diagInput.value.trim();
      const treatment = treatInput.value.trim();
      const prescription = prescInput.value.trim();

      if (!patientId || !diagnosis || !treatment || !prescription) {
        alert('Please fill out all fields.');
        return;
      }

      try {
        await api.addMedicalRecord(patientId, diagnosis, treatment, prescription);
        patientInput.value = '';
        diagInput.value = '';
        treatInput.value = '';
        prescInput.value = '';
        alert('Medical record added successfully!');
        await loadData();
      } catch (err: any) {
        alert('Failed to save medical record: ' + err.message);
      }
    }

    async function cancelAppt(patientId: string, appointmentId: string) {
      if (!confirm('Are you sure you want to cancel this appointment?')) return;
      try {
        await api.cancelAppointment(patientId, appointmentId);
        await loadData();
      } catch (err: any) {
        alert('Cancellation failed: ' + err.message);
      }
    }

    async function acceptAppt(patientId: string, appointmentId: string) {
      if (!confirm('Are you sure you want to accept this appointment?')) return;
      try {
        await api.acceptAppointment(patientId, appointmentId);
        await loadData();
      } catch (err: any) {
        alert('Failed to accept appointment: ' + err.message);
      }
    }

    async function completeAppt(patientId: string, appointmentId: string) {
      if (!confirm('Are you sure you want to mark this appointment as completed?')) return;
      try {
        await api.completeAppointment(patientId, appointmentId);
        await loadData();
      } catch (err: any) {
        alert('Failed to complete appointment: ' + err.message);
      }
    }

    async function updateSettings(e: Event) {
      e.preventDefault();
      const vHours = (container.querySelector('#settings-hours') as HTMLInputElement).value;
      const erWait = (container.querySelector('#settings-wait') as HTMLInputElement).value;
      const cap = (container.querySelector('#settings-capacity') as HTMLInputElement).value;
      const announce = (container.querySelector('#settings-announce') as HTMLTextAreaElement).value;

      try {
        await api.updateHospitalSettings({
          visitingHours: vHours,
          erWaitTime: erWait,
          bedCapacity: cap,
          announcement: announce,
        });
        alert('Hospital settings updated successfully!');
        await loadData();
      } catch (err: any) {
        alert('Update failed: ' + err.message);
      }
    }

    function redraw() {
      render(html`
        <!-- Announcement Banner -->
        <div class="welcome-section">
          <div class="welcome-title">🏥 Taita Taveta University Health Unit</div>
          <div class="welcome-subtitle">${settings.announcement || 'Connecting you to your clinical care team.'}</div>
        </div>

        <!-- Metrics Row (KV Store visualization) -->
        <div class="dashboard-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 30px;">
          <div class="card" style="padding: 16px; display: flex; align-items: center; gap: 16px;">
            <div style="background-color: var(--accent-light); padding: 12px; border-radius: 8px; color: var(--accent-color);">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">ER ESTIMATED WAIT</div>
              <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-color);">${settings.erWaitTime || '15 minutes'}</div>
            </div>
          </div>
          <div class="card" style="padding: 16px; display: flex; align-items: center; gap: 16px;">
            <div style="background-color: var(--accent-light); padding: 12px; border-radius: 8px; color: var(--accent-color);">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
              </svg>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">VISITING HOURS</div>
              <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-color);">${settings.visitingHours || '24 Hours, 7 Days a Week'}</div>
            </div>
          </div>
          <div class="card" style="padding: 16px; display: flex; align-items: center; gap: 16px;">
            <div style="background-color: var(--accent-light); padding: 12px; border-radius: 8px; color: var(--accent-color);">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9M10 8v9"></path>
              </svg>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">BED CAPACITY</div>
              <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-color);">${settings.bedCapacity || '95% available'}</div>
            </div>
          </div>
        </div>

        <!-- Role-Specific Views -->
        ${role === 'patient' ? renderPatientView() : ''}
        ${role === 'doctor' ? renderDoctorView() : ''}
        ${role === 'admin' ? renderAdminView() : ''}
      `, container);
    }

    // ─── Patient UI Panels ────────────────────────────────────────────────────
    function renderPatientView() {
      return html`
        <div class="tabs-nav">
          <button class="tab-btn ${activeTab === 'appointments' ? 'active' : ''}" @click=${() => { activeTab = 'appointments'; redraw(); }}>Appointments</button>
          <button class="tab-btn ${activeTab === 'medical-records' ? 'active' : ''}" @click=${() => { activeTab = 'medical-records'; redraw(); }}>Medical Records</button>
        </div>

        ${activeTab === 'appointments' ? html`
          <div class="dashboard-grid">
            <!-- Book Appointment Form -->
            <div class="card">
              <h3 class="card-title">🗓️ Book an Appointment</h3>
              <form @submit=${bookAppointment}>
                <div style="margin-bottom: 12px;">
                  <label for="book-doctor">Choose Doctor & Specialty</label>
                  <select id="book-doctor">
                    ${doctors.map(doc => html`<option value="${doc.id}">${doc.name} (${doc.specialty})</option>`)}
                  </select>
                </div>
                <div style="margin-bottom: 12px;">
                  <label for="book-date">Appointment Date</label>
                  <input type="date" id="book-date" min="${new Date().toISOString().split('T')[0]}" />
                </div>
                <div style="margin-bottom: 12px;">
                  <label for="book-time">Time Slot</label>
                  <select id="book-time">
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="10:30 AM">10:30 AM</option>
                    <option value="01:00 PM">01:00 PM</option>
                    <option value="02:30 PM">02:30 PM</option>
                    <option value="04:00 PM">04:00 PM</option>
                  </select>
                </div>
                <div style="margin-bottom: 16px;">
                  <label for="book-notes">Reason/Symptoms</label>
                  <textarea id="book-notes" placeholder="Explain your symptoms or reasons for visit..." rows="3"></textarea>
                </div>
                <button type="submit" class="btn-primary" style="width: 100%;">Schedule Appointment</button>
              </form>
            </div>

            <!-- List Appointments -->
            <div class="card" style="grid-column: span 2;">
              <h3 class="card-title">📝 Scheduled Consultations</h3>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Doctor</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Reason</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${appointments.length === 0 ? html`
                      <tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No appointments scheduled.</td></tr>
                    ` : appointments.map(appt => html`
                      <tr>
                        <td><strong>${appt.doctorName}</strong></td>
                        <td>${appt.date}</td>
                        <td>${appt.timeSlot}</td>
                        <td><span class="badge badge-${appt.status}">${appt.status}</span></td>
                        <td style="color: var(--text-secondary); font-size: 0.85rem;">${appt.notes || 'N/A'}</td>
                        <td>
                          ${(appt.status === 'scheduled' || appt.status === 'accepted') ? html`
                            <button class="btn-danger" style="padding: 4px 8px; font-size: 0.8rem;" @click=${() => cancelAppt(appt.patientId, appt.appointmentId)}>Cancel</button>
                          ` : '—'}
                        </td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ` : ''}

        ${activeTab === 'medical-records' ? html`
          <div class="card">
            <h3 class="card-title">📂 Medical History & Prescriptions</h3>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Diagnosis</th>
                    <th>Treatment Plan</th>
                    <th>Prescriptions</th>
                    <th>Doctor</th>
                  </tr>
                </thead>
                <tbody>
                  ${medicalRecords.length === 0 ? html`
                    <tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">No clinical medical history records found.</td></tr>
                  ` : medicalRecords.map(rec => html`
                    <tr>
                      <td>${rec.date}</td>
                      <td><strong>${rec.diagnosis}</strong></td>
                      <td>${rec.treatment}</td>
                      <td><code style="background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: var(--accent-color); font-weight: 500;">${rec.prescription}</code></td>
                      <td>${rec.doctorName}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      `;
    }

    // ─── Doctor UI Panels ─────────────────────────────────────────────────────
    function renderDoctorView() {
      return html`
        <div class="dashboard-grid">
          <!-- Add Diagnosis / Record Form -->
          <div class="card">
            <h3 class="card-title">📝 Log Medical Diagnosis</h3>
            <form @submit=${addMedicalRecord}>
              <div style="margin-bottom: 12px;">
                <label for="rec-patient">Patient Username/Email</label>
                <input type="text" id="rec-patient" placeholder="patient@example.com" />
              </div>
              <div style="margin-bottom: 12px;">
                <label for="rec-diagnosis">Diagnosis Summary</label>
                <input type="text" id="rec-diagnosis" placeholder="e.g. Acute Bronchitis" />
              </div>
              <div style="margin-bottom: 12px;">
                <label for="rec-treatment">Treatment Plan</label>
                <input type="text" id="rec-treatment" placeholder="e.g. Rest, hydration, steam inhalation" />
              </div>
              <div style="margin-bottom: 16px;">
                <label for="rec-prescription">Prescriptions</label>
                <textarea id="rec-prescription" placeholder="e.g. Albuterol Inhaler 90mcg - 2 puffs every 4-6 hours as needed" rows="3"></textarea>
              </div>
              <button type="submit" class="btn-primary" style="width: 100%;">Save Clinical Record</button>
            </form>
          </div>

          <!-- Schedule Consultations List -->
          <div class="card" style="grid-column: span 2;">
            <h3 class="card-title">📅 Consultation Schedule</h3>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${appointments.length === 0 ? html`
                    <tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No patients scheduled.</td></tr>
                  ` : appointments.map(appt => html`
                    <tr>
                      <td><strong>${appt.patientName}</strong> (${appt.patientId})</td>
                      <td>${appt.date}</td>
                      <td>${appt.timeSlot}</td>
                      <td><span class="badge badge-${appt.status}">${appt.status}</span></td>
                      <td style="color: var(--text-secondary); font-size: 0.85rem;">${appt.notes || '—'}</td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          ${appt.status === 'scheduled' ? html`
                            <button style="padding: 4px 8px; font-size: 0.8rem; background-color: #22c55e; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;" @click=${() => acceptAppt(appt.patientId, appt.appointmentId)}>Accept</button>
                            <button class="btn-danger" style="padding: 4px 8px; font-size: 0.8rem;" @click=${() => cancelAppt(appt.patientId, appt.appointmentId)}>Cancel</button>
                          ` : ''}
                          ${appt.status === 'accepted' ? html`
                            <button style="padding: 4px 8px; font-size: 0.8rem; background-color: #3b82f6; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;" @click=${() => completeAppt(appt.patientId, appt.appointmentId)}>Complete</button>
                            <button class="btn-danger" style="padding: 4px 8px; font-size: 0.8rem;" @click=${() => cancelAppt(appt.patientId, appt.appointmentId)}>Cancel</button>
                          ` : ''}
                          ${appt.status !== 'scheduled' && appt.status !== 'accepted' ? html`
                            <span style="color: var(--text-secondary); font-size: 0.85rem;">—</span>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    // ─── Admin UI Panels ──────────────────────────────────────────────────────
    function renderAdminView() {
      return html`
        <div class="card" style="max-width: 600px; margin: 0 auto;">
          <h3 class="card-title">⚙️ Hospital Parameters & Settings</h3>
          <form @submit=${updateSettings}>
            <div style="margin-bottom: 12px;">
              <label for="settings-hours">Visiting Hours Description</label>
              <input type="text" id="settings-hours" .value="${settings.visitingHours}" />
            </div>
            <div style="margin-bottom: 12px;">
              <label for="settings-wait">ER Estimated Wait Time</label>
              <input type="text" id="settings-wait" .value="${settings.erWaitTime}" />
            </div>
            <div style="margin-bottom: 12px;">
              <label for="settings-capacity">Bed Capacity Status</label>
              <input type="text" id="settings-capacity" .value="${settings.bedCapacity}" />
            </div>
            <div style="margin-bottom: 16px;">
              <label for="settings-announce">Portal Care Announcement</label>
              <textarea id="settings-announce" rows="3" .value="${settings.announcement}"></textarea>
            </div>
            <button type="submit" class="btn-primary" style="width: 100%;">Update System Settings</button>
          </form>
        </div>
      `;
    }

    // Subscribe to WebSocket live notifications to auto-refresh the dashboard
    (async () => {
      try {
        const channel = await api.subscribeHospital();
        const sub = channel.subscribe(() => {
          console.log('Real-time notification received, reloading data...');
          loadData();
        });
        await sub.established;
      } catch (err) {
        console.warn('Realtime updates subscription not supported locally', err);
      }
    })();

    loadData();
    return container;
  })
);
