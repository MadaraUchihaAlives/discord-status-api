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
    const { response, data } = await window.XD_SMS.forgotPassword(email);

    if (response.ok) {
      alertBox.hidden = false;
      alertBox.className = "alert alert-success";
      alertBox.textContent = data?.message || "If an account exists, a reset link has been sent.";
      document.getElementById("email").value = "";
      return;
    }

    alertBox.hidden = false;
    alertBox.className = "alert alert-error";
    alertBox.textContent = data?.error || "Failed to send reset email";
  } catch (err) {
    alertBox.hidden = false;
    alertBox.className = "alert alert-error";
    alertBox.textContent = err.message || "Failed to send reset email";
  } finally {
    btn.disabled = false;
    btn.textContent = btnText;
  }
});
