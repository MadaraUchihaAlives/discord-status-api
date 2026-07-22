if (!window.XD_SMS.requireAuth()) throw new Error('auth_required');
window.XD_SMS.initSidebar("logs");

async function loadSmsLogs() {
  const { data } = await window.XD_SMS.api("/api/sms/history");
  const container = document.getElementById("smsLogs");
  const logs = data?.history || [];

  if (!logs.length) {
    container.innerHTML = '<div class="empty-state">No SMS history yet</div>';
    return;
  }

  container.innerHTML = logs.map((log) => `
    <div class="log-item">
      <div class="log-item-header">
        <strong>${log.phone_number}</strong>
        ${window.XD_SMS.statusBadge(log.status)}
      </div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">${log.message}</div>
      <div style="font-size:12px;color:var(--text-muted);">
        ${window.XD_SMS.formatDate(log.sent_at)} · Request ${log.request_id || "-"}
      </div>
    </div>
  `).join("");
}

async function loadActivityLogs() {
  const { data } = await window.XD_SMS.api("/api/logs?limit=30");
  const container = document.getElementById("activityLogs");
  const logs = data?.logs || [];

  if (!logs.length) {
    container.innerHTML = '<div class="empty-state">No activity yet</div>';
    return;
  }

  container.innerHTML = logs.map((log) => `
    <div class="log-item">
      <div class="log-item-header">
        <strong>${log.action}</strong>
        ${window.XD_SMS.statusBadge(log.status)}
      </div>
      <div style="font-size:12px;color:var(--text-muted);">
        ${window.XD_SMS.formatDate(log.created_at)} · ${log.ip_address || "-"}
      </div>
    </div>
  `).join("");
}

loadSmsLogs();
loadActivityLogs();


