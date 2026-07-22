window.XD_SMS = window.XD_SMS || {};

window.XD_SMS.API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://api.sms.luffyxd.store";

window.XD_SMS.BRAND = "XD SMS Gateway";
window.XD_SMS.DEVELOPER = "2026 TeamXD by NabeelXD";

window.XD_SMS.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDEFx7Ax1TTL47F_Z9b_bOAiq8MZ208lc8",
  authDomain: "api-firebase-nabeelxd.firebaseapp.com",
  databaseURL: "https://api-firebase-nabeelxd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "api-firebase-nabeelxd",
  storageBucket: "api-firebase-nabeelxd.firebasestorage.app",
  messagingSenderId: "1017623492723",
  appId: "1:1017623492723:web:243bf32dd5f0b728225206",
  measurementId: "G-6MR5ZN8MJE"
};


