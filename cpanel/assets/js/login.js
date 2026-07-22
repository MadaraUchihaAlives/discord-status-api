document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById("alertBox");
  alertBox.hidden = true;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const btn = e.target.querySelector("button[type=submit]");
  const btnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Signing in…";

  try {
    const { response, data } = await window.XD_SMS.login(email, password);

    if (response.ok) {
      window.XD_SMS.setSession(data.token, data.user);
      window.location.href = "dashboard.html";
      return;
    }

    alertBox.hidden = false;
    alertBox.className = "alert alert-error";
    alertBox.textContent = data?.error || "Login failed. Please check your credentials.";
  } catch (err) {
    alertBox.hidden = false;
    alertBox.className = "alert alert-error";
    alertBox.textContent = err.message || "Login failed";
  } finally {
    btn.disabled = false;
    btn.textContent = btnText;
  }
});
