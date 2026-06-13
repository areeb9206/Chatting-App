const firebaseConfig = {
  apiKey: "AIzaSyCVHKaUghCLxoKxLFruV8ZZcH-ZPP60UHc",
  authDomain: "the-aa-vault.firebaseapp.com",
  databaseURL: "https://the-aa-vault-default-rtdb.firebaseio.com",
  projectId: "the-aa-vault",
  storageBucket: "the-aa-vault.firebasestorage.app",
  messagingSenderId: "49808888573",
  appId: "1:49808888573:web:a58dae91bc216b7ee82494",
  measurementId: "G-Y1294J0K32",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
let alertsEnabled = localStorage.getItem("aaVaultMessageAlerts") === "on";
let originalTitle = document.title;
const lastAlertTimestamps = {};

let currentUser = null;
let currentChatUser = null;
let currentChatUserName = "";
let currentChatId = null;
let replyMessage = null;
let typingTimer = null;
let toastTimer = null;
let editingMessageId = null;
let editingChatId = null;
let suppressNextHistoryPush = false;

let currentMessagesRef = null;
let currentStatusRef = null;
let currentTypingRef = null;
let requestsRef = null;
let sentRequestsRef = null;
let contactsRef = null;
let myProfileRef = null;
let connectedRef = null;
const activeContactListeners = [];

const $ = (id) => document.getElementById(id);

function showLoader() {
  const loader = $("pageLoader");
  if (loader) loader.classList.remove("hidden");
}

function hideLoader() {
  const loader = $("pageLoader");
  if (loader) loader.classList.add("hidden");
}

function showToast(message, type = "success") {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 2800);
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem("aaVaultDeviceId");
  if (!id) {
    id = "web_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
    localStorage.setItem("aaVaultDeviceId", id);
  }
  return id;
}

function applyTheme(theme) {
  const safeTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", safeTheme);
  localStorage.setItem("aaVaultTheme", safeTheme);
  const icon = safeTheme === "light" ? "☀" : "☾";
  ["authThemeIcon", "chatThemeIcon", "accountThemeIcon"].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = icon;
  });
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", safeTheme === "light" ? "#f3efe7" : "#0b1020");
}

