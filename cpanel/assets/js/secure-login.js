document.getElementById("secureForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById("alertBox");
  alertBox.hidden = true;

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const btn = e.target.querySelector("button[type=submit]");
  const btnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Verifying…";

  try {
    const { response, data } = await window.XD_SMS.api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      skipAuthRedirect: true
    });

    if (response.ok && data?.token) {
      window.XD_SMS.setSession(data.token, data.user);
      window.location.href = "admin.html";
      return;
    }

    alertBox.hidden = false;
    alertBox.className = "alert alert-error";
    alertBox.textContent = data?.error || "Invalid credentials";
  } catch (err) {
    alertBox.hidden = false;
    alertBox.className = "alert alert-error";
    alertBox.textContent = "Login failed. Check your connection.";
  } finally {
    btn.disabled = false;
    btn.textContent = btnText;
  }
});
