if (!window.XD_SMS.requireAuth()) throw new Error('auth_required');
window.XD_SMS.initSidebar("devices");

async function loadDevices() {
  const { data } = await window.XD_SMS.api("/api/devices");
  const tbody = document.getElementById("deviceTableBody");
  const devices = data?.devices || [];

  if (!devices.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No devices connected yet</div></td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map((d) => `
    <tr>
      <td>${window.XD_SMS.statusBadge(d.status)}</td>
      <td>${d.device_name}</td>
      <td>${d.phone_model || "-"}</td>
      <td>${d.battery ?? 0}%</td>
      <td>${d.network_type || "-"}</td>
      <td>${d.carrier || "-"}</td>
      <td>${d.sim_number || "-"}</td>
      <td>${window.XD_SMS.formatDate(d.last_seen)}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="pauseDevice('${d.id}')">Pause</button>
        <button class="btn btn-secondary btn-sm" onclick="resumeDevice('${d.id}')">Resume</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDevice('${d.id}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

window.pauseDevice = async (id) => {
  await window.XD_SMS.api(`/api/device/${id}/pause`, { method: "POST" });
  loadDevices();
};

window.resumeDevice = async (id) => {
  await window.XD_SMS.api(`/api/device/${id}/resume`, { method: "POST" });
  loadDevices();
};

window.deleteDevice = async (id) => {
  if (!confirm("Delete this device?")) return;
  await window.XD_SMS.api(`/api/device/${id}/delete`, { method: "POST" });
  loadDevices();
};

loadDevices();


