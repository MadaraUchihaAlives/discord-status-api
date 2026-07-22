document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById("alertBox");
  alertBox.hidden = true;

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const btn = e.target.querySelector("button[type=submit]");
  const btnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Creating account…";

  try {
    const { response, data } = await window.XD_SMS.firebaseRegister(name, email, password);

    if (response.ok) {
      window.XD_SMS.setSession(data.token, data.user);
      window.location.href = "dashboard.html";
      return;
    }

    alertBox.hidden = false;
    alertBox.className = "alert alert-error";
    alertBox.textContent = data?.error || "Registration failed.";
  } catch (err) {
    alertBox.hidden = false;
    alertBox.className = "alert alert-error";
    const msgs = {
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/operation-not-allowed": "Email/password sign-up is not enabled."
    };
    alertBox.textContent = msgs[err.code] || err.message || "Registration failed";
  } finally {
    btn.disabled = false;
    btn.textContent = btnText;
  }
});


