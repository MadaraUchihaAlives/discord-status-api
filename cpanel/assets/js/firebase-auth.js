(function () {
  window.XD_SMS = window.XD_SMS || {};

  window.XD_SMS.register = async function (name, email, password) {
    const res = await window.XD_SMS.api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
      skipAuthRedirect: true
    });
    return res;
  };

  window.XD_SMS.login = async function (email, password) {
    const res = await window.XD_SMS.api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuthRedirect: true
    });
    return res;
  };

  window.XD_SMS.forgotPassword = async function (email) {
    const res = await window.XD_SMS.api("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
      skipAuthRedirect: true
    });
    return res;
  };

  window.XD_SMS.resetPassword = async function (token, password) {
    const res = await window.XD_SMS.api("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
      skipAuthRedirect: true
    });
    return res;
  };

  window.XD_SMS.logout = async function () {
    try {
      await window.XD_SMS.api("/api/auth/logout", { method: "POST" });
    } catch (_) {}
    window.XD_SMS.clearSession();
    window.location.href = "login.html";
  };
})();