function initTheme() {
  const savedTheme = localStorage.getItem("aaVaultTheme");
  const preferredTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  applyTheme(savedTheme || preferredTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

function updateNotificationStatus(message) {
  const status = $("notificationStatus");
  if (status) status.textContent = message;
  const btn = $("enableNotifyBtn");
  if (btn) btn.textContent = alertsEnabled ? "On" : "Enable";
}

function enableMessageAlerts() {
  alertsEnabled = true;
  localStorage.setItem("aaVaultMessageAlerts", "on");
  updateNotificationStatus("On — in-app alerts, sound, unread badges and title alerts enabled.");
  showToast("Message alerts enabled.", "success");

  // Optional: while the website/app is open in background, browsers may show a local notification.
  if (("Notification" in window) && Notification.permission === "default") {
    Notification.requestPermission().then(() => updateNotificationStatus(
      alertsEnabled ? "On — in-app alerts enabled." : "Off — alerts disabled."
    ));
  }
}
window.enableMessageAlerts = enableMessageAlerts;
window.enablePushNotifications = enableMessageAlerts;

function autoRegisterPushIfAllowed() {
  updateNotificationStatus(
    alertsEnabled
      ? "On — in-app alerts, sound, unread badges and title alerts enabled."
      : "Off — press Enable for in-app message alerts."
  );
}

function playMessageSound() {
  if (!alertsEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch (error) {
    console.warn("Message sound unavailable", error);
  }
}

function flashTitle(name) {
  if (!alertsEnabled || !document.hidden) return;
  let flashes = 0;
  const title = "New message • The A&A Vault";
  clearInterval(window.aaVaultTitleTimer);
  window.aaVaultTitleTimer = setInterval(() => {
    document.title = document.title === title ? originalTitle : title;
    flashes += 1;
    if (flashes > 8) {
      clearInterval(window.aaVaultTitleTimer);
      document.title = title;
    }
  }, 900);
}

function showLocalMessageAlert(senderName, text) {
  if (!alertsEnabled) return;
  const body = text ? String(text).slice(0, 90) : "New message";
  showToast(senderName + ": " + body, "info");
  playMessageSound();
  flashTitle(senderName);
  if (("Notification" in window) && Notification.permission === "granted" && document.hidden) {
    try {
      new Notification("The A&A Vault", {
        body: senderName + ": " + body,
        icon: "assets/icon-192.png",
        badge: "assets/icon-192.png",
      });
    } catch (error) {
      console.warn("Local notification unavailable", error);
    }
  }
}




const CREATOR_USERNAME = "areebahmed";
let tutorialMode = "app";
let tutorialStepIndex = 0;
let activeTutorialSteps = [];

const tutorials = {
  auth: [
    {
      target: ".auth-brand",
      title: "Welcome to The A&A Vault",
      text: "Create your account first. The app opens on Sign Up for new users."
    },
    {
      target: "#username",
      title: "Choose a username",
      text: "Pick a simple unique username. Your friends can search this username to add you. Example: areebahmed."
    },
    {
      target: "#photoURL",
      title: "Profile picture tip",
      text: "Paste a direct image link here for your profile picture. You can leave it blank and update it later."
    },
    {
      target: "#email",
      title: "Create your account",
      text: "Enter your email and password, then press Create Vault Account. After signup, you can add contacts and start chatting."
    }
  ],
  app: [
    {
      target: ".profile-info",
      title: "This is your account area",
      text: "Tap your profile to update your display picture, switch theme, enable message alerts, or log out."
    },
    {
      target: "#searchInput",
      title: "Add your first contact",
      text: "New here? Search @areebahmed and send a request to add Areeb."
    },
    {
      target: "#requestsSection",
      title: "Requests and pending invites",
      text: "This section appears only when you receive a friend request or when you have sent one. After acceptance, it hides automatically."
    },
    {
      target: "#userList",
      title: "Contacts stay organized",
      text: "Contacts with the newest messages move to the top, so your latest chats are always easy to find."
    },
    {
      target: "#emptyState",
      title: "Chat options",
      text: "Open any chat and use the three-dot menu beside a message for Reply, Copy, Edit, or Delete."
    }
  ]
};

function clearTutorialHighlight() {
  document.querySelectorAll(".tutorial-highlight").forEach((el) => el.classList.remove("tutorial-highlight"));
}

function positionTutorialCard(target) {
  const card = $("tutorialCard");
  if (!card || !target || isMobileLayout()) return;
  const rect = target.getBoundingClientRect();
  const cardWidth = Math.min(370, window.innerWidth - 28);
  const cardHeight = card.offsetHeight || 230;
  let left = rect.right + 18;
  let top = rect.top + rect.height / 2 - cardHeight / 2;
  if (left + cardWidth > window.innerWidth - 18) left = rect.left - cardWidth - 18;
  if (left < 18) left = Math.max(18, window.innerWidth / 2 - cardWidth / 2);
  top = Math.max(18, Math.min(top, window.innerHeight - cardHeight - 18));
  card.style.left = left + "px";
  card.style.top = top + "px";
  card.style.transform = "none";
}

function renderTutorialStep() {
  const overlay = $("tutorialOverlay");
  if (!overlay || !activeTutorialSteps.length) return;
  const step = activeTutorialSteps[tutorialStepIndex];
  $("tutorialTitle").textContent = step.title;
  $("tutorialText").textContent = step.text;
  const nextBtn = document.querySelector(".tutorial-next");
  if (nextBtn) nextBtn.textContent = tutorialStepIndex === activeTutorialSteps.length - 1 ? "Done" : "Next";
  const dots = $("tutorialDots");
  if (dots) {
    dots.innerHTML = activeTutorialSteps.map((_, i) => `<span class="tutorial-dot ${i === tutorialStepIndex ? "active" : ""}"></span>`).join("");
  }
  clearTutorialHighlight();
  const target = step.target ? document.querySelector(step.target) : null;
  if (target) {
    if (target.classList.contains("hidden-section") && step.target === "#requestsSection") {
      // Keep the explanation visible without forcing an empty requests panel to open.
      positionTutorialCard(document.querySelector("#searchInput") || document.querySelector("#userList"));
    } else {
      target.classList.add("tutorial-highlight");
      try { target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); } catch (_) {}
      setTimeout(() => positionTutorialCard(target), 180);
    }
  } else {
    const card = $("tutorialCard");
    if (card && !isMobileLayout()) {
      card.style.left = "50%";
      card.style.top = "50%";
      card.style.transform = "translate(-50%, -50%)";
    }
  }
}

function openTutorial(mode = "app", force = true) {
  tutorialMode = mode === "auth" ? "auth" : "app";
  activeTutorialSteps = tutorials[tutorialMode] || tutorials.app;
  tutorialStepIndex = 0;
  const overlay = $("tutorialOverlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  renderTutorialStep();
  if (force && tutorialMode === "app") localStorage.setItem("aaVaultAppTourSeen", "1");
  if (force && tutorialMode === "auth") localStorage.setItem("aaVaultAuthTourSeen", "1");
}

function nextTutorialStep() {
  if (tutorialStepIndex >= activeTutorialSteps.length - 1) return skipTutorial();
  tutorialStepIndex += 1;
  renderTutorialStep();
}

function skipTutorial() {
  const overlay = $("tutorialOverlay");
  if (overlay) overlay.classList.add("hidden");
  clearTutorialHighlight();
  if (tutorialMode === "app") localStorage.setItem("aaVaultAppTourSeen", "1");
  if (tutorialMode === "auth") localStorage.setItem("aaVaultAuthTourSeen", "1");
}

function maybeShowAuthTutorial() {
  if (localStorage.getItem("aaVaultAuthTourSeen") === "1") return;
  setTimeout(() => openTutorial("auth", true), 650);
}

function maybeShowAppTutorial() {
  if (localStorage.getItem("aaVaultAppTourSeen") === "1") return;
  setTimeout(() => openTutorial("app", true), 850);
}

function escapeHtml(text) {
  if (text === undefined || text === null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "");
}

function getProfilePhoto(photoURL, name) {
  if (photoURL && String(photoURL).trim()) return photoURL.trim();
  return (
    "https://ui-avatars.com/api/?name=" +
    encodeURIComponent(name || "User") +
    "&background=0f766e&color=fff&bold=true"
  );
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastSeen(timestamp) {
  if (!timestamp) return "Offline";
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return "Last seen " + formatTime(timestamp);
  return "Last seen " + date.toLocaleDateString() + " " + formatTime(timestamp);
}

function getChatId(a, b) {
  return a < b ? a + "_" + b : b + "_" + a;
}

function clearNode(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

function detachRef(ref) {
  if (ref) ref.off();
}

function detachContactListeners() {
  activeContactListeners.forEach((ref) => ref.off());
  activeContactListeners.length = 0;
}

function hideAllRightPanels() {
  $("emptyState").style.display = "none";
  $("chatContainer").style.display = "none";
  $("accountPanel").style.display = "none";
}

function showEmptyState() {
  hideAllRightPanels();
  $("emptyState").style.display = "flex";
  if (window.innerWidth <= 900) $("rightPanel").classList.remove("active");
}

function showRightOnMobile() {
  if (window.innerWidth <= 900) $("rightPanel").classList.add("active");
}

function isMobileLayout() {
  return window.innerWidth <= 900;
}

function ensureBaseHistoryState() {
  if (!window.history || !currentUser) return;
  if (!history.state || !history.state.aaVault) {
    history.replaceState({ aaVault: true, panel: "list" }, "", location.href);
  }
}

function pushPanelHistory(panel) {
  if (!isMobileLayout() || !currentUser || suppressNextHistoryPush) return;
  ensureBaseHistoryState();
  if (!history.state || history.state.panel !== panel) {
    history.pushState({ aaVault: true, panel }, "", location.href);
  }
}

function isAccountPanelOpen() {
  const panel = $("accountPanel");
  return panel && panel.style.display !== "none";
}

function showTab(tabId, btn) {
  document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((button) => button.classList.remove("active"));
  $(tabId).classList.add("active");
  btn.classList.add("active");
}

function setBusy(button, isBusy, text) {
  if (!button) return;
  if (isBusy) {
    button.dataset.oldText = button.textContent;
    button.textContent = text || "Please wait...";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.oldText || button.textContent;
    button.disabled = false;
  }
}

auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    document.body.classList.remove("auth-screen");
    document.body.classList.add("app-screen");
    document.documentElement.classList.remove("auth-screen-root");
    document.documentElement.classList.add("app-screen-root");
    $("authSection").style.display = "none";
    $("chatSection").style.display = "flex";
    showEmptyState();
    loadMyProfile();
    loadRequests();
    loadContacts();
    setOnlineStatus();
    autoRegisterPushIfAllowed();
    ensureBaseHistoryState();
    hideLoader();
    maybeShowAppTutorial();
  } else {
    cleanupAppListeners();
    currentUser = null;
    currentChatUser = null;
    currentChatId = null;
    document.body.classList.remove("app-screen");
    document.body.classList.add("auth-screen");
    document.documentElement.classList.remove("app-screen-root");
    document.documentElement.classList.add("auth-screen-root");
    $("chatSection").style.display = "none";
    $("authSection").style.display = "flex";
    const signupBtn = document.querySelector(".tab-btn:nth-child(2)");
    if (signupBtn) showTab("signupTab", signupBtn);
    hideLoader();
    maybeShowAuthTutorial();
  }
});

function cleanupAppListeners() {
  detachRef(currentMessagesRef);
  detachRef(currentStatusRef);
  detachRef(currentTypingRef);
  detachRef(requestsRef);
  detachRef(sentRequestsRef);
  detachRef(contactsRef);
  detachRef(myProfileRef);
  detachRef(connectedRef);
  detachContactListeners();
  currentMessagesRef = null;
  currentStatusRef = null;
  currentTypingRef = null;
  requestsRef = null;
  sentRequestsRef = null;
  contactsRef = null;
  myProfileRef = null;
  connectedRef = null;
}

function signUp() {
  const username = normalizeUsername($("username").value);
  const name = $("name").value.trim();
  const photoURL = $("photoURL").value.trim();
  const email = $("email").value.trim().toLowerCase();
  const password = $("password").value.trim();

  if (!username || username.length < 3) return showToast("Username at least 3 characters ka hona chahiye.", "error");
  if (!name || !email || !password) return showToast("Please all required fields fill karo.", "error");
  if (password.length < 6) return showToast("Password kam se kam 6 characters ka hona chahiye.", "error");

  showLoader();
  let createdUser = null;

  // Important fix:
  // Locked/auth-only database rules signup se pehle database write allow nahi karti.
  // Isliye pehle Firebase Auth account create hota hai, phir logged-in user ke taur par
  // username reserve + profile save hota hai.
  auth.createUserWithEmailAndPassword(email, password)
    .then((cred) => {
      createdUser = cred.user;
      return db.ref("usernames/" + username).transaction((current) => {
        return current === null ? createdUser.uid : undefined;
      });
    })
    .then((result) => {
      if (!result.committed) {
        throw new Error("Username already taken.");
      }

      const userData = {
        uid: createdUser.uid,
        username,
        name,
        email,
        photoURL: photoURL || "",
        createdAt: Date.now(),
      };

      const updates = {};
      updates["users/" + createdUser.uid] = userData;
      updates["usernames/" + username] = createdUser.uid;
      return db.ref().update(updates);
    })
    .then(() => showToast("Account created successfully.", "success"))
    .catch((error) => {
      hideLoader();
      const message = error && error.message ? error.message : "Signup failed.";

      // Agar Auth account create hogaya lekin username/profile save nahi hua,
      // to clean rollback ki try karte hain taake duplicate/half account na rahe.
      if (createdUser && message !== "Username already taken.") {
        db.ref("usernames/" + username).once("value").then((snap) => {
          if (snap.val() === createdUser.uid) return db.ref("usernames/" + username).remove();
        }).catch(() => {});
      }
      if (createdUser && message === "Username already taken.") {
        createdUser.delete().catch(() => {});
      }

      showToast(message, "error");
    });
}

function login() {
  const identifier = $("loginIdentifier").value.trim().toLowerCase();
  const password = $("loginPassword").value.trim();
  if (!identifier || !password) return showToast("Username/email aur password enter karo.", "error");

  showLoader();
  const loginPromise = identifier.includes("@")
    ? auth.signInWithEmailAndPassword(identifier, password)
    : db
        .ref("users")
        .orderByChild("username")
        .equalTo(normalizeUsername(identifier))
        .once("value")
        .then((snapshot) => {
          if (!snapshot.exists()) throw new Error("Username not found.");
          let email = "";
          snapshot.forEach((child) => (email = child.val().email));
          return auth.signInWithEmailAndPassword(email, password);
        });

  loginPromise.catch((error) => {
    hideLoader();
    showToast(error.message, "error");
  });
}

function forgotPassword() {
  const identifier = $("loginIdentifier").value.trim().toLowerCase();
  if (!identifier) return showToast("Pehle username ya email enter karo.", "error");

  const resolveEmail = identifier.includes("@")
    ? Promise.resolve(identifier)
    : db
        .ref("users")
        .orderByChild("username")
        .equalTo(normalizeUsername(identifier))
        .once("value")
        .then((snapshot) => {
          if (!snapshot.exists()) throw new Error("Username not found.");
          let email = "";
          snapshot.forEach((child) => (email = child.val().email));
          return email;
        });

  resolveEmail
    .then((email) => auth.sendPasswordResetEmail(email))
    .then(() => showToast("Password reset email sent.", "success"))
    .catch((error) => showToast(error.message, "error"));
}

function logout() {
  showLoader();
  if (currentUser) {
    db.ref("status/" + currentUser.uid).update({ state: "offline", lastSeen: Date.now() });
  }
  auth.signOut().catch((error) => {
    hideLoader();
    showToast(error.message, "error");
  });
}

function loadMyProfile() {
  if (!currentUser) return;
  detachRef(myProfileRef);
  myProfileRef = db.ref("users/" + currentUser.uid);
  myProfileRef.on("value", (snapshot) => {
    const user = snapshot.val();
    if (!user) return;
    const photo = getProfilePhoto(user.photoURL, user.name);
    $("myPhoto").src = photo;
    $("myName").textContent = user.name || "My Profile";
    $("myUsername").textContent = "@" + (user.username || "user");
    $("accountPhoto").src = photo;
    $("accountName").textContent = user.name || "User";
    $("accountUsername").textContent = "@" + (user.username || "");
    $("accountEmail").textContent = user.email || currentUser.email || "";
    $("newPhotoURL").value = user.photoURL || "";
  });
}

function updateProfilePhoto() {
  const newPhotoURL = $("newPhotoURL").value.trim();
  db.ref("users/" + currentUser.uid)
    .update({ photoURL: newPhotoURL, updatedAt: Date.now() })
    .then(() => showToast("Profile picture updated.", "success"))
    .catch((error) => showToast(error.message, "error"));
}

function sendPasswordReset() {
  const email = $("accountEmail").textContent.trim();
  if (!email) return showToast("Email not found.", "error");
  auth
    .sendPasswordResetEmail(email)
    .then(() => showToast("Password reset email sent.", "success"))
    .catch((error) => showToast(error.message, "error"));
}

function openAccountPanel() {
  hideAllRightPanels();
  $("accountPanel").style.display = "flex";
  showRightOnMobile();
  pushPanelHistory("account");
}

function closeAccountPanel() {
  if (currentChatUser) {
    hideAllRightPanels();
    $("chatContainer").style.display = "flex";
    showRightOnMobile();
  } else {
    showEmptyState();
  }
}

function searchUser() {
  const keyword = $("searchInput").value.trim().toLowerCase().replace(/^@/, "");
  const resultDiv = $("searchResult");
  clearNode(resultDiv);
  if (!keyword) return;
  resultDiv.innerHTML = '<div class="empty-small">Searching...</div>';

  db.ref("users")
    .once("value")
    .then((snapshot) => {
      clearNode(resultDiv);
      const matches = [];
      snapshot.forEach((child) => {
        const uid = child.key;
        const user = child.val();
        if (!user || uid === currentUser.uid) return;
        const username = (user.username || "").toLowerCase();
        const name = (user.name || "").toLowerCase();
        if (username.includes(keyword) || name.includes(keyword)) {
          matches.push({ uid, user });
        }
      });

      if (!matches.length) {
        resultDiv.innerHTML = '<div class="empty-small">No user found</div>';
        return;
      }
      matches.slice(0, 10).forEach(({ uid, user }) => renderSearchItem(uid, user));
    })
    .catch((error) => {
      resultDiv.innerHTML = '<div class="empty-small">Search failed</div>';
      showToast(error.message, "error");
    });
}

function renderSearchItem(uid, user) {
  const div = document.createElement("div");
  div.className = "search-item";
  div.innerHTML = `
    <div class="item-head">
      <img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" class="contact-pic" alt="">
      <div><strong>${escapeHtml(user.name)}</strong><small>@${escapeHtml(user.username || "")}</small></div>
    </div>
    <div class="item-actions"><button class="disabled-btn" disabled>Checking...</button></div>
  `;
  $("searchResult").appendChild(div);
  const actions = div.querySelector(".item-actions");
  Promise.all([
    db.ref("contacts/" + currentUser.uid + "/" + uid).once("value"),
    db.ref("requests/" + uid + "/" + currentUser.uid).once("value"),
    db.ref("requests/" + currentUser.uid + "/" + uid).once("value"),
  ]).then(([contactSnap, sentSnap, receivedSnap]) => {
    if (contactSnap.exists()) {
      actions.innerHTML = '<button class="disabled-btn" disabled>Already Added</button>';
    } else if (sentSnap.exists()) {
      actions.innerHTML = '<button class="disabled-btn" disabled>Request Sent</button>';
    } else if (receivedSnap.exists()) {
      actions.innerHTML = `<button class="accept-btn" onclick="acceptRequest('${uid}')">Accept Request</button>`;
    } else {
      actions.innerHTML = `<button class="add-btn" onclick="sendRequest('${uid}')">Add Contact</button>`;
    }
  });
}

function sendRequest(toUid) {
  if (!currentUser || toUid === currentUser.uid) return;
  Promise.all([
    db.ref("users/" + currentUser.uid).once("value"),
    db.ref("contacts/" + currentUser.uid + "/" + toUid).once("value"),
  ])
    .then(([mySnap, contactSnap]) => {
      if (contactSnap.exists()) throw new Error("This user is already in your contacts.");

      // Firebase Realtime Database undefined values accept nahi karta.
      // Purane accounts me username/name missing ho sakta hai, isliye safe fallbacks zaroori hain.
      const myData = mySnap.val() || {};
      const safeName = myData.name || currentUser.displayName || (currentUser.email ? currentUser.email.split("@")[0] : "User");
      const safeUsername = myData.username || (currentUser.email ? currentUser.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") : "user");

      const timestamp = Date.now();
      const requestData = {
        fromUid: currentUser.uid,
        fromName: safeName,
        fromUsername: safeUsername,
        fromPhotoURL: myData.photoURL || "",
        toUid,
        timestamp,
        status: "pending",
      };
      const updates = {};
      updates["requests/" + toUid + "/" + currentUser.uid] = requestData;
      updates["sentRequests/" + currentUser.uid + "/" + toUid] = {
        toUid,
        timestamp,
        status: "pending",
      };
      return db.ref().update(updates);
    })
    .then(() => {
      showToast("Request sent.", "success");
      searchUser();
    })
    .catch((error) => showToast(error.message, "error"));
}

function loadRequests() {
  const requestList = $("requestList");
  const requestsSection = $("requestsSection") || (requestList ? requestList.closest(".list-section") : null);
  let incomingRequests = {};
  let outgoingRequests = {};

  function renderRequestsPanel() {
    if (!requestList) return;
    clearNode(requestList);
    const incoming = Object.entries(incomingRequests || {}).filter(([, req]) => req);
    const outgoing = Object.entries(outgoingRequests || {}).filter(([, req]) => req);

    if (!incoming.length && !outgoing.length) {
      requestList.className = "list-content";
      if (requestsSection) requestsSection.classList.add("hidden-section");
      return;
    }

    if (requestsSection) requestsSection.classList.remove("hidden-section");
    requestList.className = "list-content";

    incoming
      .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
      .forEach(([fromUid, req]) => {
        const div = document.createElement("div");
        div.className = "request-item";
        div.innerHTML = `
          <div class="item-head">
            <img src="${escapeHtml(getProfilePhoto(req.fromPhotoURL, req.fromName))}" class="contact-pic" alt="">
            <div><strong>${escapeHtml(req.fromName || "User")}</strong><small>@${escapeHtml(req.fromUsername || "")}</small></div>
          </div>
          <div class="item-actions">
            <button class="accept-btn" onclick="acceptRequest('${fromUid}')">Accept</button>
            <button class="reject-btn" onclick="rejectRequest('${fromUid}')">Reject</button>
          </div>`;
        requestList.appendChild(div);
      });

    outgoing
      .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
      .forEach(([toUid, req]) => {
        db.ref("users/" + toUid).once("value").then((userSnap) => {
          if (!$("requestList")) return;
          if (!outgoingRequests[toUid]) return;
          const user = userSnap.val() || {};
          const div = document.createElement("div");
          div.className = "request-item pending-request";
          div.dataset.pendingUid = toUid;
          div.innerHTML = `
            <div class="item-head">
              <img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" class="contact-pic" alt="">
              <div><strong>${escapeHtml(user.name || "User")}</strong><small>@${escapeHtml(user.username || "")}</small></div>
            </div>
            <div class="item-actions"><button class="disabled-btn" disabled>Pending</button></div>`;
          const old = requestList.querySelector(`[data-pending-uid="${toUid}"]`);
          if (old) old.replaceWith(div);
          else requestList.appendChild(div);
        });
      });
  }

  detachRef(requestsRef);
  detachRef(sentRequestsRef);
  requestsRef = db.ref("requests/" + currentUser.uid);
  sentRequestsRef = db.ref("sentRequests/" + currentUser.uid);

  requestsRef.on("value", (snapshot) => {
    incomingRequests = snapshot.val() || {};
    renderRequestsPanel();
  });

  sentRequestsRef.on("value", (snapshot) => {
    outgoingRequests = snapshot.val() || {};
    renderRequestsPanel();
  });
}

function acceptRequest(fromUid) {
  Promise.all([
    db.ref("users/" + currentUser.uid).once("value"),
    db.ref("users/" + fromUid).once("value"),
  ])
    .then(([mySnap, senderSnap]) => {
      const myData = mySnap.val() || {};
      const senderData = senderSnap.val() || {};
      if (!senderSnap.exists()) throw new Error("User not found.");
      const mySafeName = myData.name || currentUser.displayName || (currentUser.email ? currentUser.email.split("@")[0] : "User");
      const senderSafeName = senderData.name || "User";
      const updates = {};
      updates["contacts/" + currentUser.uid + "/" + fromUid] = {
        uid: fromUid,
        name: senderSafeName,
        username: senderData.username || "",
        photoURL: senderData.photoURL || "",
        addedAt: Date.now(),
      };
      updates["contacts/" + fromUid + "/" + currentUser.uid] = {
        uid: currentUser.uid,
        name: mySafeName,
        username: myData.username || "",
        photoURL: myData.photoURL || "",
        addedAt: Date.now(),
      };
      updates["requests/" + currentUser.uid + "/" + fromUid] = null;
      updates["requests/" + fromUid + "/" + currentUser.uid] = null;
      updates["sentRequests/" + fromUid + "/" + currentUser.uid] = null;
      updates["sentRequests/" + currentUser.uid + "/" + fromUid] = null;
      return db.ref().update(updates);
    })
    .then(() => {
      showToast("Contact added.", "success");
      $("searchInput").value = "";
      $("searchResult").innerHTML = "";
    })
    .catch((error) => showToast(error.message, "error"));
}

function rejectRequest(fromUid) {
  const updates = {};
  updates["requests/" + currentUser.uid + "/" + fromUid] = null;
  updates["sentRequests/" + fromUid + "/" + currentUser.uid] = null;
  db.ref()
    .update(updates)
    .then(() => showToast("Request rejected.", "success"))
    .catch((error) => showToast(error.message, "error"));
}

function loadContacts() {
  const userList = $("userList");
  detachRef(contactsRef);
  detachContactListeners();
  contactsRef = db.ref("contacts/" + currentUser.uid);
  contactsRef.on("value", (snapshot) => {
    clearNode(userList);
    detachContactListeners();
    if (!snapshot.exists()) {
      userList.className = "list-content empty-small";
      userList.textContent = "No contacts yet";
      return;
    }
    userList.className = "list-content";
    snapshot.forEach((child) => {
      const contact = child.val();
      if (!contact || !contact.uid) return;
      renderContact(contact.uid, contact);
    });
  });
}


function reorderContacts() {
  const userList = $("userList");
  if (!userList) return;
  const items = Array.from(userList.querySelectorAll(".contact-item"));
  items
    .sort((a, b) => Number(b.dataset.lastActivity || 0) - Number(a.dataset.lastActivity || 0))
    .forEach((item) => userList.appendChild(item));
}

function renderContact(uid, contactMeta = {}) {
  db.ref("users/" + uid).once("value", (userSnap) => {
    const user = userSnap.val();
    if (!user) return;
    const chatId = getChatId(currentUser.uid, uid);
    const div = document.createElement("div");
    div.className = "contact-item";
    div.id = "contact-" + uid;
    div.dataset.lastActivity = "0";
    div.innerHTML = `
      <div class="contact-pic-wrapper">
        <img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" class="contact-pic" alt="">
        <span class="status-dot" id="status-${uid}"></span>
      </div>
      <div class="contact-info">
        <div class="contact-top">
          <strong>${escapeHtml(user.name || "User")}</strong>
          <span class="unread-badge" id="unread-${uid}">0</span>
        </div>
        <div class="contact-bottom">
          <span class="last-message" id="lastMsg-${uid}">No messages yet</span>
          <span class="last-msg-time" id="lastTime-${uid}"></span>
        </div>
      </div>`;
    div.onclick = () => openChat(uid, user.name || "User", user.photoURL || "");
    $("userList").appendChild(div);

    const statusRef = db.ref("status/" + uid);
    activeContactListeners.push(statusRef);
    statusRef.on("value", (snap) => {
      const dot = $("status-" + uid);
      if (!dot) return;
      dot.classList.toggle("online", snap.val() && snap.val().state === "online");
    });

    const lastRef = db.ref("lastMessages/" + chatId);
    activeContactListeners.push(lastRef);
    lastRef.on("value", (snap) => {
      const lastMsgDiv = $("lastMsg-" + uid);
      const lastTimeDiv = $("lastTime-" + uid);
      if (!lastMsgDiv || !lastTimeDiv) return;
      if (!snap.exists()) {
        lastMsgDiv.textContent = "No messages yet";
        lastTimeDiv.textContent = "";
        div.dataset.lastActivity = String(contactMeta.addedAt || 0);
        reorderContacts();
        return;
      }
      const msg = snap.val();
      div.dataset.lastActivity = String(msg.timestamp || contactMeta.addedAt || 0);
      reorderContacts();
      if (msg.senderId !== currentUser.uid) {
        markChatAsDelivered(chatId);
        const isFirstLoad = lastAlertTimestamps[chatId] === undefined;
        const lastSeenAlert = lastAlertTimestamps[chatId] || 0;
        const isOpenChat = currentChatId === chatId;
        if (isFirstLoad) {
          lastAlertTimestamps[chatId] = msg.timestamp || Date.now();
        } else if (msg.timestamp && msg.timestamp > lastSeenAlert && (!isOpenChat || document.hidden)) {
          lastAlertTimestamps[chatId] = msg.timestamp;
          showLocalMessageAlert(msg.senderName || user.name || "New message", msg.deleted ? "This message was deleted" : msg.text || "New message");
        }
      }
      const prefix = msg.senderId === currentUser.uid ? "You: " : "";
      const preview = msg.deleted ? "This message was deleted" : msg.text || "";
      lastMsgDiv.textContent = prefix + preview;
      lastTimeDiv.textContent = formatTime(msg.timestamp);
    });

    const unreadRef = db.ref("unread/" + currentUser.uid + "/" + chatId);
    activeContactListeners.push(unreadRef);
    unreadRef.on("value", (snap) => {
      const badge = $("unread-" + uid);
      if (!badge) return;
      const count = snap.val() || 0;
      badge.textContent = count;
      badge.style.display = count > 0 ? "inline-flex" : "none";
    });
  });
}

function openChat(uid, name, photoURL = "") {
  currentChatUser = uid;
  currentChatUserName = name;
  currentChatId = getChatId(currentUser.uid, uid);
  replyMessage = null;
  editingMessageId = null;
  editingChatId = null;
  cancelReply(false);

  document.querySelectorAll(".contact-item").forEach((item) => item.classList.remove("active"));
  const active = $("contact-" + uid);
  if (active) active.classList.add("active");

  db.ref("unread/" + currentUser.uid + "/" + currentChatId).remove();
  hideAllRightPanels();
  $("chatPhoto").src = getProfilePhoto(photoURL, name);
  $("chatWithName").textContent = name;
  $("chatContainer").style.display = "flex";
  showRightOnMobile();
  pushPanelHistory("chat");
  listenChatStatus(uid);
  listenTypingStatus(uid);
  loadMessages();
  setTimeout(markCurrentChatAsSeen, 300);
}

function goBack(skipHistoryPush = false) {
  suppressNextHistoryPush = !!skipHistoryPush;
  detachRef(currentMessagesRef);
  detachRef(currentStatusRef);
  detachRef(currentTypingRef);
  currentMessagesRef = null;
  currentStatusRef = null;
  currentTypingRef = null;
  currentChatUser = null;
  currentChatUserName = "";
  currentChatId = null;
  replyMessage = null;
  editingMessageId = null;
  editingChatId = null;
  document.querySelectorAll(".contact-item").forEach((item) => item.classList.remove("active"));
  showEmptyState();
  suppressNextHistoryPush = false;
}

function sendMessage() {
  const input = $("messageInput");
  const text = input.value.trim();
  if (!text || !currentChatUser) return;
  const chatId = getChatId(currentUser.uid, currentChatUser);
  db.ref("users/" + currentUser.uid).once("value", (snapshot) => {
    const me = snapshot.val() || { name: "Me" };
    const newMsgRef = db.ref("chats/" + chatId + "/messages").push();
    const timestamp = Date.now();
    const messageData = {
      messageId: newMsgRef.key,
      senderId: currentUser.uid,
      senderName: me.name || "Me",
      text,
      timestamp,
      delivered: false,
      seen: false,
      edited: false,
      deleted: false,
      notify: true,
      receiverId: currentChatUser,
    };
    if (replyMessage) {
      messageData.replyTo = {
        senderName: replyMessage.senderName || "User",
        text: replyMessage.text || "",
      };
    }
    const updates = {};
    updates["chats/" + chatId + "/messages/" + newMsgRef.key] = messageData;
    updates["lastMessages/" + chatId] = {
      messageId: newMsgRef.key,
      senderId: currentUser.uid,
      senderName: me.name || "Me",
      text,
      timestamp,
      deleted: false,
    };
    updates["unread/" + currentChatUser + "/" + chatId] = firebase.database.ServerValue.increment(1);
    db.ref().update(updates).then(() => {
      input.value = "";
      cancelReply(false);
      db.ref("typing/" + chatId + "/" + currentUser.uid).remove();
    });
  });
}

function loadMessages() {
  const messages = $("messages");
  const chatId = currentChatId;
  detachRef(currentMessagesRef);
  currentMessagesRef = db.ref("chats/" + chatId + "/messages");
  currentMessagesRef.on("value", (snapshot) => {
    clearNode(messages);
    if (!snapshot.exists()) {
      const empty = document.createElement("div");
      empty.className = "empty-small";
      empty.textContent = "No messages yet. Say hello 👋";
      messages.appendChild(empty);
    }
    snapshot.forEach((child) => {
      const msg = child.val();
      const messageId = child.key;
      if (msg.deletedFor && msg.deletedFor[currentUser.uid]) return;
      messages.appendChild(renderMessage(chatId, messageId, msg));
    });
    messages.scrollTop = messages.scrollHeight;
    if (currentChatId === chatId && currentChatUser && !document.hidden) markCurrentChatAsSeen();
  });
}

function renderMessage(chatId, messageId, msg) {
  const div = document.createElement("div");
  div.className = "message" + (msg.senderId === currentUser.uid ? " self" : "");
  const isMine = msg.senderId === currentUser.uid;

  let replyHTML = "";
  if (msg.replyTo && !msg.deleted) {
    replyHTML = `<div class="replied-message"><strong>${escapeHtml(msg.replyTo.senderName)}</strong><p>${escapeHtml(msg.replyTo.text)}</p></div>`;
  }

  let bodyHTML = "";
  if (msg.deleted) {
    bodyHTML = '<div class="deleted-text">This message was deleted</div>';
  } else if (editingMessageId === messageId && editingChatId === chatId) {
    bodyHTML = `
      <div class="edit-message-box">
        <input type="text" id="editInput" class="edit-message-input" value="${escapeHtml(msg.text)}">
        <div class="edit-actions">
          <button type="button" onclick="saveEditedMessage()">Save</button>
          <button type="button" class="cancel-edit-btn" onclick="cancelEditMessage()">Cancel</button>
        </div>
      </div>`;
  } else {
    bodyHTML = `<div class="message-text">${escapeHtml(msg.text)}${msg.edited ? '<span class="edited-label">edited</span>' : ""}</div>`;
  }

  let tickSymbol = "✓";
  let tickClass = "";
  if (msg.seen) {
    tickSymbol = "✓✓";
    tickClass = "seen";
  } else if (msg.delivered) {
    tickSymbol = "✓✓";
  }
  const ticksHTML = isMine ? `<span class="ticks ${tickClass}">${tickSymbol}</span>` : "";

  const menuHTML = msg.deleted
    ? ""
    : `<div class="msg-menu-wrap">
        <button class="msg-dots" type="button" onclick="toggleMessageMenu('${messageId}')">⋮</button>
        <div id="msgMenu-${messageId}" class="msg-menu">
          <button type="button" onclick="replyToMessageById('${chatId}', '${messageId}')">Reply</button>
          <button type="button" onclick="copyMessageText('${chatId}', '${messageId}')">Copy</button>
          ${isMine ? `<button type="button" onclick="startEditMessage('${chatId}', '${messageId}')">Edit</button>` : ""}
          <button type="button" onclick="deleteMessageForMe('${chatId}', '${messageId}')">Delete for me</button>
          ${isMine ? `<button type="button" class="delete-menu-btn" onclick="deleteMessageForEveryone('${chatId}', '${messageId}')">Delete for everyone</button>` : ""}
        </div>
      </div>`;

  div.innerHTML = `
    <div class="msg-wrapper">
      <div class="bubble">
        ${replyHTML}
        <div class="sender">${escapeHtml(msg.senderName || "User")}</div>
        ${bodyHTML}
        <div class="message-meta"><span>${formatTime(msg.timestamp)}</span>${ticksHTML}</div>
      </div>
      ${menuHTML}
    </div>`;
  return div;
}

function toggleMessageMenu(messageId) {
  document.querySelectorAll(".msg-menu").forEach((menu) => {
    if (menu.id !== "msgMenu-" + messageId) menu.classList.remove("show");
  });
  const menu = $("msgMenu-" + messageId);
  if (menu) menu.classList.toggle("show");
}

document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("msg-dots") && !e.target.closest(".msg-menu")) {
    document.querySelectorAll(".msg-menu").forEach((menu) => menu.classList.remove("show"));
  }
});

