const state = {
  appointments: [],
  editingId: null
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  list: $("#appointmentList"),
  modal: $("#modalBackdrop"),
  form: $("#appointmentForm"),
  addBtn: $("#addBtn"),
  closeModal: $("#closeModal"),
  cancelModal: $("#cancelModal"),
  dateFilter: $("#dateFilter"),
  statusFilter: $("#statusFilter"),
  clearFilters: $("#clearFilters"),
  alertArea: $("#alertArea"),
  modalTitle: $("#modalTitle"),
  modalEyebrow: $("#modalEyebrow"),
  appointmentId: $("#appointmentId"),
  title: $("#title"),
  description: $("#description"),
  appointmentDate: $("#appointmentDate"),
  startTime: $("#startTime"),
  endTime: $("#endTime"),
  status: $("#status"),
  saveBtn: $("#saveBtn"),
  totalCount: $("#totalCount"),
  scheduledCount: $("#scheduledCount"),
  completedCount: $("#completedCount"),
  cancelledCount: $("#cancelledCount"),
  todayCard: $("#todayCard")
};

document.addEventListener("DOMContentLoaded", () => {
  setTodayCard();
  loadAppointments();
  bindEvents();
});

function bindEvents() {
  elements.addBtn.addEventListener("click", () => openModal());
  elements.closeModal.addEventListener("click", closeModal);
  elements.cancelModal.addEventListener("click", closeModal);
  elements.form.addEventListener("submit", saveAppointment);

  elements.dateFilter.addEventListener("change", loadAppointments);
  elements.statusFilter.addEventListener("change", loadAppointments);
  elements.clearFilters.addEventListener("click", () => {
    elements.dateFilter.value = "";
    elements.statusFilter.value = "all";
    loadAppointments();
  });

  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

async function loadAppointments() {
  showLoading();

  const params = new URLSearchParams();
  if (elements.dateFilter.value) params.set("date", elements.dateFilter.value);
  if (elements.statusFilter.value !== "all") params.set("status", elements.statusFilter.value);

  try {
    const response = await fetch(`/api/appointments?${params.toString()}`);
    if (!response.ok) throw new Error("Could not load appointments.");
    state.appointments = await response.json();
    renderAppointments();
    updateStats();
  } catch (error) {
    showAlert(error.message, "error");
    elements.list.innerHTML = `<div class="empty-state">Unable to load appointments.</div>`;
  }
}

function renderAppointments() {
  if (!state.appointments.length) {
    elements.list.innerHTML = `
      <div class="empty-state">
        <div>
          <strong>No appointments match these filters.</strong>
          <div style="margin-top:6px">Try resetting the filters or add a new appointment.</div>
        </div>
      </div>
    `;
    return;
  }

  elements.list.innerHTML = state.appointments.map((item) => `
    <article class="appointment-row">
      <div class="appointment-main">
        <div class="time-block">
          <div class="date">${formatDate(item.appointment_date)}</div>
          <div class="time">${formatTime(item.start_time)} — ${formatTime(item.end_time)}</div>
        </div>

        <div>
          <div class="title-line">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="status-pill status-${item.status}">${item.status}</span>
          </div>
          ${item.description ? `<div class="description">${escapeHtml(item.description)}</div>` : ""}
        </div>
      </div>

      <div class="row-actions">
        ${item.status === "scheduled"
          ? `<button class="icon-button" title="Mark completed" onclick="changeStatus(${item.id}, 'completed')">✓</button>`
          : ""}
        ${item.status !== "cancelled"
          ? `<button class="icon-button" title="Cancel" onclick="changeStatus(${item.id}, 'cancelled')">×</button>`
          : ""}
        <button class="icon-button" title="Edit" onclick="editAppointment(${item.id})">✎</button>
        <button class="icon-button danger" title="Delete" onclick="deleteAppointment(${item.id})">⌫</button>
      </div>
    </article>
  `).join("");
}

async function saveAppointment(event) {
  event.preventDefault();

  const id = elements.appointmentId.value;
  const payload = {
    title: elements.title.value.trim(),
    description: elements.description.value.trim(),
    appointment_date: elements.appointmentDate.value,
    start_time: elements.startTime.value,
    end_time: elements.endTime.value,
    status: elements.status.value
  };

  if (!payload.title || !payload.appointment_date || !payload.start_time || !payload.end_time) {
    showAlert("Please complete all required fields.", "error");
    return;
  }

  elements.saveBtn.disabled = true;
  elements.saveBtn.textContent = "Saving…";

  try {
    const response = await fetch(
      id ? `/api/appointments/${id}` : "/api/appointments",
      {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not save appointment.");
    }

    closeModal();
    showAlert(id ? "Appointment updated successfully." : "Appointment added successfully.", "success");
    await loadAppointments();
  } catch (error) {
    showAlert(error.message, "error");
  } finally {
    elements.saveBtn.disabled = false;
    elements.saveBtn.textContent = "Save appointment";
  }
}

function openModal(item = null) {
  state.editingId = item?.id || null;
  elements.modal.classList.add("open");

  elements.modalTitle.textContent = item ? "Edit appointment" : "Create an appointment";
  elements.modalEyebrow.textContent = item ? "EDIT APPOINTMENT" : "NEW APPOINTMENT";
  elements.appointmentId.value = item?.id || "";
  elements.title.value = item?.title || "";
  elements.description.value = item?.description || "";
  elements.appointmentDate.value = item?.appointment_date || new Date().toISOString().slice(0, 10);
  elements.startTime.value = item?.start_time || "09:00";
  elements.endTime.value = item?.end_time || "10:00";
  elements.status.value = item?.status || "scheduled";
  setTimeout(() => elements.title.focus(), 50);
}

function closeModal() {
  elements.modal.classList.remove("open");
  state.editingId = null;
}

function editAppointment(id) {
  const item = state.appointments.find((appointment) => appointment.id === id);
  if (item) openModal(item);
}

async function changeStatus(id, status) {
  try {
    const response = await fetch(`/api/appointments/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not update status.");

    showAlert(`Appointment marked as ${status}.`, "success");
    loadAppointments();
  } catch (error) {
    showAlert(error.message, "error");
  }
}

async function deleteAppointment(id) {
  const item = state.appointments.find((appointment) => appointment.id === id);
  if (!item) return;

  const confirmed = window.confirm(`Delete "${item.title}" permanently?`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error || "Could not delete appointment.");

    showAlert("Appointment deleted.", "success");
    loadAppointments();
  } catch (error) {
    showAlert(error.message, "error");
  }
}

function updateStats() {
  const all = state.appointments;
  elements.totalCount.textContent = all.length;
  elements.scheduledCount.textContent = all.filter(x => x.status === "scheduled").length;
  elements.completedCount.textContent = all.filter(x => x.status === "completed").length;
  elements.cancelledCount.textContent = all.filter(x => x.status === "cancelled").length;
}

function showLoading() {
  elements.list.innerHTML = `
    <div class="loading-state">
      <div>
        <div class="loader"></div>
        Loading appointments…
      </div>
    </div>
  `;
}

function showAlert(message, type) {
  elements.alertArea.innerHTML = `
    <div class="alert ${type}">
      <span>${escapeHtml(message)}</span>
      <button onclick="this.parentElement.remove()" style="border:0;background:transparent;font-size:18px;color:inherit;">×</button>
    </div>
  `;
  setTimeout(() => {
    const alert = elements.alertArea.querySelector(".alert");
    if (alert) alert.remove();
  }, 4500);
}

function setTodayCard() {
  const today = new Date();
  elements.todayCard.innerHTML = `
    <div class="day">${today.getDate()}</div>
    <div class="month">${today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
  `;
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

window.editAppointment = editAppointment;
window.changeStatus = changeStatus;
window.deleteAppointment = deleteAppointment;
