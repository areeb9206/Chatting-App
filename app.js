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
let alertsEnabled = localStorage.getItem("aaVaultMessageAlerts") !== "off";
let originalTitle = document.title;
const lastAlertTimestamps = {};
const lastOpenChatSoundTimestamps = {};

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
const activeGroupListeners = [];
let groupsRef = null;
let currentGroup = null;
let currentGroupId = null;
let selectedGroupMembersMap = {};

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

function playAppSound(type = "receive", force = false) {
  if (!force && !alertsEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === "send" ? 0.08 : 0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === "send" ? 0.13 : 0.22));
    gain.connect(ctx.destination);

    const tones = type === "send" ? [520, 680] : [780, 620];
    tones.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      const start = now + index * 0.055;
      osc.start(start);
      osc.stop(start + 0.09);
    });
  } catch (error) {
    console.warn("Message sound unavailable", error);
  }
}

function playMessageSound() {
  playAppSound("receive");
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

function avatarFallback(name) {
  return (
    "https://ui-avatars.com/api/?name=" +
    encodeURIComponent(name || "User") +
    "&background=0f766e&color=fff&bold=true"
  );
}

function normalizeImageUrl(photoURL) {
  let url = String(photoURL || "").trim();
  if (!url) return "";
  if (url.startsWith("//")) url = "https:" + url;
  if (!/^https?:\/\//i.test(url)) return "";

  // Google Drive share links are not direct image links. Convert common formats.
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i) || url.match(/[?&]id=([^&]+)/i);
  if (driveMatch && url.includes("drive.google.com")) {
    return "https://drive.google.com/uc?export=view&id=" + encodeURIComponent(driveMatch[1]);
  }
  return url;
}

function getProfilePhoto(photoURL, name) {
  const normalized = normalizeImageUrl(photoURL);
  return normalized || avatarFallback(name);
}

function handleImageError(img, name) {
  if (!img || img.dataset.fallbackApplied === "1") return;
  img.dataset.fallbackApplied = "1";
  img.src = avatarFallback(name || "User");
}

function openProfileViewer(photoURL, name, username) {
  const modal = $("profileViewer");
  if (!modal) return;
  $("profileViewerImg").src = getProfilePhoto(photoURL, name);
  $("profileViewerImg").onerror = function () { handleImageError(this, name || "User"); };
  $("profileViewerName").textContent = name || "User";
  $("profileViewerUsername").textContent = username ? "@" + username : "";
  modal.classList.add("show");
}

function closeProfileViewer() {
  const modal = $("profileViewer");
  if (modal) modal.classList.remove("show");
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
    loadGroups();
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
  detachGroupListeners();
  detachRef(groupsRef);
  groupsRef = null;
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
    $("myPhoto").onerror = function () { handleImageError(this, user.name || "User"); };
    $("myName").textContent = user.name || "My Profile";
    $("myUsername").textContent = "@" + (user.username || "user");
    $("accountPhoto").src = photo;
    $("accountPhoto").onerror = function () { handleImageError(this, user.name || "User"); };
    $("accountPhoto").onclick = () => openProfileViewer(user.photoURL, user.name || "User", user.username || "");
    $("accountName").textContent = user.name || "User";
    $("accountUsername").textContent = "@" + (user.username || "");
    $("accountEmail").textContent = user.email || currentUser.email || "";
    $("newPhotoURL").value = user.photoURL || "";
  });
}

