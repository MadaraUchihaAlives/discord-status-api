if (!window.XD_SMS.requireAuth()) throw new Error('auth_required');

window.XD_SMS.initSidebar("dashboard");

async function loadDashboard() {
  const { data } = await window.XD_SMS.api("/api/dashboard");
  if (!data) return;

  document.getElementById("onlineDevices").textContent = data.onlineDevices || 0;
  document.getElementById("todayRequests").textContent = data.todayRequests || 0;
  document.getElementById("pendingQueue").textContent = data.pendingQueue || 0;
  document.getElementById("failedQueue").textContent = data.failedQueue || 0;

  const badge = document.getElementById("gatewayBadge");
  if (data.gatewayStatus?.paused) {
    badge.innerHTML = '<span class="badge badge-warning">Gateway paused</span>';
  } else if (data.gatewayStatus?.online) {
    badge.innerHTML = '<span class="badge badge-success">Gateway online</span>';
  } else {
    badge.innerHTML = '<span class="badge badge-danger">Gateway offline</span>';
  }

  const primary = document.getElementById("primaryDevice");
  const device = data.primaryDevice;
  if (!device) {
    primary.className = "empty-state";
    primary.textContent = "No device connected yet. Connect your Android gateway app to begin.";
    return;
  }

  primary.className = "device-item";
  primary.innerHTML = `
    <div class="device-item-header">
      <strong>${device.device_name || "Android Device"}</strong>
      ${window.XD_SMS.statusBadge(device.status)}
    </div>
    <div class="meta-grid">
      <div>Model: ${device.phone_model || "-"}</div>
      <div>Battery: ${device.battery ?? 0}%</div>
      <div>Carrier: ${device.carrier || "-"}</div>
      <div>SIM: ${device.sim_number || "-"}</div>
      <div>Network: ${device.network_type || "-"}</div>
      <div>Last seen: ${window.XD_SMS.formatDate(device.last_seen)}</div>
    </div>
  `;
}

async function loadQueue() {
  const { data } = await window.XD_SMS.api("/api/queue");
  const container = document.getElementById("recentQueue");
  const items = (data?.queue || []).slice(0, 8);

  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Queue is empty</div>';
    return;
  }

  container.innerHTML = items.map((item) => `
    <div class="log-item">
      <div class="log-item-header">
        <strong>${item.phone_number}</strong>
        ${window.XD_SMS.statusBadge(item.status)}
      </div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">${item.message}</div>
      <div style="font-size:12px;color:var(--text-muted);">${window.XD_SMS.formatDate(item.created_at)}</div>
    </div>
  `).join("");
}

const socket = window.XD_SMS.connectSocket();
if (socket) {
  socket.on("queue_updated", () => {
    loadDashboard();
    loadQueue();
  });
  socket.on("device_updated", () => loadDashboard());
  socket.on("device_connected", () => loadDashboard());
  socket.on("device_disconnected", () => loadDashboard());
}

loadDashboard();
loadQueue();
setInterval(() => {
  loadDashboard();
  loadQueue();
}, 15000);


