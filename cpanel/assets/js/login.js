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
    const { response, data } = await window.XD_SMS.firebaseLogin(email, password);

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

    const msgs = {
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password. Try again.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/too-many-requests": "Too many failed attempts. Please wait a moment.",
      "auth/invalid-credential": "Invalid email or password."
    };
    alertBox.textContent = msgs[err.code] || err.message || "Login failed";
  } finally {
    btn.disabled = false;
    btn.textContent = btnText;
  }
});


