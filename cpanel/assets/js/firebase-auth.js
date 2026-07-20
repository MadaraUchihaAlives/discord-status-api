(function () {
  window.XD_SMS = window.XD_SMS || {};

  let _app = null;
  let _auth = null;

  function initFirebase() {
    if (_auth) return _auth;
    if (!firebase || !firebase.apps) return null;
    if (!firebase.apps.length) {
      _app = firebase.initializeApp(window.XD_SMS.FIREBASE_CONFIG);
    } else {
      _app = firebase.apps[0];
    }
    _auth = firebase.auth();
    return _auth;
  }

  window.XD_SMS.firebaseAuth = function () {
    return initFirebase();
  };

  window.XD_SMS.getIdToken = async function () {
    const auth = initFirebase();
    if (!auth || !auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  };

  window.XD_SMS.firebaseRegister = async function (name, email, password) {
    const auth = initFirebase();
    if (!auth) throw new Error("Firebase not initialized");

    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });

    const idToken = await cred.user.getIdToken();

    const res = await window.XD_SMS.api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, idToken }),
      skipAuthRedirect: true
    });
    return res;
  };

  window.XD_SMS.firebaseLogin = async function (email, password) {
    const auth = initFirebase();
    if (!auth) throw new Error("Firebase not initialized");

    const cred = await auth.signInWithEmailAndPassword(email, password);
    const idToken = await cred.user.getIdToken();

    const res = await window.XD_SMS.api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ idToken }),
      skipAuthRedirect: true
    });
    return res;
  };

  window.XD_SMS.firebaseLogout = async function () {
    const auth = initFirebase();
    try {
      await window.XD_SMS.api("/api/auth/logout", { method: "POST" });
    } catch (_) {}
    if (auth) await auth.signOut();
    window.XD_SMS.clearSession();
    window.location.href = "login.html";
  };

  window.XD_SMS.firebaseForgotPassword = async function (email) {
    const auth = initFirebase();
    if (!auth) throw new Error("Firebase not initialized");
    await auth.sendPasswordResetEmail(email);
  };

  window.XD_SMS.firebaseCurrentUser = function () {
    const auth = initFirebase();
    return auth ? auth.currentUser : null;
  };

  window.XD_SMS.firebaseOnAuth = function (callback) {
    const auth = initFirebase();
    if (!auth) { callback(null); return; }
    return auth.onAuthStateChanged(callback);
  };
})();
