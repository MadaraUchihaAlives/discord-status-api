if (!window.XD_SMS.requireAuth()) throw new Error('auth_required');
window.XD_SMS.initSidebar("webhooks");

const createModal = document.getElementById("createWebhookModal");
const secretModal = document.getElementById("showSecretModal");

document.getElementById("createWebhookBtn").addEventListener("click", () => createModal.classList.add("open"));
document.getElementById("closeWebhookModal").addEventListener("click", () => createModal.classList.remove("open"));
document.getElementById("closeSecretModal").addEventListener("click", () => {
  secretModal.classList.remove("open");
  loadWebhooks();
});

document.getElementById("copySecretBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.getElementById("webhookSecretValue").value);
});

document.getElementById("createWebhookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("webhookUrl").value.trim();
  const { response, data } = await window.XD_SMS.api("/api/webhook/create", {
    method: "POST",
    body: JSON.stringify({ url })
  });
  if (!response.ok) {
    alert(data?.error || "Failed to create webhook");
    return;
  }
  createModal.classList.remove("open");
  document.getElementById("webhookSecretValue").value = data.secret;
  secretModal.classList.add("open");
  document.getElementById("webhookUrl").value = "";
});

async function loadWebhooks() {
  const { data } = await window.XD_SMS.api("/api/webhooks");
  const tbody = document.getElementById("webhooksTableBody");
  const webhooks = data?.webhooks || [];

  if (!webhooks.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No webhooks configured</div></td></tr>`;
    return;
  }

  tbody.innerHTML = webhooks.map((w) => `
    <tr>
      <td>${w.url}</td>
      <td>${w.retry_count || 3}</td>
      <td>${window.XD_SMS.statusBadge(w.status === "active" ? "online" : "offline")}</td>
      <td>${window.XD_SMS.formatDate(w.created_at)}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="toggleWebhook('${w.id}')">Toggle</button>
        <button class="btn btn-secondary btn-sm" onclick="rotateSecret('${w.id}')">Rotate secret</button>
        <button class="btn btn-danger btn-sm" onclick="deleteWebhook('${w.id}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

window.toggleWebhook = async (id) => {
  await window.XD_SMS.api(`/api/webhook/${id}/toggle`, { method: "POST" });
  loadWebhooks();
};

window.rotateSecret = async (id) => {
  const { data } = await window.XD_SMS.api(`/api/webhook/${id}/rotate-secret`, { method: "POST" });
  if (data?.secret) {
    document.getElementById("webhookSecretValue").value = data.secret;
    secretModal.classList.add("open");
  }
};

window.deleteWebhook = async (id) => {
  if (!confirm("Delete this webhook?")) return;
  await window.XD_SMS.api(`/api/webhook/${id}/delete`, { method: "POST" });
  loadWebhooks();
};

loadWebhooks();