function replyToMessageById(chatId, messageId) {
  db.ref("chats/" + chatId + "/messages/" + messageId).once("value", (snapshot) => {
    const msg = snapshot.val();
    if (!msg || msg.deleted) return;
    replyMessage = { senderName: msg.senderName, text: msg.text };
    $("replyPreview").style.display = "flex";
    $("replyName").textContent = msg.senderName || "User";
    $("replyText").textContent = msg.text || "";
    const menu = $("msgMenu-" + messageId);
    if (menu) menu.classList.remove("show");
    $("messageInput").focus();
  });
}

function copyMessageText(chatId, messageId) {
  db.ref("chats/" + chatId + "/messages/" + messageId).once("value", (snapshot) => {
    const msg = snapshot.val();
    if (!msg || msg.deleted || !msg.text) return showToast("Copy karne ke liye message available nahi hai.", "error");
    const text = String(msg.text);
    const done = () => {
      const menu = $("msgMenu-" + messageId);
      if (menu) menu.classList.remove("show");
      showToast("Message copied.", "success");
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopyText(text, done));
    } else {
      fallbackCopyText(text, done);
    }
  });
}

function fallbackCopyText(text, callback) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
    if (typeof callback === "function") callback();
  } catch (error) {
    showToast("Copy failed. Message manually select karke copy karo.", "error");
  }
  document.body.removeChild(textarea);
}

