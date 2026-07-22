if (!window.XD_SMS.requireAuth()) throw new Error('auth_required');
window.XD_SMS.initSidebar("apikeys");

const createModal = document.getElementById("createModal");
const showKeyModal = document.getElementById("showKeyModal");

document.getElementById("createKeyBtn").addEventListener("click", () => {
  createModal.classList.add("open");
});

document.getElementById("closeCreateModal").addEventListener("click", () => {
  createModal.classList.remove("open");
});

document.getElementById("closeShowKeyModal").addEventListener("click", () => {
  showKeyModal.classList.remove("open");
  loadKeys();
});

document.getElementById("copyKeyBtn").addEventListener("click", async () => {
  const input = document.getElementById("newKeyValue");
  await navigator.clipboard.writeText(input.value);
});

document.getElementById("createKeyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("keyName").value.trim();
  const { response, data } = await window.XD_SMS.api("/api/apikey/create", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    alert(data?.error || "Failed to create key");
    return;
  }
  createModal.classList.remove("open");
  document.getElementById("newKeyValue").value = data.key;
  showKeyModal.classList.add("open");
  document.getElementById("keyName").value = "";
});

async function loadKeys() {
  const { data } = await window.XD_SMS.api("/api/apikeys");
  const tbody = document.getElementById("keysTableBody");
  const keys = data?.api_keys || [];

  if (!keys.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No API keys yet</div></td></tr>`;
    return;
  }

  tbody.innerHTML = keys.map((k) => `
    <tr>
      <td>${k.name}</td>
      <td><code>${k.masked_key}</code></td>
      <td>${k.usage_count || 0}</td>
      <td>${window.XD_SMS.formatDate(k.last_used)}</td>
      <td>${window.XD_SMS.statusBadge(k.status === "active" ? "online" : "offline")}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="toggleKey('${k.id}')">Toggle</button>
        <button class="btn btn-secondary btn-sm" onclick="regenerateKey('${k.id}')">Regenerate</button>
        <button class="btn btn-danger btn-sm" onclick="deleteKey('${k.id}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

window.toggleKey = async (id) => {
  await window.XD_SMS.api(`/api/apikey/${id}/toggle`, { method: "POST" });
  loadKeys();
};

window.regenerateKey = async (id) => {
  if (!confirm("Regenerate this key? Old key will stop working.")) return;
  const { data } = await window.XD_SMS.api(`/api/apikey/${id}/regenerate`, { method: "POST" });
  if (data?.key) {
    document.getElementById("newKeyValue").value = data.key;
    showKeyModal.classList.add("open");
  }
};

window.deleteKey = async (id) => {
  if (!confirm("Delete this API key?")) return;
  await window.XD_SMS.api(`/api/apikey/${id}/delete`, { method: "POST" });
  loadKeys();
};

loadKeys();


