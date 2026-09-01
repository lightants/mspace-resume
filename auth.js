(function (global) {
'use strict';
var SESSION_KEY = "mspace-current-user";
var LOCAL_ACCOUNTS_KEY = "mspace-local-accounts-v1";
function getCfg() {
  return global.MSPACE_FIREBASE || {};
}
function firebaseConfigured() {
  var cfg = getCfg();
  return !!(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}
function getSession() {
  try {
    var raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function setSession(user) {
  var json = JSON.stringify(user);
  try { sessionStorage.setItem(SESSION_KEY, json); localStorage.setItem(SESSION_KEY, json); } catch (e) {}
  global.MSpaceAuth.currentUser = user;
  document.dispatchEvent(new CustomEvent("mspace-auth-change", { detail: user }));
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) {}
  global.MSpaceAuth.currentUser = null;
  document.dispatchEvent(new CustomEvent("mspace-auth-change", { detail: null }));
}
function toUser(email, name, provider, uid) {
  return { email: email || "", name: name || "", provider: provider || "email", uid: uid || "" };
}
function sha256Hex(str) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (buf) {
    var bytes = new Uint8Array(buf); var hex = "";
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return hex;
  });
}
function loadLocalAccounts() {
  try { return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) || "[]"); } catch (e) { return []; }
}
function saveLocalAccounts(list) { localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(list)); }
function localSignUp(email, password, name) {
  email = (email || "").trim().toLowerCase(); name = (name || "").trim();
  if (!email || !password) return Promise.reject(new Error("Email and password are required."));
  if (password.length < 6) return Promise.reject(new Error("Password must be at least 6 characters."));
  var accounts = loadLocalAccounts();
  if (accounts.some(function (a) { return a.email === email; })) return Promise.reject(new Error("An account with this email already exists on this device."));
  return sha256Hex(password + email).then(function (hash) {
    var uid = "local_" + hash.slice(0, 16);
    accounts.push({ email: email, name: name, hash: hash, uid: uid });
    saveLocalAccounts(accounts);
    var user = toUser(email, name, "local", uid); setSession(user); return user;
  });
}
function localSignIn(email, password) {
  email = (email || "").trim().toLowerCase();
  if (!email || !password) return Promise.reject(new Error("Email and password are required."));
  var rec = loadLocalAccounts().filter(function (a) { return a.email === email; })[0];
  if (!rec) return Promise.reject(new Error("No on-device account for this email."));
  return sha256Hex(password + email).then(function (hash) {
    if (hash !== rec.hash) return Promise.reject(new Error("Wrong password."));
    var user = toUser(email, rec.name || "", "local", rec.uid); setSession(user); return user;
  });
}
var fbAuth = null;
function mapFbUser(u) {
  if (!u) return null;
  var provider = "email";
  if (u.providerData && u.providerData[0] && u.providerData[0].providerId === "google.com") provider = "google";
  return toUser(u.email, u.displayName || "", provider, u.uid);
}
function initFirebase() {
  if (!firebaseConfigured() || !global.firebase) return false;
  try {
    var cfg = getCfg();
    if (!global.firebase.apps.length) {
      global.firebase.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId });
    }
    fbAuth = global.firebase.auth();
    fbAuth.onAuthStateChanged(function (u) {
      if (u) { setSession(mapFbUser(u)); return; }
      var existing = getSession();
      if (existing && existing.provider === "local") {
        global.MSpaceAuth.currentUser = existing;
        document.dispatchEvent(new CustomEvent("mspace-auth-change", { detail: existing }));
      } else { clearSession(); }
    });
    return true;
  } catch (e) { return false; }
}
function signInEmail(email, password) {
  if (fbAuth) return fbAuth.signInWithEmailAndPassword(email, password).then(function (cred) { var user = mapFbUser(cred.user); setSession(user); return user; });
  return localSignIn(email, password);
}
function signUpEmail(email, password, name) {
  if (fbAuth) {
    return fbAuth.createUserWithEmailAndPassword(email, password).then(function (cred) {
      var p = name ? cred.user.updateProfile({ displayName: name }) : Promise.resolve();
      return p.then(function () { var user = mapFbUser(cred.user); user.name = name || user.name; setSession(user); return user; });
    });
  }
  return localSignUp(email, password, name);
}
function signInGoogle() {
  if (!fbAuth) return Promise.reject(new Error("Connect Google first"));
  var provider = new global.firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return fbAuth.signInWithPopup(provider).then(function (cred) { var user = mapFbUser(cred.user); setSession(user); return user; }).catch(function (err) {
    var code = err && err.code;
    if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/operation-not-supported-in-this-environment") {
      return fbAuth.signInWithRedirect(provider);
    }
    throw err;
  });
}
function logout() {
  var p = fbAuth ? fbAuth.signOut() : Promise.resolve();
  return p.then(function () { clearSession(); }).catch(function () { clearSession(); });
}
function friendlyError(err) {
  var code = err && err.code; var msg = (err && err.message) || "Something went wrong.";
  var map = {
    "auth/invalid-email": "Please enter a valid email.",
    "auth/user-not-found": "No account for this email.",
    "auth/wrong-password": "Wrong password.",
    "auth/invalid-credential": "Wrong email or password.",
    "auth/email-already-in-use": "This email already has an account. Sign in instead.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/popup-blocked": "Popup blocked. Trying redirect.",
    "auth/network-request-failed": "Network error. Try again."
  };
  return map[code] || msg;
}
function bindUi() {
  var googleBtn = document.getElementById("auth-google");
  var emailForm = document.getElementById("auth-email-form");
  var modeToggle = document.getElementById("auth-mode-toggle");
  var nameField = document.getElementById("auth-name-wrap");
  var submitBtn = document.getElementById("auth-submit");
  var status = document.getElementById("auth-status");
  var banner = document.getElementById("auth-local-banner");
  var mode = "signin";
  function setStatus(text, kind) {
    if (!status) return; status.hidden = !text; status.textContent = text || "";
    status.className = "status" + (kind ? " " + kind : "");
  }
  if (!firebaseConfigured()) {
    if (banner) banner.hidden = false;
    if (googleBtn) { googleBtn.disabled = false; googleBtn.textContent = "Continue with Google"; }
  } else {
    if (banner) banner.hidden = true;
    if (googleBtn) { googleBtn.disabled = false; googleBtn.textContent = "Continue with Google"; }
  }
  if (modeToggle) modeToggle.addEventListener("click", function () {
    mode = mode === "signin" ? "signup" : "signin";
    if (nameField) nameField.hidden = mode !== "signup";
    if (submitBtn) submitBtn.textContent = mode === "signup" ? "Create account" : "Sign in";
    modeToggle.textContent = mode === "signup" ? "Have an account? Sign in" : "New here? Create account";
    var title = document.getElementById("auth-title");
    if (title) title.textContent = mode === "signup" ? "Create account" : "Sign in";
  });
  if (googleBtn) googleBtn.addEventListener("click", function () {
    if (!firebaseConfigured()) { setStatus("Google sign-in is not configured yet.", "warn"); return; }
    if (!global.firebase) { setStatus("Google library still loading. Try again.", "warn"); return; }
    if (!fbAuth) initFirebase();
    setStatus("Opening Google...");
    signInGoogle().catch(function (err) { setStatus(friendlyError(err), "warn"); });
  });
  if (emailForm) emailForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = (document.getElementById("auth-email") || {}).value;
    var password = (document.getElementById("auth-password") || {}).value;
    var name = (document.getElementById("auth-name") || {}).value;
    setStatus(mode === "signup" ? "Creating account..." : "Signing in...");
    var p = mode === "signup" ? signUpEmail(email, password, name) : signInEmail(email, password);
    p.catch(function (err) { setStatus(friendlyError(err), "warn"); });
  });
  var logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", function () { logout(); });
}
global.MSpaceAuth = {
  currentUser: getSession(), firebaseConfigured: firebaseConfigured, getSession: getSession,
  logout: logout, signInEmail: signInEmail, signUpEmail: signUpEmail, signInGoogle: signInGoogle, friendlyError: friendlyError
};
function boot() {
  var usedFb = initFirebase();
  if (!usedFb) {
    var existing = getSession(); global.MSpaceAuth.currentUser = existing;
    document.dispatchEvent(new CustomEvent("mspace-auth-change", { detail: existing }));
  } else if (fbAuth && fbAuth.getRedirectResult) { fbAuth.getRedirectResult().catch(function () {}); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindUi); else bindUi();
}
boot();
})(window);
