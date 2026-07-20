document.getElementById("forgotForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById("alertBox");
  alertBox.hidden = true;

  const email = document.getElementById("email").value.trim();
  const btn = e.target.querySelector("button[type=submit]");
  const btnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    await window.XD_SMS.firebaseForgotPassword(email);
    alertBox.hidden = false;
    alertBox.className = "alert alert-success";
    alertBox.textContent = "Password reset email sent. Check your inbox (and spam folder).";
    document.getElementById("email").value = "";
  } catch (err) {
    alertBox.hidden = false;
    alertBox.className = "alert alert-error";
    const msgs = {
      "auth/user-not-found": "No account found with this email address.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/too-many-requests": "Too many requests. Please try again later."
    };
    alertBox.textContent = msgs[err.code] || err.message || "Failed to send reset email";
  } finally {
    btn.disabled = false;
    btn.textContent = btnText;
  }
});