function cancelReply(clear = true) {
  replyMessage = null;
  if ($("replyPreview")) $("replyPreview").style.display = "none";
  if (clear && $("messageInput")) $("messageInput").focus();
}

function startEditMessage(chatId, messageId) {
  editingChatId = chatId;
  editingMessageId = messageId;
  document.querySelectorAll(".msg-menu").forEach((menu) => menu.classList.remove("show"));
  loadMessages();
  setTimeout(() => {
    const input = $("editInput");
    if (!input) return;
    input.focus();
    input.select();
    input.onkeydown = (e) => {
      if (e.key === "Enter") saveEditedMessage();
      if (e.key === "Escape") cancelEditMessage();
    };
  }, 80);
}

function cancelEditMessage() {
  editingChatId = null;
  editingMessageId = null;
  loadMessages();
}

function saveEditedMessage() {
  const input = $("editInput");
  if (!editingChatId || !editingMessageId || !input) return showToast("Edit message not found.", "error");
  const updatedText = input.value.trim();
  if (!updatedText) return showToast("Message empty nahi ho sakta.", "error");
  const chatId = editingChatId;
  const messageId = editingMessageId;
  const updates = {};
  updates["chats/" + chatId + "/messages/" + messageId + "/text"] = updatedText;
  updates["chats/" + chatId + "/messages/" + messageId + "/edited"] = true;
  db.ref("lastMessages/" + chatId).once("value", (snapshot) => {
    const lastMsg = snapshot.val();
    if (lastMsg && lastMsg.messageId === messageId) updates["lastMessages/" + chatId + "/text"] = updatedText;
    db.ref().update(updates).then(() => {
      editingChatId = null;
      editingMessageId = null;
      showToast("Message updated.", "success");
    });
  });
}

