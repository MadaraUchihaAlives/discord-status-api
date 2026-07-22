if (!window.XD_SMS.requireAuth()) throw new Error('auth_required');
window.XD_SMS.initSidebar("send");

async function loadDevices() {
  const { data } = await window.XD_SMS.api("/api/devices");
  const select = document.getElementById("deviceSelect");
  const noDevicesMsg = document.getElementById("noDevicesMsg");
  const sendBtn = document.querySelector("#sendForm .btn-primary");
  const devices = data?.devices || [];

  select.innerHTML = '<option value="">Auto (any online device)</option>' + devices.map((d) => {
    const simInfo = d.sim_number ? ` - SIM: ${d.sim_number}` : "";
    return `<option value="${d.id}">${d.device_name} (${d.phone_model})${simInfo}</option>`;
  }).join("");

  if (!devices.length) {
    noDevicesMsg.style.display = "block";
    sendBtn.disabled = true;
  } else {
    noDevicesMsg.style.display = "none";
    sendBtn.disabled = false;
  }
}

async function loadQueue() {
  const { data } = await window.XD_SMS.api("/api/queue");
  const container = document.getElementById("queueList");
  const items = data?.queue || [];

  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Queue is empty</div>';
    return;
  }

  container.innerHTML = items.slice(0, 12).map((item) => `
    <div class="log-item">
      <div class="log-item-header">
        <strong>${item.phone_number}</strong>
        ${window.XD_SMS.statusBadge(item.status)}
      </div>
      <div style="font-size:13px;color:var(--text-secondary);">${item.message}</div>
    </div>
  `).join("");
}

document.getElementById("sendForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const resultBox = document.getElementById("sendResult");
  resultBox.innerHTML = "";

  const phone_number = document.getElementById("phoneNumber").value.trim();
  const message = document.getElementById("message").value.trim();
  const sim_slot = parseInt(document.getElementById("simSlot").value, 10);
  const device_id = document.getElementById("deviceSelect").value || undefined;

  const body = { phone_number, message, sim_slot };
  if (device_id) body.device_id = device_id;

  const { response, data } = await window.XD_SMS.api("/api/sms/send-panel", {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (response.ok) {
    resultBox.innerHTML = `<div class="alert alert-success">Queued successfully. Request ID: ${data.request_id}</div>`;
    document.getElementById("message").value = "";
    loadQueue();
    loadDevices();
    return;
  }

  resultBox.innerHTML = `<div class="alert alert-error">${data?.error || "Failed to queue SMS"}</div>`;
});

loadQueue();
loadDevices();