function updateProfilePhoto() {
  const newPhotoURL = normalizeImageUrl($("newPhotoURL").value.trim());
  if ($("newPhotoURL").value.trim() && !newPhotoURL) return showToast("Please paste a direct image link starting with https://", "error");
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
      <img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" class="contact-pic" alt="" onerror="handleImageError(this, '${escapeHtml(user.name || "User")}')">
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
            <img src="${escapeHtml(getProfilePhoto(req.fromPhotoURL, req.fromName))}" class="contact-pic" alt="" onerror="handleImageError(this, '${escapeHtml(req.fromName || "User")}')">
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
              <img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" class="contact-pic" alt="" onerror="handleImageError(this, '${escapeHtml(user.name || "User")}')">
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
      <button class="contact-pic-wrapper" type="button" onclick="event.stopPropagation(); openProfileViewer('${escapeHtml(getProfilePhoto(user.photoURL, user.name))}', '${escapeHtml(user.name || "User")}', '${escapeHtml(user.username || "")}')">
        <img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" class="contact-pic" alt="" onerror="handleImageError(this, '${escapeHtml(user.name || "User")}')">
        <span class="status-dot" id="status-${uid}"></span>
      </button>
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
  $("chatPhoto").onerror = function () { handleImageError(this, name || "User"); };
  $("chatPhoto").onclick = () => openProfileViewer(photoURL, name, "");
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
      playAppSound("send", true);
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
    let newestIncomingTimestamp = 0;
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
      if (msg.senderId !== currentUser.uid && msg.timestamp) newestIncomingTimestamp = Math.max(newestIncomingTimestamp, msg.timestamp);
      messages.appendChild(renderMessage(chatId, messageId, msg));
    });
    const previousTimestamp = lastOpenChatSoundTimestamps[chatId] || 0;
    if (newestIncomingTimestamp && previousTimestamp && newestIncomingTimestamp > previousTimestamp && !document.hidden) {
      playAppSound("receive");
    }
    if (newestIncomingTimestamp) lastOpenChatSoundTimestamps[chatId] = newestIncomingTimestamp;
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

  const reactions = msg.reactions || {};
  const reactionCounts = {};
  Object.keys(reactions).forEach((uid) => {
    const emoji = reactions[uid];
    if (emoji) reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
  });
  const reactionsHTML = Object.keys(reactionCounts).length
    ? `<div class="message-reactions">${Object.keys(reactionCounts).map((emoji) => `<button type="button" class="reaction-chip ${reactions[currentUser.uid] === emoji ? "mine" : ""}" onclick="reactToMessage('${chatId}', '${messageId}', '${emoji}')">${emoji} <span>${reactionCounts[emoji]}</span></button>`).join("")}</div>`
    : "";
  const quickReactHTML = ["❤️", "😂", "👍", "😮", "😢"].map((emoji) => `<button type="button" onclick="reactToMessage('${chatId}', '${messageId}', '${emoji}')">${emoji}</button>`).join("");

  const menuHTML = msg.deleted
    ? ""
    : `<div class="msg-menu-wrap">
        <button class="msg-dots" type="button" onclick="toggleMessageMenu('${messageId}')">⋮</button>
        <div id="msgMenu-${messageId}" class="msg-menu">
          <div class="quick-reactions">${quickReactHTML}</div>
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
        ${reactionsHTML}
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

function reactToMessage(chatId, messageId, emoji) {
  if (!currentUser || !chatId || !messageId || !emoji) return;
  const ref = db.ref("chats/" + chatId + "/messages/" + messageId + "/reactions/" + currentUser.uid);
  ref.once("value", (snapshot) => {
    const current = snapshot.val();
    const action = current === emoji ? ref.remove() : ref.set(emoji);
    Promise.resolve(action)
      .then(() => {
        document.querySelectorAll(".msg-menu").forEach((menu) => menu.classList.remove("show"));
        playAppSound("send", true);
      })
      .catch((error) => showToast(error.message, "error"));
  });
}

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


/* =========================
   Groups feature upgrade
   ========================= */
function detachGroupListeners() {
  activeGroupListeners.forEach((ref) => ref.off());
  activeGroupListeners.length = 0;
}

function getRealGroupId(chatId) {
  return String(chatId || "").replace(/^group_/, "");
}

function isGroupChat(chatId) {
  return String(chatId || "").startsWith("group_");
}

function messagesPathFor(chatId) {
  return isGroupChat(chatId) ? "groupChats/" + getRealGroupId(chatId) + "/messages" : "chats/" + chatId + "/messages";
}

function lastMessagePathFor(chatId) {
  return isGroupChat(chatId) ? "groupLastMessages/" + getRealGroupId(chatId) : "lastMessages/" + chatId;
}

function unreadPathFor(uid, chatId) {
  return isGroupChat(chatId) ? "groupUnread/" + uid + "/" + getRealGroupId(chatId) : "unread/" + uid + "/" + chatId;
}

function getGroupPhoto(photoURL, name) {
  return getProfilePhoto(photoURL, name || "Group");
}

function openGroupModal() {
  selectedGroupMembersMap = {};
  const modal = $("groupModal");
  if (!modal) return;
  ["groupNameInput", "groupPhotoInput", "groupMemberSearchInput"].forEach((id) => { if ($(id)) $(id).value = ""; });
  if ($("groupMemberResult")) $("groupMemberResult").innerHTML = "";
  renderSelectedGroupMembers();
  modal.classList.add("show");
  setTimeout(() => $("groupNameInput") && $("groupNameInput").focus(), 120);
}

function closeGroupModal() {
  const modal = $("groupModal");
  if (modal) modal.classList.remove("show");
}

function renderSelectedGroupMembers() {
  const box = $("selectedGroupMembers");
  if (!box) return;
  const members = Object.values(selectedGroupMembersMap || {});
  if (!members.length) {
    box.innerHTML = '<span class="selected-empty">No members selected yet</span>';
    return;
  }
  box.innerHTML = members.map((m) => `
    <button class="member-chip" type="button" onclick="removeSelectedGroupMember('${m.uid}')">
      <img src="${escapeHtml(getProfilePhoto(m.photoURL, m.name))}" onerror="handleImageError(this, '${escapeHtml(m.name || "User")}')" alt="">
      <span>${escapeHtml(m.name || m.username || "User")}</span>
      <b>×</b>
    </button>`).join("");
}

function removeSelectedGroupMember(uid) {
  delete selectedGroupMembersMap[uid];
  renderSelectedGroupMembers();
}

function searchGroupMember() {
  const input = $("groupMemberSearchInput");
  const result = $("groupMemberResult");
  if (!input || !result) return;
  const username = normalizeUsername(input.value);
  result.innerHTML = "";
  if (!username) return showToast("Enter a username first.", "error");
  if (username === (($("myUsername") && $("myUsername").textContent || "").replace("@", ""))) return showToast("You are already in this group.", "error");
  db.ref("usernames/" + username).once("value")
    .then((snap) => {
      const uid = snap.val();
      if (!uid) throw new Error("No user found with this username.");
      if (uid === currentUser.uid) throw new Error("You are already in this group.");
      return db.ref("users/" + uid).once("value").then((userSnap) => ({ uid, user: userSnap.val() || {} }));
    })
    .then(({ uid, user }) => {
      selectedGroupMembersMap[uid] = {
        uid,
        username: user.username || username,
        name: user.name || username,
        photoURL: user.photoURL || "",
      };
      result.innerHTML = `<div class="group-member-added">Added @${escapeHtml(user.username || username)}</div>`;
      input.value = "";
      renderSelectedGroupMembers();
    })
    .catch((error) => {
      result.innerHTML = `<div class="group-member-error">${escapeHtml(error.message)}</div>`;
    });
}

function createGroup() {
  if (!currentUser) return;
  const name = ($("groupNameInput") && $("groupNameInput").value.trim()) || "";
  const photoURL = ($("groupPhotoInput") && $("groupPhotoInput").value.trim()) || "";
  if (!name || name.length < 2) return showToast("Group name at least 2 characters ka hona chahiye.", "error");
  const memberUids = Object.keys(selectedGroupMembersMap || {});
  if (!memberUids.length) return showToast("Group me kam se kam one member add karo.", "error");
  const newGroupRef = db.ref("groups").push();
  const groupId = newGroupRef.key;
  const now = Date.now();
  const members = {};
  members[currentUser.uid] = true;
  memberUids.forEach((uid) => { members[uid] = true; });
  const updates = {};
  updates["groups/" + groupId] = {
    groupId,
    name,
    photoURL: photoURL || "",
    adminUid: currentUser.uid,
    members,
    createdAt: now,
    updatedAt: now,
  };
  Object.keys(members).forEach((uid) => {
    updates["userGroups/" + uid + "/" + groupId] = { groupId, joinedAt: now };
  });
  updates["groupLastMessages/" + groupId] = {
    senderId: "system",
    senderName: "The A&A Vault",
    text: "Group created",
    timestamp: now,
    system: true,
  };
  db.ref().update(updates)
    .then(() => {
      closeGroupModal();
      showToast("Group created.", "success");
      openGroupChat(groupId, name, photoURL);
    })
    .catch((error) => showToast(error.message, "error"));
}

function loadGroups() {
  const groupList = $("groupList");
  if (!groupList || !currentUser) return;
  detachRef(groupsRef);
  detachGroupListeners();
  groupsRef = db.ref("userGroups/" + currentUser.uid);
  groupsRef.on("value", (snapshot) => {
    clearNode(groupList);
    detachGroupListeners();
    if (!snapshot.exists()) {
      groupList.className = "list-content empty-small";
      groupList.textContent = "No groups yet";
      return;
    }
    groupList.className = "list-content";
    snapshot.forEach((child) => {
      const groupId = child.key;
      renderGroupItem(groupId);
    });
  });
}

function renderGroupItem(groupId) {
  const groupList = $("groupList");
  if (!groupList) return;
  const groupRef = db.ref("groups/" + groupId);
  activeGroupListeners.push(groupRef);
  groupRef.on("value", (snap) => {
    const group = snap.val();
    if (!group) return;
    let div = $("group-" + groupId);
    if (!div) {
      div = document.createElement("div");
      div.className = "contact-item group-item";
      div.id = "group-" + groupId;
      div.dataset.lastActivity = String(group.createdAt || 0);
      div.onclick = () => openGroupChat(groupId, group.name || "Group", group.photoURL || "");
      groupList.appendChild(div);
    }
    const memberCount = group.members ? Object.keys(group.members).length : 1;
    div.innerHTML = `
      <button class="contact-pic-wrapper group-pic-wrapper" type="button" onclick="event.stopPropagation(); openProfileViewer('${escapeHtml(getGroupPhoto(group.photoURL, group.name))}', '${escapeHtml(group.name || "Group")}', '${memberCount} members')">
        <img src="${escapeHtml(getGroupPhoto(group.photoURL, group.name))}" class="contact-pic" alt="" onerror="handleImageError(this, '${escapeHtml(group.name || "Group")}')">
        <span class="group-mini-badge">👥</span>
      </button>
      <div class="contact-info">
        <div class="contact-top">
          <strong>${escapeHtml(group.name || "Group")}</strong>
          <span class="unread-badge" id="groupUnread-${groupId}">0</span>
        </div>
        <div class="contact-bottom">
          <span class="last-message" id="groupLastMsg-${groupId}">${memberCount} members</span>
          <span class="last-msg-time" id="groupLastTime-${groupId}"></span>
        </div>
      </div>`;
  });

  const lastRef = db.ref("groupLastMessages/" + groupId);
  activeGroupListeners.push(lastRef);
  lastRef.on("value", (snap) => {
    const div = $("group-" + groupId);
    const lastMsgDiv = $("groupLastMsg-" + groupId);
    const lastTimeDiv = $("groupLastTime-" + groupId);
    if (!div || !lastMsgDiv || !lastTimeDiv) return;
    if (!snap.exists()) return;
    const msg = snap.val() || {};
    div.dataset.lastActivity = String(msg.timestamp || 0);
    const prefix = msg.senderId === currentUser.uid ? "You: " : (msg.senderName && !msg.system ? msg.senderName + ": " : "");
    lastMsgDiv.textContent = prefix + (msg.deleted ? "This message was deleted" : msg.text || "New message");
    lastTimeDiv.textContent = formatTime(msg.timestamp);
    reorderGroups();
    if (msg.senderId && msg.senderId !== currentUser.uid && !msg.system) {
      const alertKey = "group_" + groupId;
      const isFirstLoad = lastAlertTimestamps[alertKey] === undefined;
      const lastSeenAlert = lastAlertTimestamps[alertKey] || 0;
      const isOpenChat = currentChatId === alertKey;
      if (isFirstLoad) lastAlertTimestamps[alertKey] = msg.timestamp || Date.now();
      else if (msg.timestamp && msg.timestamp > lastSeenAlert && (!isOpenChat || document.hidden)) {
        lastAlertTimestamps[alertKey] = msg.timestamp;
        showLocalMessageAlert(msg.senderName || "Group", msg.text || "New group message");
      }
    }
  });

  const unreadRef = db.ref("groupUnread/" + currentUser.uid + "/" + groupId);
  activeGroupListeners.push(unreadRef);
  unreadRef.on("value", (snap) => {
    const badge = $("groupUnread-" + groupId);
    if (!badge) return;
    const count = snap.val() || 0;
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-flex" : "none";
  });
}

function reorderGroups() {
  const groupList = $("groupList");
  if (!groupList) return;
  Array.from(groupList.querySelectorAll(".group-item"))
    .sort((a, b) => Number(b.dataset.lastActivity || 0) - Number(a.dataset.lastActivity || 0))
    .forEach((item) => groupList.appendChild(item));
}

function openGroupChat(groupId, name, photoURL = "") {
  currentGroupId = groupId;
  currentGroup = { groupId, name, photoURL };
  currentChatUser = null;
  currentChatUserName = name || "Group";
  currentChatId = "group_" + groupId;
  replyMessage = null;
  editingMessageId = null;
  editingChatId = null;
  cancelReply(false);
  document.querySelectorAll(".contact-item").forEach((item) => item.classList.remove("active"));
  const active = $("group-" + groupId);
  if (active) active.classList.add("active");
  db.ref("groupUnread/" + currentUser.uid + "/" + groupId).remove();
  hideAllRightPanels();
  $("chatPhoto").src = getGroupPhoto(photoURL, name);
  $("chatPhoto").onerror = function () { handleImageError(this, name || "Group"); };
  $("chatPhoto").onclick = () => openGroupInfo(groupId);
  $("chatWithName").textContent = name || "Group";
  $("chatStatus").textContent = "Group chat";
  $("chatContainer").style.display = "flex";
  showRightOnMobile();
  pushPanelHistory("chat");
  loadMessages();
}

function openGroupInfo(groupId) {
  if (!groupId) groupId = currentGroupId;
  if (!groupId) return;
  db.ref("groups/" + groupId).once("value", (snap) => {
    const group = snap.val();
    if (!group) return showToast("Group not found.", "error");
    const modal = $("groupInfoModal");
    if (!modal) return;
    const memberCount = group.members ? Object.keys(group.members).length : 1;
    $("groupInfoPhoto").src = getGroupPhoto(group.photoURL, group.name);
    $("groupInfoPhoto").onerror = function () { handleImageError(this, group.name || "Group"); };
    $("groupInfoName").textContent = group.name || "Group";
    $("groupInfoMembers").textContent = memberCount + " members" + (group.adminUid === currentUser.uid ? " • You are admin" : "");
    const adminTools = $("groupAdminTools");
    if (adminTools) adminTools.style.display = group.adminUid === currentUser.uid ? "grid" : "none";
    if ($("editGroupNameInput")) $("editGroupNameInput").value = group.name || "";
    if ($("editGroupPhotoInput")) $("editGroupPhotoInput").value = group.photoURL || "";
    modal.classList.add("show");
  });
}

function closeGroupInfo() {
  const modal = $("groupInfoModal");
  if (modal) modal.classList.remove("show");
}

function updateCurrentGroupInfo() {
  if (!currentGroupId) return;
  const name = ($("editGroupNameInput") && $("editGroupNameInput").value.trim()) || "";
  const photoURL = ($("editGroupPhotoInput") && $("editGroupPhotoInput").value.trim()) || "";
  if (!name || name.length < 2) return showToast("Group name required.", "error");
  db.ref("groups/" + currentGroupId).once("value", (snap) => {
    const group = snap.val();
    if (!group || group.adminUid !== currentUser.uid) throw new Error("Only group admin can update group.");
    return db.ref("groups/" + currentGroupId).update({ name, photoURL, updatedAt: Date.now() });
  }).then(() => {
    $("chatWithName").textContent = name;
    $("chatPhoto").src = getGroupPhoto(photoURL, name);
    showToast("Group updated.", "success");
    closeGroupInfo();
  }).catch((error) => showToast(error.message, "error"));
}

function addMemberToCurrentGroup() {
  if (!currentGroupId) return;
  const input = $("groupInfoMemberInput");
  const username = normalizeUsername(input && input.value);
  if (!username) return showToast("Enter username.", "error");
  db.ref("groups/" + currentGroupId).once("value")
    .then((groupSnap) => {
      const group = groupSnap.val();
      if (!group || group.adminUid !== currentUser.uid) throw new Error("Only group admin can add members.");
      return db.ref("usernames/" + username).once("value").then((userSnap) => ({ group, uid: userSnap.val() }));
    })
    .then(({ group, uid }) => {
      if (!uid) throw new Error("User not found.");
      if (group.members && group.members[uid]) throw new Error("User already in group.");
      const updates = {};
      updates["groups/" + currentGroupId + "/members/" + uid] = true;
      updates["userGroups/" + uid + "/" + currentGroupId] = { groupId: currentGroupId, joinedAt: Date.now() };
      return db.ref().update(updates);
    })
    .then(() => {
      if (input) input.value = "";
      showToast("Member added.", "success");
      openGroupInfo(currentGroupId);
    })
    .catch((error) => showToast(error.message, "error"));
}

// Override chat opener to reset group state for one-to-one chats.
const aaVaultOriginalOpenChat = openChat;
openChat = function(uid, name, photoURL = "") {
  currentGroup = null;
  currentGroupId = null;
  aaVaultOriginalOpenChat(uid, name, photoURL);
};

// Group-aware message sender.
sendMessage = function() {
  const input = $("messageInput");
  const text = input.value.trim();
  if (!text || !currentChatId) return;
  const chatId = currentChatId;
  const isGroup = isGroupChat(chatId);
  const realGroupId = isGroup ? getRealGroupId(chatId) : null;
  db.ref("users/" + currentUser.uid).once("value", (snapshot) => {
    const me = snapshot.val() || { name: "Me" };
    const basePath = messagesPathFor(chatId);
    const newMsgRef = db.ref(basePath).push();
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
      chatType: isGroup ? "group" : "direct",
      receiverId: isGroup ? "" : currentChatUser,
      groupId: isGroup ? realGroupId : "",
    };
    if (replyMessage) {
      messageData.replyTo = { senderName: replyMessage.senderName || "User", text: replyMessage.text || "" };
    }
    const updates = {};
    updates[basePath + "/" + newMsgRef.key] = messageData;
    updates[lastMessagePathFor(chatId)] = {
      messageId: newMsgRef.key,
      senderId: currentUser.uid,
      senderName: me.name || "Me",
      text,
      timestamp,
      deleted: false,
    };
    const finish = () => db.ref().update(updates).then(() => {
      playAppSound("send", true);
      input.value = "";
      cancelReply(false);
      if (!isGroup) db.ref("typing/" + chatId + "/" + currentUser.uid).remove();
    });
    if (isGroup) {
      db.ref("groups/" + realGroupId + "/members").once("value", (membersSnap) => {
        const members = membersSnap.val() || {};
        Object.keys(members).forEach((uid) => {
          if (uid !== currentUser.uid) updates["groupUnread/" + uid + "/" + realGroupId] = firebase.database.ServerValue.increment(1);
        });
        finish();
      });
    } else {
      updates["unread/" + currentChatUser + "/" + chatId] = firebase.database.ServerValue.increment(1);
      finish();
    }
  });
};

loadMessages = function() {
  const messages = $("messages");
  const chatId = currentChatId;
  if (!chatId) return;
  detachRef(currentMessagesRef);
  currentMessagesRef = db.ref(messagesPathFor(chatId));
  currentMessagesRef.on("value", (snapshot) => {
    clearNode(messages);
    let newestIncomingTimestamp = 0;
    if (!snapshot.exists()) {
      const empty = document.createElement("div");
      empty.className = "empty-small";
      empty.textContent = isGroupChat(chatId) ? "No group messages yet. Say hello 👋" : "No messages yet. Say hello 👋";
      messages.appendChild(empty);
    }
    snapshot.forEach((child) => {
      const msg = child.val();
      const messageId = child.key;
      if (msg.deletedFor && msg.deletedFor[currentUser.uid]) return;
      if (msg.senderId !== currentUser.uid && msg.timestamp) newestIncomingTimestamp = Math.max(newestIncomingTimestamp, msg.timestamp);
      messages.appendChild(renderMessage(chatId, messageId, msg));
    });
    const previousTimestamp = lastOpenChatSoundTimestamps[chatId] || 0;
    if (newestIncomingTimestamp && previousTimestamp && newestIncomingTimestamp > previousTimestamp && !document.hidden) playAppSound("receive");
    if (newestIncomingTimestamp) lastOpenChatSoundTimestamps[chatId] = newestIncomingTimestamp;
    messages.scrollTop = messages.scrollHeight;
    if (!isGroupChat(chatId) && currentChatId === chatId && currentChatUser && !document.hidden) markCurrentChatAsSeen();
    if (isGroupChat(chatId)) db.ref("groupUnread/" + currentUser.uid + "/" + getRealGroupId(chatId)).remove();
  });
};

reactToMessage = function(chatId, messageId, emoji) {
  if (!currentUser || !chatId || !messageId || !emoji) return;
  const ref = db.ref(messagesPathFor(chatId) + "/" + messageId + "/reactions/" + currentUser.uid);
  ref.once("value", (snapshot) => {
    const current = snapshot.val();
    const action = current === emoji ? ref.remove() : ref.set(emoji);
    Promise.resolve(action).then(() => {
      document.querySelectorAll(".msg-menu").forEach((menu) => menu.classList.remove("show"));
      playAppSound("send", true);
    }).catch((error) => showToast(error.message, "error"));
  });
};

replyToMessageById = function(chatId, messageId) {
  db.ref(messagesPathFor(chatId) + "/" + messageId).once("value", (snapshot) => {
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
};

copyMessageText = function(chatId, messageId) {
  db.ref(messagesPathFor(chatId) + "/" + messageId).once("value", (snapshot) => {
    const msg = snapshot.val();
    if (!msg || msg.deleted || !msg.text) return showToast("Copy karne ke liye message available nahi hai.", "error");
    const text = String(msg.text);
    const done = () => { const menu = $("msgMenu-" + messageId); if (menu) menu.classList.remove("show"); showToast("Message copied.", "success"); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopyText(text, done));
    else fallbackCopyText(text, done);
  });
};

startEditMessage = function(chatId, messageId) {
  editingChatId = chatId;
  editingMessageId = messageId;
  document.querySelectorAll(".msg-menu").forEach((menu) => menu.classList.remove("show"));
  loadMessages();
  setTimeout(() => { const input = $("editInput"); if (!input) return; input.focus(); input.select(); input.onkeydown = (e) => { if (e.key === "Enter") saveEditedMessage(); if (e.key === "Escape") cancelEditMessage(); }; }, 80);
};

saveEditedMessage = function() {
  const input = $("editInput");
  if (!editingChatId || !editingMessageId || !input) return showToast("Edit message not found.", "error");
  const updatedText = input.value.trim();
  if (!updatedText) return showToast("Message empty nahi ho sakta.", "error");
  const chatId = editingChatId;
  const messageId = editingMessageId;
  const updates = {};
  updates[messagesPathFor(chatId) + "/" + messageId + "/text"] = updatedText;
  updates[messagesPathFor(chatId) + "/" + messageId + "/edited"] = true;
  db.ref(lastMessagePathFor(chatId)).once("value", (snapshot) => {
    const lastMsg = snapshot.val();
    if (lastMsg && lastMsg.messageId === messageId) updates[lastMessagePathFor(chatId) + "/text"] = updatedText;
    db.ref().update(updates).then(() => { editingChatId = null; editingMessageId = null; showToast("Message updated.", "success"); });
  });
};

deleteMessageForMe = function(chatId, messageId) {
  if (!confirm("Delete this message only for you?")) return;
  db.ref(messagesPathFor(chatId) + "/" + messageId + "/deletedFor/" + currentUser.uid)
    .set(true).then(() => showToast("Deleted for you.", "success")).catch((error) => showToast(error.message, "error"));
};

deleteMessageForEveryone = function(chatId, messageId) {
  if (!confirm("Delete this message for everyone?")) return;
  const updates = {};
  updates[messagesPathFor(chatId) + "/" + messageId + "/deleted"] = true;
  updates[messagesPathFor(chatId) + "/" + messageId + "/text"] = "";
  updates[messagesPathFor(chatId) + "/" + messageId + "/replyTo"] = null;
  db.ref(lastMessagePathFor(chatId)).once("value", (snapshot) => {
    const lastMsg = snapshot.val();
    if (lastMsg && lastMsg.messageId === messageId) {
      updates[lastMessagePathFor(chatId) + "/text"] = "This message was deleted";
      updates[lastMessagePathFor(chatId) + "/deleted"] = true;
    }
    db.ref().update(updates).then(() => showToast("Deleted for everyone.", "success"));
  });
};

const aaVaultOriginalGoBack = goBack;
goBack = function(skipHistoryPush = false) {
  currentGroup = null;
  currentGroupId = null;
  aaVaultOriginalGoBack(skipHistoryPush);
};

// Create group with Enter key inside group member search.
document.addEventListener("DOMContentLoaded", () => {
  const memberSearch = $("groupMemberSearchInput");
  if (memberSearch) memberSearch.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchGroupMember(); } });
  const groupInfoMember = $("groupInfoMemberInput");
  if (groupInfoMember) groupInfoMember.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addMemberToCurrentGroup(); } });
});

/* Final update: combined chats list, filters, contacts-only groups, members list */
let aaListFilter = "all";
let aaContactState = {};
let aaGroupState = {};
let aaRequestState = { incoming: {}, outgoing: {} };

function setListFilter(filter) {
  aaListFilter = filter || "all";
  document.querySelectorAll(".filter-chip").forEach((btn) => btn.classList.toggle("active", btn.dataset.filter === aaListFilter));
  document.body.classList.toggle("filter-pending", aaListFilter === "pending");
  renderCombinedList();
  renderRequestsPanelFinal();
}

function updateFilterCounts() {
  const unread = Object.values(aaContactState).reduce((sum, item) => sum + Number(item.unread || 0), 0) +
    Object.values(aaGroupState).reduce((sum, item) => sum + Number(item.unread || 0), 0);
  const pending = Object.keys(aaRequestState.incoming || {}).filter((k) => aaRequestState.incoming[k]).length +
    Object.keys(aaRequestState.outgoing || {}).filter((k) => aaRequestState.outgoing[k]).length;
  if ($("unreadFilterCount")) $("unreadFilterCount").textContent = unread ? String(unread) : "";
  if ($("pendingFilterCount")) $("pendingFilterCount").textContent = pending ? String(pending) : "";
}

function buildContactNode(item) {
  const user = item.user || {};
  const uid = item.uid;
  const div = document.createElement("div");
  div.className = "contact-item" + (currentChatId === item.chatId ? " active" : "");
  div.id = "contact-" + uid;
  div.dataset.lastActivity = String(item.lastActivity || 0);
  div.onclick = () => openChat(uid, user.name || "User", user.photoURL || "");
  div.innerHTML = `
    <button class="contact-pic-wrapper" type="button" onclick="event.stopPropagation(); openProfileViewer('${escapeHtml(getProfilePhoto(user.photoURL, user.name))}', '${escapeHtml(user.name || "User")}', '${escapeHtml(user.username || "")}' )">
      <img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" class="contact-pic" alt="" onerror="handleImageError(this, '${escapeHtml(user.name || "User")}')">
      <span class="status-dot ${item.online ? "online" : ""}" id="status-${uid}"></span>
    </button>
    <div class="contact-info">
      <div class="contact-top">
        <strong>${escapeHtml(user.name || "User")}</strong>
        <span class="unread-badge" style="display:${Number(item.unread || 0) > 0 ? "inline-flex" : "none"}">${Number(item.unread || 0)}</span>
      </div>
      <div class="contact-bottom">
        <span class="last-message">${escapeHtml(item.preview || "No messages yet")}</span>
        <span class="last-msg-time">${item.lastTime ? escapeHtml(item.lastTime) : ""}</span>
      </div>
    </div>`;
  return div;
}

function buildGroupNode(item) {
  const group = item.group || {};
  const groupId = item.groupId;
  const div = document.createElement("div");
  div.className = "contact-item group-item" + (currentChatId === "group_" + groupId ? " active" : "");
  div.id = "group-" + groupId;
  div.dataset.lastActivity = String(item.lastActivity || 0);
  div.onclick = () => openGroupChat(groupId, group.name || "Group", group.photoURL || "");
  const memberCount = item.memberCount || (group.members ? Object.keys(group.members).length : 1);
  div.innerHTML = `
    <button class="contact-pic-wrapper group-pic-wrapper" type="button" onclick="event.stopPropagation(); openGroupInfo('${groupId}')">
      <img src="${escapeHtml(getGroupPhoto(group.photoURL, group.name))}" class="contact-pic" alt="" onerror="handleImageError(this, '${escapeHtml(group.name || "Group")}')">
      <span class="group-mini-badge">👥</span>
    </button>
    <div class="contact-info">
      <div class="contact-top">
        <strong>${escapeHtml(group.name || "Group")}</strong>
        <span class="unread-badge" style="display:${Number(item.unread || 0) > 0 ? "inline-flex" : "none"}">${Number(item.unread || 0)}</span>
      </div>
      <div class="contact-bottom">
        <span class="last-message">${escapeHtml(item.preview || (memberCount + " members"))}</span>
        <span class="last-msg-time">${item.lastTime ? escapeHtml(item.lastTime) : ""}</span>
      </div>
    </div>`;
  return div;
}

function renderCombinedList() {
  const userList = $("userList");
  const title = $("combinedSectionTitle");
  if (!userList) return;
  clearNode(userList);
  updateFilterCounts();

  if (aaListFilter === "pending") {
    userList.className = "list-content empty-small";
    const total = Object.keys(aaRequestState.incoming || {}).filter((k) => aaRequestState.incoming[k]).length + Object.keys(aaRequestState.outgoing || {}).filter((k) => aaRequestState.outgoing[k]).length;
    userList.textContent = total ? "Manage your pending requests above." : "No pending requests.";
    if (title) title.textContent = "Pending Requests";
    return;
  }

  let items = [];
  if (aaListFilter === "all") {
    items = [
      ...Object.values(aaContactState).map((item) => ({ type: "contact", ...item })),
      ...Object.values(aaGroupState).map((item) => ({ type: "group", ...item })),
    ];
    if (title) title.textContent = "All Chats";
  } else if (aaListFilter === "groups") {
    items = Object.values(aaGroupState).map((item) => ({ type: "group", ...item }));
    if (title) title.textContent = "Groups";
  } else if (aaListFilter === "unread") {
    items = [
      ...Object.values(aaContactState).filter((item) => Number(item.unread || 0) > 0).map((item) => ({ type: "contact", ...item })),
      ...Object.values(aaGroupState).filter((item) => Number(item.unread || 0) > 0).map((item) => ({ type: "group", ...item })),
    ];
    if (title) title.textContent = "Unread";
  }

  items.sort((a, b) => Number(b.lastActivity || 0) - Number(a.lastActivity || 0));
  if (!items.length) {
    userList.className = "list-content empty-small";
    userList.textContent = aaListFilter === "groups" ? "No groups yet." : aaListFilter === "unread" ? "No unread chats." : "No chats yet.";
    return;
  }
  userList.className = "list-content";
  items.forEach((item) => userList.appendChild(item.type === "group" ? buildGroupNode(item) : buildContactNode(item)));
}

loadContacts = function() {
  detachRef(contactsRef);
  detachContactListeners();
  aaContactState = {};
  renderCombinedList();
  contactsRef = db.ref("contacts/" + currentUser.uid);
  contactsRef.on("value", (snapshot) => {
    detachContactListeners();
    aaContactState = {};
    if (!snapshot.exists()) { renderCombinedList(); return; }
    snapshot.forEach((child) => {
      const contact = child.val();
      if (!contact || !contact.uid) return;
      const uid = contact.uid;
      const chatId = getChatId(currentUser.uid, uid);
      aaContactState[uid] = { uid, chatId, user: contact, lastActivity: contact.addedAt || 0, preview: "No messages yet", lastTime: "", unread: 0, online: false };
      db.ref("users/" + uid).once("value", (userSnap) => {
        if (userSnap.exists() && aaContactState[uid]) {
          aaContactState[uid].user = { ...aaContactState[uid].user, ...(userSnap.val() || {}) };
          renderCombinedList();
        }
      });
      const statusRef = db.ref("status/" + uid);
      activeContactListeners.push(statusRef);
      statusRef.on("value", (snap) => {
        if (!aaContactState[uid]) return;
        aaContactState[uid].online = !!(snap.val() && snap.val().state === "online");
        const dot = $("status-" + uid);
        if (dot) dot.classList.toggle("online", aaContactState[uid].online);
      });
      const lastRef = db.ref("lastMessages/" + chatId);
      activeContactListeners.push(lastRef);
      lastRef.on("value", (snap) => {
        if (!aaContactState[uid]) return;
        if (!snap.exists()) {
          aaContactState[uid].preview = "No messages yet";
          aaContactState[uid].lastTime = "";
          aaContactState[uid].lastActivity = contact.addedAt || 0;
          renderCombinedList();
          return;
        }
        const msg = snap.val() || {};
        aaContactState[uid].lastActivity = msg.timestamp || contact.addedAt || 0;
        aaContactState[uid].preview = (msg.senderId === currentUser.uid ? "You: " : "") + (msg.deleted ? "This message was deleted" : msg.text || "New message");
        aaContactState[uid].lastTime = formatTime(msg.timestamp);
        renderCombinedList();
        if (msg.senderId !== currentUser.uid) {
          markChatAsDelivered(chatId);
          const isFirstLoad = lastAlertTimestamps[chatId] === undefined;
          const lastSeenAlert = lastAlertTimestamps[chatId] || 0;
          const isOpenChat = currentChatId === chatId;
          if (isFirstLoad) lastAlertTimestamps[chatId] = msg.timestamp || Date.now();
          else if (msg.timestamp && msg.timestamp > lastSeenAlert && (!isOpenChat || document.hidden)) {
            lastAlertTimestamps[chatId] = msg.timestamp;
            showLocalMessageAlert(msg.senderName || aaContactState[uid].user.name || "New message", msg.deleted ? "This message was deleted" : msg.text || "New message");
          }
        }
      });
      const unreadRef = db.ref("unread/" + currentUser.uid + "/" + chatId);
      activeContactListeners.push(unreadRef);
      unreadRef.on("value", (snap) => {
        if (!aaContactState[uid]) return;
        aaContactState[uid].unread = Number(snap.val() || 0);
        renderCombinedList();
      });
    });
    renderCombinedList();
  });
};

loadGroups = function() {
  detachRef(groupsRef);
  detachGroupListeners();
  aaGroupState = {};
  renderCombinedList();
  groupsRef = db.ref("userGroups/" + currentUser.uid);
  groupsRef.on("value", (snapshot) => {
    detachGroupListeners();
    aaGroupState = {};
    if (!snapshot.exists()) { renderCombinedList(); return; }
    snapshot.forEach((child) => {
      const groupId = child.key;
      aaGroupState[groupId] = { groupId, group: { name: "Group", members: {} }, memberCount: 1, lastActivity: 0, preview: "Group", lastTime: "", unread: 0 };
      const groupRef = db.ref("groups/" + groupId);
      activeGroupListeners.push(groupRef);
      groupRef.on("value", (snap) => {
        const group = snap.val();
        if (!group) { delete aaGroupState[groupId]; renderCombinedList(); return; }
        aaGroupState[groupId] = aaGroupState[groupId] || { groupId };
        aaGroupState[groupId].group = group;
        aaGroupState[groupId].memberCount = group.members ? Object.keys(group.members).length : 1;
        aaGroupState[groupId].lastActivity = aaGroupState[groupId].lastActivity || group.createdAt || 0;
        renderCombinedList();
      });
      const lastRef = db.ref("groupLastMessages/" + groupId);
      activeGroupListeners.push(lastRef);
      lastRef.on("value", (snap) => {
        if (!aaGroupState[groupId] || !snap.exists()) return;
        const msg = snap.val() || {};
        aaGroupState[groupId].lastActivity = msg.timestamp || 0;
        const prefix = msg.senderId === currentUser.uid ? "You: " : (msg.senderName && !msg.system ? msg.senderName + ": " : "");
        aaGroupState[groupId].preview = prefix + (msg.deleted ? "This message was deleted" : msg.text || "New group message");
        aaGroupState[groupId].lastTime = formatTime(msg.timestamp);
        renderCombinedList();
        if (msg.senderId && msg.senderId !== currentUser.uid && !msg.system) {
          const alertKey = "group_" + groupId;
          const isFirstLoad = lastAlertTimestamps[alertKey] === undefined;
          const lastSeenAlert = lastAlertTimestamps[alertKey] || 0;
          const isOpenChat = currentChatId === alertKey;
          if (isFirstLoad) lastAlertTimestamps[alertKey] = msg.timestamp || Date.now();
          else if (msg.timestamp && msg.timestamp > lastSeenAlert && (!isOpenChat || document.hidden)) {
            lastAlertTimestamps[alertKey] = msg.timestamp;
            showLocalMessageAlert(msg.senderName || "Group", msg.text || "New group message");
          }
        }
      });
      const unreadRef = db.ref("groupUnread/" + currentUser.uid + "/" + groupId);
      activeGroupListeners.push(unreadRef);
      unreadRef.on("value", (snap) => {
        if (!aaGroupState[groupId]) return;
        aaGroupState[groupId].unread = Number(snap.val() || 0);
        renderCombinedList();
      });
    });
    renderCombinedList();
  });
};

function renderRequestsPanelFinal() {
  const requestList = $("requestList");
  const requestsSection = $("requestsSection") || (requestList ? requestList.closest(".list-section") : null);
  if (!requestList) return;
  clearNode(requestList);
  const incoming = Object.entries(aaRequestState.incoming || {}).filter(([, req]) => req);
  const outgoing = Object.entries(aaRequestState.outgoing || {}).filter(([, req]) => req);
  const shouldShow = aaListFilter === "pending";
  if (!shouldShow) {
    if (requestsSection) requestsSection.classList.add("hidden-section");
    return;
  }
  if (requestsSection) requestsSection.classList.remove("hidden-section");
  if (!incoming.length && !outgoing.length) {
    requestList.className = "list-content empty-small";
    requestList.textContent = "No pending requests.";
    updateFilterCounts();
    return;
  }
  requestList.className = "list-content";
  incoming.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0)).forEach(([fromUid, req]) => {
    const div = document.createElement("div");
    div.className = "request-item";
    div.innerHTML = `
      <div class="item-head">
        <img src="${escapeHtml(getProfilePhoto(req.fromPhotoURL, req.fromName))}" class="contact-pic" alt="" onerror="handleImageError(this, '${escapeHtml(req.fromName || "User")}')">
        <div><strong>${escapeHtml(req.fromName || "User")}</strong><small>@${escapeHtml(req.fromUsername || "")}</small></div>
      </div>
      <div class="item-actions">
        <button class="accept-btn" onclick="acceptRequest('${fromUid}')">Accept</button>
        <button class="reject-btn" onclick="rejectRequest('${fromUid}')">Reject</button>
      </div>`;
    requestList.appendChild(div);
  });
  outgoing.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0)).forEach(([toUid]) => {
    db.ref("users/" + toUid).once("value").then((userSnap) => {
      if (aaListFilter !== "pending") return;
      const user = userSnap.val() || {};
      const div = document.createElement("div");
      div.className = "request-item pending-request";
      div.innerHTML = `
        <div class="item-head">
          <img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" class="contact-pic" alt="" onerror="handleImageError(this, '${escapeHtml(user.name || "User")}')">
          <div><strong>${escapeHtml(user.name || "User")}</strong><small>@${escapeHtml(user.username || "")}</small></div>
        </div>
        <div class="item-actions"><button class="disabled-btn" disabled>Pending</button></div>`;
      requestList.appendChild(div);
    });
  });
  updateFilterCounts();
}

loadRequests = function() {
  detachRef(requestsRef);
  detachRef(sentRequestsRef);
  requestsRef = db.ref("requests/" + currentUser.uid);
  sentRequestsRef = db.ref("sentRequests/" + currentUser.uid);
  requestsRef.on("value", (snapshot) => {
    aaRequestState.incoming = snapshot.val() || {};
    updateFilterCounts();
    renderRequestsPanelFinal();
    renderCombinedList();
  });
  sentRequestsRef.on("value", (snapshot) => {
    aaRequestState.outgoing = snapshot.val() || {};
    updateFilterCounts();
    renderRequestsPanelFinal();
    renderCombinedList();
  });
};

function renderSelectedGroupMembers() {
  const wrap = $("selectedGroupMembers");
  if (!wrap) return;
  clearNode(wrap);
  const selected = Object.values(selectedGroupMembersMap || {});
  if (!selected.length) { wrap.innerHTML = '<span class="selected-empty">Selected contacts will appear here.</span>'; return; }
  selected.forEach((user) => {
    const chip = document.createElement("button");
    chip.className = "member-chip";
    chip.type = "button";
    chip.onclick = () => { delete selectedGroupMembersMap[user.uid]; renderSelectedGroupMembers(); };
    chip.innerHTML = `<img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" onerror="handleImageError(this, '${escapeHtml(user.name || "User")}')" alt=""><span>${escapeHtml(user.name || user.username || "User")}</span><b>×</b>`;
    wrap.appendChild(chip);
  });
}