function deleteMessageForMe(chatId, messageId) {
  if (!confirm("Delete this message only for you?")) return;
  db.ref("chats/" + chatId + "/messages/" + messageId + "/deletedFor/" + currentUser.uid)
    .set(true)
    .then(() => showToast("Deleted for you.", "success"))
    .catch((error) => showToast(error.message, "error"));
}

function deleteMessageForEveryone(chatId, messageId) {
  if (!confirm("Delete this message for everyone?")) return;
  const updates = {};
  updates["chats/" + chatId + "/messages/" + messageId + "/deleted"] = true;
  updates["chats/" + chatId + "/messages/" + messageId + "/text"] = "";
  updates["chats/" + chatId + "/messages/" + messageId + "/replyTo"] = null;
  db.ref("lastMessages/" + chatId).once("value", (snapshot) => {
    const lastMsg = snapshot.val();
    if (lastMsg && lastMsg.messageId === messageId) {
      updates["lastMessages/" + chatId + "/text"] = "This message was deleted";
      updates["lastMessages/" + chatId + "/deleted"] = true;
    }
    db.ref().update(updates).then(() => showToast("Deleted for everyone.", "success"));
  });
}

function markChatAsDelivered(chatId) {
  if (!currentUser) return;
  db.ref("chats/" + chatId + "/messages").once("value", (snapshot) => {
    const updates = {};
    snapshot.forEach((child) => {
      const msg = child.val();
      if (msg.senderId !== currentUser.uid && msg.delivered !== true) {
        updates["chats/" + chatId + "/messages/" + child.key + "/delivered"] = true;
      }
    });
    if (Object.keys(updates).length) db.ref().update(updates);
  });
}

