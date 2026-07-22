window.XD_SMS = window.XD_SMS || {};

window.XD_SMS.getToken = function () {
  return localStorage.getItem("xd_token");
};

window.XD_SMS.getUser = function () {
  try {
    return JSON.parse(localStorage.getItem("xd_user") || "null");
  } catch {
    return null;
  }
};

window.XD_SMS.setSession = function (token, user) {
  localStorage.setItem("xd_token", token);
  localStorage.setItem("xd_user", JSON.stringify(user));
};

window.XD_SMS.clearSession = function () {
  localStorage.removeItem("xd_token");
  localStorage.removeItem("xd_user");
};

window.XD_SMS.requireAuth = function () {
  if (!window.XD_SMS.getToken()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
};

window.XD_SMS.api = async function (path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const token = window.XD_SMS.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${window.XD_SMS.API_BASE}${path}`, {
    ...options,
    headers
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 401 && !options.skipAuthRedirect) {
    window.XD_SMS.clearSession();
    window.location.href = "login.html";
  }

  return { response, data };
};

window.XD_SMS.formatDate = function (value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

window.XD_SMS.statusBadge = function (status) {
  const map = {
    online: "badge-success",
    completed: "badge-success",
    sent: "badge-success",
    offline: "badge-danger",
    failed: "badge-danger",
    pending: "badge-warning",
    sending: "badge-warning",
    paused: "badge-neutral",
    cancelled: "badge-neutral"
  };
  const cls = map[status] || "badge-neutral";
  return `<span class="badge ${cls}">${status || "unknown"}</span>`;
};

window.XD_SMS.initSidebar = function (activePage) {
  const user = window.XD_SMS.getUser();
  const nameEl = document.querySelector("[data-user-name]");
  const emailEl = document.querySelector("[data-user-email]");
  if (nameEl) nameEl.textContent = user?.name || "User";
  if (emailEl) emailEl.textContent = user?.email || "";

  document.querySelectorAll(".sidebar-nav a").forEach((link) => {
    if (link.dataset.page === activePage) link.classList.add("active");
  });

  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    const user = window.XD_SMS.getUser();
    if (user?.role === "admin") {
      try { await window.XD_SMS.api("/api/auth/logout", { method: "POST" }); } catch (_) {}
      window.XD_SMS.clearSession();
      window.location.href = "secure-login.html";
      return;
    }
    if (window.XD_SMS.logout) {
      await window.XD_SMS.logout();
    } else {
      await window.XD_SMS.api("/api/auth/logout", { method: "POST" });
      window.XD_SMS.clearSession();
      window.location.href = "login.html";
    }
  });

  document.querySelectorAll(".sidebar-footer").forEach((footer) => {
    if (!footer.querySelector(".sidebar-credit")) {
      const credit = document.createElement("div");
      credit.className = "sidebar-credit";
      credit.textContent = window.XD_SMS.DEVELOPER || "2026 TeamXD by NabeelXD";
      footer.appendChild(credit);
    }
  });
};

window.XD_SMS.connectSocket = function () {
  if (typeof io === "undefined") return null;
  const token = window.XD_SMS.getToken();
  const user = window.XD_SMS.getUser();
  if (!token || !user) return null;

  const socket = io(window.XD_SMS.API_BASE, {
    transports: ["websocket", "polling"]
  });

  socket.on("connect", () => {
    socket.emit("join_dashboard", { user_id: user.id });
  });

  return socket;
};


