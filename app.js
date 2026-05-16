const firebaseConfig = {
  apiKey: "AIzaSyBphIOv0XFDE0AJORVO7dRSnnYnj2ABdXk",
  authDomain: "todo-app-ce884.firebaseapp.com",
  databaseURL: "https://todo-app-ce884-default-rtdb.firebaseio.com",
  projectId: "todo-app-ce884",
  storageBucket: "todo-app-ce884.firebasestorage.app",
  messagingSenderId: "68439117018",
  appId: "1:68439117018:web:21b3dcb792e181b12ce9e3",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

let currentUser = null;
let currentChatUser = null;
let replyMessage = null;

function getProfilePhoto(photoURL, name) {
  if (photoURL && photoURL.trim() !== "") return photoURL;

  return (
    "https://ui-avatars.com/api/?name=" +
    encodeURIComponent(name || "User") +
    "&background=075e54&color=fff"
  );
}

/* AUTH */
auth.onAuthStateChanged(function (user) {
  if (user) {
    currentUser = user;

    document.getElementById("authSection").style.display = "none";
    document.getElementById("chatSection").style.display = "flex";

    showEmptyState();
    loadMyProfile();
    loadContacts();
    loadRequests();
  } else {
    currentUser = null;
    currentChatUser = null;

    document.getElementById("authSection").style.display = "flex";
    document.getElementById("chatSection").style.display = "none";
  }
});

/* TABS */
function showTab(tabId, btn) {
  document.querySelectorAll(".tab-content").forEach(function (tab) {
    tab.classList.remove("active");
  });

  document.querySelectorAll(".tab-btn").forEach(function (b) {
    b.classList.remove("active");
  });

  document.getElementById(tabId).classList.add("active");
  btn.classList.add("active");
}

/* SIGNUP */
function signUp() {
  const username = document
    .getElementById("username")
    .value.trim()
    .toLowerCase();
  const name = document.getElementById("name").value.trim();
  const photoURL = document.getElementById("photoURL").value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();

  if (!username || !name || !email || !password) {
    alert("Please fill all fields.");
    return;
  }

  db.ref("users")
    .orderByChild("username")
    .equalTo(username)
    .once("value")
    .then(function (snapshot) {
      if (snapshot.exists()) {
        throw new Error("Username already taken.");
      }

      return auth.createUserWithEmailAndPassword(email, password);
    })
    .then(function (result) {
      return db.ref("users/" + result.user.uid).set({
        username: username,
        name: name,
        email: email,
        photoURL: photoURL || "",
      });
    })
    .then(function () {
      alert("Account created successfully!");
    })
    .catch(function (error) {
      alert(error.message);
    });
}

/* LOGIN */
function login() {
  const identifier = document
    .getElementById("loginIdentifier")
    .value.trim()
    .toLowerCase();
  const password = document.getElementById("loginPassword").value.trim();

  if (!identifier || !password) {
    alert("Please fill all fields.");
    return;
  }

  if (identifier.includes("@")) {
    auth
      .signInWithEmailAndPassword(identifier, password)
      .catch(function (error) {
        alert(error.message);
      });
    return;
  }

  db.ref("users")
    .orderByChild("username")
    .equalTo(identifier)
    .once("value")
    .then(function (snapshot) {
      if (!snapshot.exists()) {
        throw new Error("Username not found.");
      }

      let email = "";

      snapshot.forEach(function (child) {
        email = child.val().email;
      });

      return auth.signInWithEmailAndPassword(email, password);
    })
    .catch(function (error) {
      alert(error.message);
    });
}

/* FORGOT PASSWORD FROM LOGIN */
function forgotPassword() {
  const identifier = document
    .getElementById("loginIdentifier")
    .value.trim()
    .toLowerCase();

  if (!identifier) {
    alert("Enter your username or email first.");
    return;
  }

  if (identifier.includes("@")) {
    sendResetEmail(identifier);
    return;
  }

  db.ref("users")
    .orderByChild("username")
    .equalTo(identifier)
    .once("value")
    .then(function (snapshot) {
      if (!snapshot.exists()) {
        throw new Error("Username not found.");
      }

      let email = "";

      snapshot.forEach(function (child) {
        email = child.val().email;
      });

      sendResetEmail(email);
    })
    .catch(function (error) {
      alert(error.message);
    });
}

function sendResetEmail(email) {
  auth
    .sendPasswordResetEmail(email)
    .then(function () {
      alert("Password reset email sent!");
    })
    .catch(function (error) {
      alert(error.message);
    });
}

/* LOGOUT */
function logout() {
  auth.signOut();
}

/* PROFILE */
function loadMyProfile() {
  db.ref("users/" + currentUser.uid).once("value", function (snapshot) {
    const user = snapshot.val();
    if (!user) return;

    const photo = getProfilePhoto(user.photoURL, user.name);

    document.getElementById("myName").innerText = user.name;
    document.getElementById("myPhoto").src = photo;

    document.getElementById("accountPhoto").src = photo;
    document.getElementById("accountName").innerText = user.name;
    document.getElementById("accountUsername").innerText = user.username || "";
    document.getElementById("accountEmail").innerText = user.email || "";

    const newPhotoInput = document.getElementById("newPhotoURL");
    if (newPhotoInput) newPhotoInput.value = user.photoURL || "";
  });
}

/* UPDATE DP BY URL */
function updateProfilePhoto() {
  const newPhotoURL = document.getElementById("newPhotoURL").value.trim();

  db.ref("users/" + currentUser.uid)
    .update({
      photoURL: newPhotoURL,
    })
    .then(function () {
      alert("Profile picture updated!");
      loadMyProfile();
      loadContacts();
    })
    .catch(function (error) {
      alert(error.message);
    });
}

/* PASSWORD RESET FROM SETTINGS */
function sendPasswordReset() {
  const email = document.getElementById("accountEmail").innerText;

  if (!email) {
    alert("Email not found.");
    return;
  }

  sendResetEmail(email);
}

/* PANEL HELPERS */
function hideAllRightPanels() {
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("chatContainer").style.display = "none";
  document.getElementById("accountPanel").style.display = "none";
}

function showEmptyState() {
  hideAllRightPanels();
  document.getElementById("emptyState").style.display = "flex";
}

function openAccountPanel() {
  hideAllRightPanels();
  document.getElementById("accountPanel").style.display = "flex";
  loadMyProfile();

  if (window.innerWidth <= 768) {
    document.getElementById("rightPanel").classList.add("active");
  }
}

function closeAccountPanel() {
  document.getElementById("accountPanel").style.display = "none";

  if (currentChatUser) {
    document.getElementById("chatContainer").style.display = "flex";
  } else {
    document.getElementById("emptyState").style.display = "flex";

    if (window.innerWidth <= 768) {
      document.getElementById("rightPanel").classList.remove("active");
    }
  }
}

/* SEARCH */
function searchUser() {
  const keyword = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();
  const resultDiv = document.getElementById("searchResult");

  resultDiv.innerHTML = "";

  if (!keyword) return;

  db.ref("users")
    .once("value")
    .then(function (snapshot) {
      let found = false;

      snapshot.forEach(function (child) {
        const user = child.val();
        const uid = child.key;

        if (uid === currentUser.uid) return;

        const username = (user.username || "").toLowerCase();
        if (!username.includes(keyword)) return;

        found = true;

        const div = document.createElement("div");
        div.className = "search-item";

        div.innerHTML = `
        <strong>${user.name}</strong><br>
        <small>@${user.username}</small>
        <div class="item-actions">
          <button disabled>Loading...</button>
        </div>
      `;

        resultDiv.appendChild(div);

        const actionContainer = div.querySelector(".item-actions");

        db.ref("contacts/" + currentUser.uid + "/" + uid)
          .once("value")
          .then(function (contactSnap) {
            if (contactSnap.exists()) {
              actionContainer.innerHTML = `<button disabled style="background:#28a745;color:white;">Friend Added</button>`;
              return;
            }

            db.ref("requests/" + uid + "/" + currentUser.uid)
              .once("value")
              .then(function (requestSnap) {
                if (requestSnap.exists()) {
                  actionContainer.innerHTML = `<button disabled style="background:#6c757d;color:white;">Request Sent</button>`;
                } else {
                  actionContainer.innerHTML = `<button class="add-btn" onclick="sendRequest('${uid}')">Add</button>`;
                }
              });
          });
      });

      if (!found) {
        resultDiv.innerHTML = `<div class="search-item">No user found</div>`;
      }
    });
}

/* REQUEST SEND */
function sendRequest(toUid) {
  db.ref("users/" + currentUser.uid)
    .once("value")
    .then(function (snapshot) {
      const myData = snapshot.val();

      return db.ref("requests/" + toUid + "/" + currentUser.uid).set({
        fromUid: currentUser.uid,
        fromName: myData.name,
        fromUsername: myData.username,
        fromPhotoURL: myData.photoURL || "",
      });
    })
    .then(function () {
      searchUser();
    });
}

/* LOAD REQUESTS */
function loadRequests() {
  const requestList = document.getElementById("requestList");

  db.ref("requests/" + currentUser.uid).on("value", function (snapshot) {
    requestList.innerHTML = "";

    snapshot.forEach(function (child) {
      const req = child.val();
      const fromUid = child.key;
      const photo = getProfilePhoto(req.fromPhotoURL, req.fromName);

      const div = document.createElement("div");
      div.className = "request-item";

      div.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${photo}" class="contact-pic" />
          <div>
            <strong>${req.fromName}</strong><br>
            <small>@${req.fromUsername || ""}</small>
          </div>
        </div>

        <div class="item-actions">
          <button class="accept-btn" onclick="acceptRequest('${fromUid}')">Accept</button>
          <button class="reject-btn" onclick="rejectRequest('${fromUid}')">Reject</button>
        </div>
      `;

      requestList.appendChild(div);
    });
  });
}

/* ACCEPT REQUEST */
function acceptRequest(fromUid) {
  Promise.all([
    db.ref("users/" + currentUser.uid).once("value"),
    db.ref("users/" + fromUid).once("value"),
  ])
    .then(function ([mySnap, senderSnap]) {
      const myData = mySnap.val();
      const senderData = senderSnap.val();

      const updates = {};

      updates["contacts/" + currentUser.uid + "/" + fromUid] = {
        uid: fromUid,
        name: senderData.name,
        username: senderData.username || "",
        photoURL: senderData.photoURL || "",
      };

      updates["contacts/" + fromUid + "/" + currentUser.uid] = {
        uid: currentUser.uid,
        name: myData.name,
        username: myData.username || "",
        photoURL: myData.photoURL || "",
      };

      updates["requests/" + currentUser.uid + "/" + fromUid] = null;

      return db.ref().update(updates);
    })
    .then(function () {
      document.getElementById("searchInput").value = "";
      document.getElementById("searchResult").innerHTML = "";
    });
}

/* REJECT */
function rejectRequest(fromUid) {
  db.ref("requests/" + currentUser.uid + "/" + fromUid).remove();
}

/* CONTACTS */
function loadContacts() {
  const userList = document.getElementById("userList");

  db.ref("contacts/" + currentUser.uid).on("value", function (snapshot) {
    userList.innerHTML = "";

    snapshot.forEach(function (child) {
      const contact = child.val();
      const photo = getProfilePhoto(contact.photoURL, contact.name);

      const div = document.createElement("div");
      div.className = "contact-item";

      div.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${photo}" class="contact-pic" />
          <div>
            <strong>${contact.name}</strong><br>
            <small>@${contact.username || ""}</small>
          </div>
        </div>
      `;

      div.onclick = function () {
        openChat(contact.uid, contact.name, contact.photoURL || "");
      };

      userList.appendChild(div);
    });
  });
}

/* OPEN CHAT */
function openChat(uid, name, photoURL = "") {
  currentChatUser = uid;
  const photo = getProfilePhoto(photoURL, name);

  hideAllRightPanels();

  document.getElementById("chatPhoto").src = photo;
  document.getElementById("chatWithName").innerText = name;
  document.getElementById("chatContainer").style.display = "flex";

  if (window.innerWidth <= 768) {
    document.getElementById("rightPanel").classList.add("active");
  }

  loadMessages();
}

/* BACK FROM CHAT */
function goBack() {
  currentChatUser = null;

  hideAllRightPanels();
  document.getElementById("emptyState").style.display = "flex";

  if (window.innerWidth <= 768) {
    document.getElementById("rightPanel").classList.remove("active");
  }
}

/* CHAT ID */
function getChatId(a, b) {
  return a < b ? a + "_" + b : b + "_" + a;
}

/* SEND MESSAGE */
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();

  if (!text || !currentChatUser) return;

  db.ref("users/" + currentUser.uid).once("value", function (snapshot) {
    const me = snapshot.val();
    const chatId = getChatId(currentUser.uid, currentChatUser);

    const messageData = {
      senderId: currentUser.uid,
      senderName: me.name,
      text: text,
      timestamp: Date.now(),
    };

    if (replyMessage) {
      messageData.replyTo = {
        senderName: replyMessage.senderName,
        text: replyMessage.text,
      };
    }

    db.ref("chats/" + chatId + "/messages").push(messageData);

    input.value = "";
    cancelReply();
  });
}