function markCurrentChatAsSeen() {
  if (!currentUser || !currentChatUser || !currentChatId || document.hidden) return;
  db.ref("unread/" + currentUser.uid + "/" + currentChatId).remove();
  db.ref("chats/" + currentChatId + "/messages").once("value", (snapshot) => {
    const updates = {};
    snapshot.forEach((child) => {
      const msg = child.val();
      if (msg.senderId !== currentUser.uid && msg.seen !== true) {
        updates["chats/" + currentChatId + "/messages/" + child.key + "/seen"] = true;
        updates["chats/" + currentChatId + "/messages/" + child.key + "/delivered"] = true;
      }
    });
    if (Object.keys(updates).length) db.ref().update(updates);
  });
}

function setOnlineStatus() {
  if (!currentUser) return;
  const statusRef = db.ref("status/" + currentUser.uid);
  detachRef(connectedRef);
  connectedRef = db.ref(".info/connected");
  connectedRef.on("value", (snap) => {
    if (snap.val() === true) {
      statusRef.onDisconnect().update({ state: "offline", lastSeen: firebase.database.ServerValue.TIMESTAMP });
      statusRef.update({ state: "online", lastSeen: firebase.database.ServerValue.TIMESTAMP });
    }
  });
}

function listenChatStatus(uid) {
  detachRef(currentStatusRef);
  currentStatusRef = db.ref("status/" + uid);
  currentStatusRef.on("value", (snapshot) => {
    const status = snapshot.val();
    const statusDiv = $("chatStatus");
    if (!statusDiv) return;
    if (status && status.state === "online") statusDiv.textContent = "Online";
    else statusDiv.textContent = formatLastSeen(status && status.lastSeen);
  });
}