searchGroupMember = function() {
  const input = $("groupMemberSearchInput");
  const result = $("groupMemberResult");
  const q = normalizeUsername(input && input.value);
  if (!result) return;
  result.innerHTML = "";
  if (!q) return showToast("Search your contacts first.", "error");
  const matches = Object.values(aaContactState).filter((item) => {
    const u = item.user || {};
    return (u.username || "").toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q);
  });
  if (!matches.length) { result.innerHTML = '<div class="group-member-error">No matching contact found. Add them as a contact first.</div>'; return; }
  matches.slice(0, 5).forEach((item) => {
    const u = item.user || {};
    const row = document.createElement("button");
    row.type = "button";
    row.className = "group-member-row";
    row.innerHTML = `<img src="${escapeHtml(getProfilePhoto(u.photoURL, u.name))}" onerror="handleImageError(this, '${escapeHtml(u.name || "User")}')" alt=""><span><strong>${escapeHtml(u.name || "User")}</strong><small>@${escapeHtml(u.username || "")}</small></span>`;
    row.onclick = () => {
      selectedGroupMembersMap[item.uid] = { uid: item.uid, name: u.name || "User", username: u.username || "", photoURL: u.photoURL || "" };
      if (input) input.value = "";
      result.innerHTML = `<div class="group-member-added">Added ${escapeHtml(u.name || u.username || "contact")}</div>`;
      renderSelectedGroupMembers();
    };
    result.appendChild(row);
  });
};

