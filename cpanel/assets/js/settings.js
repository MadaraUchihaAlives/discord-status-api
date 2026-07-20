if (!window.XD_SMS.requireAuth()) throw new Error('auth_required');
window.XD_SMS.initSidebar("settings");

function showAlert(message, type) {
  const box = document.getElementById("settingsAlert");
  box.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

async function loadSettings() {
  const { data } = await window.XD_SMS.api("/api/settings");
  const settings = data?.settings || {};
  const gateway = data?.gateway || {};

  document.getElementById("timezone").value = settings.timezone || "UTC";
  document.getElementById("notificationsEnabled").checked = settings.notifications_enabled !== false;

  const savedTheme = localStorage.getItem("xd_sms_theme");
  document.getElementById("themePref").value =
    savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system";

  const control = document.getElementById("gatewayControl");
  control.innerHTML = gateway.paused
    ? '<span class="badge badge-warning">Gateway paused</span>'
    : '<span class="badge badge-success">Gateway active</span>';

  const stats = await window.XD_SMS.api("/api/statistics?period=today");
  if (stats.data) {
    document.getElementById("statSent").textContent = stats.data.total_sent || 0;
    document.getElementById("statFailed").textContent = stats.data.total_failed || 0;
    document.getElementById("statPending").textContent = stats.data.total_pending || 0;
    document.getElementById("statRate").textContent = `${stats.data.success_rate || 0}%`;
  }
}

document.getElementById("pauseGatewayBtn").addEventListener("click", async () => {
  await window.XD_SMS.api("/api/settings/gateway/pause", { method: "POST" });
  showAlert("Gateway paused. New SMS will not be processed.", "success");
  loadSettings();
});

document.getElementById("resumeGatewayBtn").addEventListener("click", async () => {
  await window.XD_SMS.api("/api/settings/gateway/resume", { method: "POST" });
  showAlert("Gateway resumed.", "success");
  loadSettings();
});

document.getElementById("clearQueueBtn").addEventListener("click", async () => {
  if (!confirm("Clear pending, failed, and cancelled items from the queue?")) return;
  await window.XD_SMS.api("/api/queue/clear", { method: "POST" });
  showAlert("Queue cleared.", "success");
});

document.getElementById("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const timezone = document.getElementById("timezone").value;
  const themePref = document.getElementById("themePref").value;
  const notifications_enabled = document.getElementById("notificationsEnabled").checked;

  if (themePref === "system") {
    localStorage.removeItem("xd_sms_theme");
    window.XD_SMS.setTheme(
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );
  } else {
    window.XD_SMS.setTheme(themePref);
  }

  const { response } = await window.XD_SMS.api("/api/settings/update", {
    method: "POST",
    body: JSON.stringify({ timezone, theme: themePref, notifications_enabled })
  });

  if (response.ok) {
    showAlert("Settings saved.", "success");
    return;
  }
  showAlert("Could not save settings.", "error");
});

loadSettings();

const apiBase = window.XD_SMS.API_BASE;
document.getElementById("apiReference").textContent = `POST ${apiBase}/api/sms/send
X-API-Key: YOUR_API_KEY

{
  "phone_number": "9876543210",
  "message": "Hello"
}

GET ${apiBase}/api/get
POST ${apiBase}/api/done
POST ${apiBase}/api/device/connect`;