function handleTyping() {
  if (!currentUser || !currentChatUser || !currentChatId) return;
  const typingRef = db.ref("typing/" + currentChatId + "/" + currentUser.uid);
  typingRef.set(true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => typingRef.remove(), 1300);
}

function listenTypingStatus(otherUid) {
  detachRef(currentTypingRef);
  const chatId = getChatId(currentUser.uid, otherUid);
  currentTypingRef = db.ref("typing/" + chatId + "/" + otherUid);
  currentTypingRef.on("value", (snapshot) => {
    if (snapshot.val()) $("chatStatus").textContent = "typing...";
    else updateChatHeaderStatus(otherUid);
  });
}

function updateChatHeaderStatus(uid) {
  db.ref("status/" + uid).once("value", (snapshot) => {
    const status = snapshot.val();
    if (status && status.state === "online") $("chatStatus").textContent = "Online";
    else $("chatStatus").textContent = formatLastSeen(status && status.lastSeen);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  const enableNotifyBtn = document.getElementById("enableNotifyBtn");
  if (enableNotifyBtn) enableNotifyBtn.addEventListener("click", enableMessageAlerts);
  const messageInput = $("messageInput");
  const searchInput = $("searchInput");
  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    messageInput.addEventListener("input", handleTyping);
  }
  if (searchInput) {
    const searchBtn = $("searchBtn");
    const updateSearchButton = () => {
      if (!searchBtn) return;
      const hasText = searchInput.value.trim().length > 0;
      searchBtn.classList.toggle("hidden", !hasText);
      if (!hasText && $("searchResult")) $("searchResult").innerHTML = "";
    };
    updateSearchButton();
    searchInput.addEventListener("focus", () => document.body.classList.add("search-focused"));
    searchInput.addEventListener("blur", () => setTimeout(() => document.body.classList.remove("search-focused"), 180));
    searchInput.addEventListener("input", updateSearchButton);
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchUser();
      }
    });
  }
  setupMobileViewportFix();
  setupMobileBackAndScrollFixes();
});