const aaVaultOriginalOpenGroupModalFinal = openGroupModal;
openGroupModal = function() {
  aaVaultOriginalOpenGroupModalFinal();
  renderSelectedGroupMembers();
  if ($("groupMemberResult")) $("groupMemberResult").innerHTML = '<div class="group-member-added">Only your added contacts can be invited.</div>';
};

function renderGroupMembersList(group) {
  const list = $("groupMembersList");
  if (!list || !group || !group.members) return;
  clearNode(list);
  Object.keys(group.members).forEach((uid) => {
    db.ref("users/" + uid).once("value", (snap) => {
      const user = snap.val() || {};
      const row = document.createElement("div");
      row.className = "group-member-row";
      row.innerHTML = `<img src="${escapeHtml(getProfilePhoto(user.photoURL, user.name))}" onerror="handleImageError(this, '${escapeHtml(user.name || "User")}')" alt=""><span><strong>${escapeHtml(uid === currentUser.uid ? "You" : (user.name || "User"))}</strong><small>@${escapeHtml(user.username || "")}</small></span>${uid === group.adminUid ? '<em class="admin-tag">Admin</em>' : ''}`;
      list.appendChild(row);
    });
  });
}

openGroupInfo = function(groupId) {
  if (!groupId) groupId = currentGroupId;
  if (!groupId) return;
  db.ref("groups/" + groupId).once("value", (snap) => {
    const group = snap.val();
    if (!group) return showToast("Group not found.", "error");
    const modal = $("groupInfoModal");
    if (!modal) return;
    currentGroupId = groupId;
    const memberCount = group.members ? Object.keys(group.members).length : 1;
    $("groupInfoPhoto").src = getGroupPhoto(group.photoURL, group.name);
    $("groupInfoPhoto").onerror = function () { handleImageError(this, group.name || "Group"); };
    $("groupInfoName").textContent = group.name || "Group";
    $("groupInfoMembers").textContent = memberCount + " members" + (group.adminUid === currentUser.uid ? " • You are admin" : "");
    renderGroupMembersList(group);
    const adminTools = $("groupAdminTools");
    if (adminTools) adminTools.style.display = group.adminUid === currentUser.uid ? "grid" : "none";
    if ($("editGroupNameInput")) $("editGroupNameInput").value = group.name || "";
    if ($("editGroupPhotoInput")) $("editGroupPhotoInput").value = group.photoURL || "";
    if ($("groupInfoMemberInput")) $("groupInfoMemberInput").value = "";
    modal.classList.add("show");
  });
};