function replyToMessage(msg) {
  replyMessage = msg;

  document.getElementById("replyPreview").style.display = "flex";
  document.getElementById("replyName").innerText = msg.senderName;
  document.getElementById("replyText").innerText = msg.text;

  document.getElementById("messageInput").focus();
}

function cancelReply() {
  replyMessage = null;

  document.getElementById("replyPreview").style.display = "none";
  document.getElementById("replyName").innerText = "";
  document.getElementById("replyText").innerText = "";
}

/* LOAD MESSAGES */
function loadMessages() {
  const messages = document.getElementById("messages");
  const chatId = getChatId(currentUser.uid, currentChatUser);

  db.ref("chats/" + chatId + "/messages").off();

  db.ref("chats/" + chatId + "/messages").on("value", function (snapshot) {
    messages.innerHTML = "";

    snapshot.forEach(function (child) {
      const msg = child.val();
      const messageId = child.key;

      const time = new Date(msg.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const div = document.createElement("div");
      div.className = "message";

      if (msg.senderId === currentUser.uid) {
        div.classList.add("self");
      }

      let replyHTML = "";

      if (msg.replyTo) {
        replyHTML = `
          <div class="replied-message">
            <strong>${msg.replyTo.senderName}</strong>
            <p>${msg.replyTo.text}</p>
          </div>
        `;
      }

      div.innerHTML = `
        <div class="msg-wrapper">
          <div class="bubble">
            ${replyHTML}
            <div class="sender">${msg.senderName}</div>
            <div>${msg.text}</div>
            <div class="msg-time">${time}</div>
          </div>

          <div class="msg-menu-wrap">
            <button class="msg-dots" onclick="toggleMessageMenu('${messageId}')">⋮</button>

            <div id="msgMenu-${messageId}" class="msg-menu">
              <button onclick='replyToMessage(${JSON.stringify(
                msg
              )}, "${messageId}")'>
                Reply
              </button>
            </div>
          </div>
        </div>
      `;

      messages.appendChild(div);
    });

    messages.scrollTop = messages.scrollHeight;
  });
}
function toggleMessageMenu(messageId) {
  document.querySelectorAll(".msg-menu").forEach(function (menu) {
    if (menu.id !== "msgMenu-" + messageId) {
      menu.classList.remove("show");
    }
  });

  const menu = document.getElementById("msgMenu-" + messageId);
  if (menu) {
    menu.classList.toggle("show");
  }
}

function replyToMessage(msg, messageId) {
  replyMessage = {
    senderName: msg.senderName,
    text: msg.text,
  };

  document.getElementById("replyPreview").style.display = "flex";
  document.getElementById("replyName").innerText = msg.senderName;
  document.getElementById("replyText").innerText = msg.text;

  const menu = document.getElementById("msgMenu-" + messageId);
  if (menu) menu.classList.remove("show");

  document.getElementById("messageInput").focus();
}
document.addEventListener("click", function (e) {
  if (
    !e.target.classList.contains("msg-dots") &&
    !e.target.closest(".msg-menu")
  ) {
    document.querySelectorAll(".msg-menu").forEach(function (menu) {
      menu.classList.remove("show");
    });
  }
});
/* DOM READY */
document.addEventListener("DOMContentLoaded", function () {
  const messageInput = document.getElementById("messageInput");
  const searchInput = document.getElementById("searchInput");

  if (messageInput) {
    messageInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        sendMessage();
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        searchUser();
      }
    });
  }
});

/* RESIZE */
window.addEventListener("resize", function () {
  const rightPanel = document.getElementById("rightPanel");

  if (window.innerWidth > 768) {
    rightPanel.classList.remove("active");
    rightPanel.style.display = "flex";
  } else {
    rightPanel.style.display = "";
  }
});