function setupMobileViewportFix() {
  const setHeight = () => {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--aa-vh", height + "px");
    const base = window.innerHeight || height;
    const keyboardOpen = window.visualViewport && height < base * 0.82;
    document.body.classList.toggle("keyboard-open", !!keyboardOpen);
  };
  setHeight();
  window.addEventListener("resize", setHeight, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(setHeight, 250), { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setHeight, { passive: true });
    window.visualViewport.addEventListener("scroll", setHeight, { passive: true });
  }
}

function setupMobileBackAndScrollFixes() {
  if (window.aaVaultMobileFixesReady) return;
  window.aaVaultMobileFixesReady = true;

  window.addEventListener("popstate", () => {
    if (!currentUser || !isMobileLayout()) return;
    if (currentChatUser) {
      goBack(true);
      return;
    }
    if (isAccountPanelOpen()) {
      closeAccountPanel();
    }
  });

  let startY = 0;
  document.addEventListener("touchstart", (e) => {
    if (e.touches && e.touches.length) startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!isMobileLayout() || !e.touches || !e.touches.length) return;
    const scroller = e.target.closest("#messages, .list-content, .search-result, .account-content");
    if (!scroller) {
      e.preventDefault();
      return;
    }
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    const atTop = scroller.scrollTop <= 0;
    const atBottom = Math.ceil(scroller.scrollTop + scroller.clientHeight) >= scroller.scrollHeight;
    if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
      e.preventDefault();
    }
  }, { passive: false });
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { document.title = originalTitle; clearInterval(window.aaVaultTitleTimer); }
  if (!document.hidden && currentChatUser) markCurrentChatAsSeen();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) $("rightPanel").classList.remove("active");
});
