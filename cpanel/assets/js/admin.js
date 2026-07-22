(function () {
  if (!window.XD_SMS.getToken()) {
    window.location.href = "secure-login.html";
    return;
  }
  const user = window.XD_SMS.getUser();
  if (user?.role !== "admin") {
    window.XD_SMS.clearSession();
    window.location.href = "secure-login.html";
    return;
  }

  window.XD_SMS.initSidebar('admin');

  let currentAction = null;
  let currentUserId = null;
  let selectedUserId = null;

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === 'tab-' + tabName));
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  window.openUserAction = function (userId, action, email) {
    currentUserId = userId;
    currentAction = action;
    const modal = document.getElementById('userActionModal');
    const titles = {
      suspend: 'Suspend User',
      unsuspend: 'Unsuspend User',
      role: 'Promote to Admin',
      delete: 'Delete User'
    };
    const messages = {
      suspend: `Suspend ${escapeHtml(email)}? They will lose access to the gateway.`,
      unsuspend: `Unsuspend ${escapeHtml(email)}? They will regain access.`,
      role: `Promote ${escapeHtml(email)} to admin? This grants full system access.`,
      delete: `Permanently delete ${escapeHtml(email)}? This cannot be undone.`
    };
    const forms = {
      suspend: '<div><label class="label" for="reason">Reason</label><textarea class="textarea" id="reason" rows="3" placeholder="Optional reason"></textarea></div>',
      unsuspend: '<div><label class="label" for="reason">Reason</label><textarea class="textarea" id="reason" rows="3" placeholder="Optional reason"></textarea></div>',
      role: '<div class="alert alert-error" style="font-size:12px;">⚠ This grants full admin access. Only do this for trusted users.</div>',
      delete: '<div class="alert alert-error" style="font-size:12px;">⚠ This permanently deletes all user data (devices, API keys, webhooks, SMS history). Cannot be undone.</div>'
    };
    document.getElementById('modalTitle').textContent = titles[action];
    document.getElementById('modalText').textContent = messages[action];
    document.getElementById('modalForm').innerHTML = forms[action];
    modal.classList.add('open');
  };

  async function loadAdminData() {
    try {
      const [statsRes, usersRes, logsRes] = await Promise.all([
        window.XD_SMS.api('/api/admin/stats'),
        window.XD_SMS.api('/api/admin/users'),
        window.XD_SMS.api('/api/admin/logs')
      ]);

      if (statsRes.response.ok) renderStats(statsRes.data);
      if (usersRes.response.ok) renderUsers(usersRes.data.users);
      if (logsRes.response.ok) renderLogs(logsRes.data.logs);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  }

  function renderStats(stats) {
    document.getElementById('statUsers').textContent = stats.totalUsers || 0;
    document.getElementById('statDevices').textContent = stats.totalDevices || 0;
    document.getElementById('statOnline').textContent = stats.onlineDevices || 0;
    document.getElementById('statApiKeys').textContent = stats.totalApiKeys || 0;
    document.getElementById('statWebhooks').textContent = stats.totalWebhooks || 0;
    document.getElementById('statQueued').textContent = stats.totalSmsQueued || 0;
    document.getElementById('statSent').textContent = stats.totalSmsSent || 0;
    document.getElementById('statFailed').textContent = stats.totalSmsFailed || 0;
  }

  function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = users.map(u => {
      const isAdmin = u.role === 'admin';
      const isSuspended = u.role === 'suspended';
      const roleLabel = isSuspended ? 'suspended' : (u.role || 'user');
      const roleClass = isAdmin ? 'badge-danger' : (isSuspended ? 'badge-warning' : 'badge-neutral');
      const actionBtn = isSuspended
        ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation();openUserAction('${u.id}', 'unsuspend', '${escapeHtml(u.email)}')">Unsuspend</button>`
        : `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();openUserAction('${u.id}', 'suspend', '${escapeHtml(u.email)}')">Suspend</button>`;
      const actions = isAdmin
        ? '<span style="color:var(--text-muted);font-size:12px;">Protected</span>'
        : `<div style="display:flex;gap:8px;flex-wrap:wrap;">${actionBtn}<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();openUserAction('${u.id}', 'role', '${escapeHtml(u.email)}')">Make Admin</button><button class="btn btn-sm btn-danger" onclick="event.stopPropagation();openUserAction('${u.id}', 'delete', '${escapeHtml(u.email)}')">Delete</button></div>`;
      return `<tr style="cursor:pointer;" onclick="showUserDetail('${u.id}')"><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.name || '-')}</td><td><span class="badge ${roleClass}">${roleLabel}</span></td><td>${window.XD_SMS.formatDate(u.created_at)}</td><td>${u.last_login ? window.XD_SMS.formatDate(u.last_login) : '-'}</td><td>${actions}</td></tr>`;
    }).join('');
  }

  window.showUserDetail = async function (userId) {
    selectedUserId = userId;
    const panel = document.getElementById('userDetail');
    const content = document.getElementById('userDetailContent');
    panel.style.display = 'block';
    content.innerHTML = '<div class="empty-state">Loading...</div>';

    try {
      const [devicesRes, usersRes] = await Promise.all([
        window.XD_SMS.api(`/api/admin/users/${userId}/devices`),
        window.XD_SMS.api('/api/admin/users')
      ]);

      if (!devicesRes.response.ok) throw new Error('Failed to load devices');
      const user = usersRes.data?.users?.find(u => u.id === userId);
      const devices = devicesRes.data.devices || [];

      let html = '<div style="display:grid;gap:16px;">';

      if (user) {
        html += `<div class="user-detail-grid">
          <div><span style="color:var(--text-muted);font-size:12px;">Email</span><div style="font-weight:500;">${escapeHtml(user.email)}</div></div>
          <div><span style="color:var(--text-muted);font-size:12px;">Name</span><div style="font-weight:500;">${escapeHtml(user.name || '-')}</div></div>
          <div><span style="color:var(--text-muted);font-size:12px;">Role</span><div style="font-weight:500;">${escapeHtml(user.role || 'user')}</div></div>
          <div><span style="color:var(--text-muted);font-size:12px;">Created</span><div style="font-weight:500;">${window.XD_SMS.formatDate(user.created_at)}</div></div>
        </div>`;
      }

      html += '<h3 style="font-size:14px;font-weight:600;margin-top:8px;">Connected Devices</h3>';
      if (devices.length === 0) {
        html += '<div class="empty-state">No devices connected</div>';
      } else {
        html += '<div class="table-wrap"><table><thead><tr><th>Device</th><th>Model</th><th>Battery</th><th>Carrier</th><th>SIM</th><th>Status</th><th>Last Seen</th></tr></thead><tbody>';
        html += devices.map(d => `<tr><td>${escapeHtml(d.device_name || '-')}</td><td>${escapeHtml(d.phone_model || '-')}</td><td>${d.battery ?? '-'}${d.charging ? ' ⚡' : ''}</td><td>${escapeHtml(d.carrier || '-')}</td><td>${escapeHtml(d.sim_number || '-')}</td><td>${window.XD_SMS.statusBadge(d.status)}</td><td>${window.XD_SMS.formatDate(d.last_seen)}</td></tr>`).join('');
        html += '</tbody></table></div>';
      }

      html += '<h3 style="font-size:14px;font-weight:600;margin-top:16px;">Send SMS</h3>';
      html += `<form id="adminSendSmsForm" style="display:grid;gap:12px;max-width:600px;">
        <div><label class="label" for="smsDevice">Device</label><select class="select" id="smsDevice" required><option value="">Select device</option>${devices.map(d => `<option value="${d.id}">${escapeHtml(d.device_name || d.id)} (${d.status})</option>`).join('')}</select></div>
        <div><label class="label" for="smsNumber">Phone Number</label><input class="input" type="text" id="smsNumber" placeholder="+1234567890" required></div>
        <div><label class="label" for="smsSimSlot">SIM Slot</label><select class="select" id="smsSimSlot"><option value="1">SIM 1</option><option value="2">SIM 2</option></select></div>
        <div><label class="label" for="smsMessage">Message</label><textarea class="textarea" id="smsMessage" rows="3" required></textarea></div>
        <button class="btn btn-primary" type="submit">Send SMS</button>
        <div id="smsFormAlert"></div>
      </form>`;

      html += '</div>';
      content.innerHTML = html;

      const form = document.getElementById('adminSendSmsForm');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const deviceId = document.getElementById('smsDevice').value;
          const phoneNumber = document.getElementById('smsNumber').value;
          const simSlot = document.getElementById('smsSimSlot').value;
          const message = document.getElementById('smsMessage').value;
          const alertEl = document.getElementById('smsFormAlert');
          const btn = e.target.querySelector('button[type="submit"]');
          btn.disabled = true;
          btn.textContent = 'Sending...';
          alertEl.innerHTML = '';
          try {
            const res = await window.XD_SMS.api(`/api/admin/user/${userId}/send-sms`, { method: 'POST', body: JSON.stringify({ device_id: deviceId, phone_number: phoneNumber, sim_slot: parseInt(simSlot), message }) });
            if (res.response.ok) {
              alertEl.innerHTML = '<div class="alert alert-success">SMS queued successfully</div>';
              document.getElementById('smsMessage').value = '';
            } else {
              alertEl.innerHTML = `<div class="alert alert-error">${res.data?.error || 'Failed to send SMS'}</div>`;
            }
          } catch (err) {
            alertEl.innerHTML = '<div class="alert alert-error">Failed to send SMS</div>';
          } finally {
            btn.disabled = false;
            btn.textContent = 'Send SMS';
          }
        });
      }
    } catch (err) {
      content.innerHTML = '<div class="alert alert-error">Failed to load user details</div>';
    }
  };

  function renderLogs(logs) {
    const tbody = document.getElementById('logsTableBody');
    tbody.innerHTML = logs.slice(0, 100).map(l => `
      <tr>
        <td>${window.XD_SMS.formatDate(l.created_at)}</td>
        <td>${escapeHtml(l.user_email || 'System')}</td>
        <td>${escapeHtml(l.action)}</td>
        <td>${l.details ? escapeHtml(JSON.stringify(l.details).slice(0, 100)) : '-'}</td>
        <td><span class="badge ${l.status === 'success' ? 'badge-success' : 'badge-danger'}">${escapeHtml(l.status)}</span></td>
        <td>${escapeHtml(l.ip_address || '-')}</td>
      </tr>
    `).join('');
  }

  document.getElementById('userSearch').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('#usersTableBody tr').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? '' : 'none';
    });
  });

  document.getElementById('logSearch').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('#logsTableBody tr').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? '' : 'none';
    });
  });

  document.getElementById('logStatusFilter').addEventListener('change', (e) => {
    const status = e.target.value;
    document.querySelectorAll('#logsTableBody tr').forEach(row => {
      const cell = row.querySelector('td:nth-child(5) .badge');
      if (!status || (cell && cell.textContent.toLowerCase() === status)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  });

  document.getElementById('refreshLogsBtn').addEventListener('click', loadAdminData);

  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('userActionModal').classList.remove('open');
  });

  document.getElementById('confirmModalBtn').addEventListener('click', async () => {
    const reason = document.getElementById('reason')?.value || '';
    const btn = document.getElementById('confirmModalBtn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
      let endpoint = '';
      const body = { user_id: currentUserId, reason };
      switch (currentAction) {
        case 'suspend': endpoint = `/api/admin/user/${currentUserId}/suspend`; break;
        case 'unsuspend': endpoint = `/api/admin/user/${currentUserId}/unsuspend`; break;
        case 'role': endpoint = `/api/admin/user/${currentUserId}/set-role`; body.role = 'admin'; break;
        case 'delete': endpoint = `/api/admin/user/${currentUserId}/delete`; break;
      }

      const res = await window.XD_SMS.api(endpoint, { method: 'POST', body: JSON.stringify(body) });
      if (res.response.ok) {
        document.getElementById('userActionModal').classList.remove('open');
        loadAdminData();
      } else {
        alert(res.data?.error || 'Action failed');
      }
    } catch (err) {
      console.error('Action failed:', err);
      alert('Action failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirm';
    }
  });

  document.getElementById('pauseAllGatewaysBtn').addEventListener('click', async () => {
    const btn = document.getElementById('pauseAllGatewaysBtn');
    btn.disabled = true;
    btn.textContent = 'Pausing...';
    try {
      const res = await window.XD_SMS.api('/api/admin/gateway/pause-all', { method: 'POST' });
      if (res.response.ok) {
        showAlert('gatewayControlAlert', 'success', 'All gateways paused');
        loadAdminData();
      } else {
        showAlert('gatewayControlAlert', 'error', res.data?.error || 'Failed to pause gateways');
      }
    } catch (err) {
      showAlert('gatewayControlAlert', 'error', 'Failed to pause gateways');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Pause All Gateways';
    }
  });

  document.getElementById('resumeAllGatewaysBtn').addEventListener('click', async () => {
    const btn = document.getElementById('resumeAllGatewaysBtn');
    btn.disabled = true;
    btn.textContent = 'Resuming...';
    try {
      const res = await window.XD_SMS.api('/api/admin/gateway/resume-all', { method: 'POST' });
      if (res.response.ok) {
        showAlert('gatewayControlAlert', 'success', 'All gateways resumed');
        loadAdminData();
      } else {
        showAlert('gatewayControlAlert', 'error', res.data?.error || 'Failed to resume gateways');
      }
    } catch (err) {
      showAlert('gatewayControlAlert', 'error', 'Failed to resume gateways');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Resume All Gateways';
    }
  });

  function showAlert(containerId, type, message) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => { container.innerHTML = ''; }, 5000);
  }

  loadAdminData();
  setInterval(loadAdminData, 30000);
})();