addMemberToCurrentGroup = function() {
  if (!currentGroupId) return;
  const input = $("groupInfoMemberInput");
  const q = normalizeUsername(input && input.value);
  if (!q) return showToast("Search your contacts first.", "error");
  const match = Object.values(aaContactState).find((item) => {
    const u = item.user || {};
    return (u.username || "").toLowerCase() === q || (u.name || "").toLowerCase().includes(q);
  });
  if (!match) return showToast("Contact not found. Add them as contact first.", "error");
  db.ref("groups/" + currentGroupId).once("value")
    .then((groupSnap) => {
      const group = groupSnap.val();
      if (!group || group.adminUid !== currentUser.uid) throw new Error("Only group admin can add members.");
      if (group.members && group.members[match.uid]) throw new Error("Contact already in group.");
      const updates = {};
      updates["groups/" + currentGroupId + "/members/" + match.uid] = true;
      updates["userGroups/" + match.uid + "/" + currentGroupId] = { groupId: currentGroupId, joinedAt: Date.now() };
      return db.ref().update(updates);
    })
    .then(() => {
      if (input) input.value = "";
      showToast("Member added.", "success");
      openGroupInfo(currentGroupId);
    })
    .catch((error) => showToast(error.message, "error"));
};

document.addEventListener("DOMContentLoaded", () => {
  setListFilter("all");
});
