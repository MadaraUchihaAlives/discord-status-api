window.XD_SMS = window.XD_SMS || {};

window.XD_SMS.API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://api.sms.luffyxd.store";

window.XD_SMS.BRAND = "XD SMS Gateway";
window.XD_SMS.DEVELOPER = "2026 TeamXD by NabeelXD";


