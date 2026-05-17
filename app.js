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
let currentChatUserName = "";
let currentChatId = null;

let replyMessage = null;
let typingTimer = null;

let currentMessagesRef = null;
let currentStatusRef = null;
let currentTypingRef = null;

let editingMessageId = null;
let editingChatId = null;

/* HELPERS */
function getProfilePhoto(photoURL, name) {
  if (photoURL && photoURL.trim() !== "") return photoURL;

  return (
    "https://ui-avatars.com/api/?name=" +
    encodeURIComponent(name || "User") +
    "&background=075e54&color=fff"
  );
}

function escapeHtml(text) {
  if (text === undefined || text === null) return "";

  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    setOnlineStatus();
  } else {
    currentUser = null;
    currentChatUser = null;
    currentChatId = null;

    document.getElementById("chatSection").style.display = "none";
    document.getElementById("authSection").style.display = "flex";
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
  const username = document.getElementById("username").value.trim().toLowerCase();
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
  const identifier = document.getElementById("loginIdentifier").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value.trim();

  if (!identifier || !password) {
    alert("Please fill all fields.");
    return;
  }

  if (identifier.includes("@")) {
    auth.signInWithEmailAndPassword(identifier, password).catch(function (error) {
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

/* FORGOT PASSWORD */
function forgotPassword() {
  const identifier = document.getElementById("loginIdentifier").value.trim().toLowerCase();

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

function sendPasswordReset() {
  const email = document.getElementById("accountEmail").innerText;

  if (!email) {
    alert("Email not found.");
    return;
  }

  sendResetEmail(email);
}

/* PANELS */
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
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
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
          <strong>${escapeHtml(user.name)}</strong><br>
          <small>@${escapeHtml(user.username)}</small>
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
              actionContainer.innerHTML =
                `<button disabled style="background:#28a745;color:white;">Friend Added</button>`;
              return;
            }

            db.ref("requests/" + uid + "/" + currentUser.uid)
              .once("value")
              .then(function (requestSnap) {
                if (requestSnap.exists()) {
                  actionContainer.innerHTML =
                    `<button disabled style="background:#6c757d;color:white;">Request Sent</button>`;
                } else {
                  actionContainer.innerHTML =
                    `<button class="add-btn" onclick="sendRequest('${uid}')">Add</button>`;
                }
              });
          });
      });

      if (!found) {
        resultDiv.innerHTML = `<div class="search-item">No user found</div>`;
      }
    });
}

/* REQUESTS */
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
            <strong>${escapeHtml(req.fromName)}</strong><br>
            <small>@${escapeHtml(req.fromUsername || "")}</small>
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

      db.ref("users/" + contact.uid).once("value", function (userSnap) {
        const userData = userSnap.val();
        if (!userData) return;

        const photo = getProfilePhoto(userData.photoURL, userData.name);
        const chatId = getChatId(currentUser.uid, contact.uid);

        const div = document.createElement("div");
        div.className = "contact-item";
        div.id = "contact-" + contact.uid;

        div.innerHTML = `
          <div class="contact-pic-wrapper">
            <img src="${photo}" class="contact-pic">
            <span class="status-dot" id="status-${contact.uid}"></span>
          </div>

          <div class="contact-info">
            <div class="contact-top">
              <strong>${escapeHtml(userData.name)}</strong>

              <span class="unread-badge"
                id="unread-${contact.uid}"
                style="display:none;">
                0
              </span>
            </div>

            <div class="contact-bottom">
              <div class="last-message" id="lastMsg-${contact.uid}">
                No messages yet
              </div>

              <span class="last-msg-time" id="lastTime-${contact.uid}"></span>
            </div>
          </div>
        `;

        div.onclick = function () {
          openChat(contact.uid, userData.name, userData.photoURL || "");
        };

        userList.appendChild(div);

        db.ref("status/" + contact.uid).on("value", function (statusSnap) {
          const dot = document.getElementById("status-" + contact.uid);
          if (!dot) return;

          const status = statusSnap.val();

          if (status && status.state === "online") {
            dot.classList.add("online");
            dot.classList.remove("offline");
          } else {
            dot.classList.add("offline");
            dot.classList.remove("online");
          }
        });

        db.ref("lastMessages/" + chatId).on("value", function (lastSnap) {
          const lastMsgDiv = document.getElementById("lastMsg-" + contact.uid);
          const lastTimeDiv = document.getElementById("lastTime-" + contact.uid);

          if (!lastMsgDiv || !lastTimeDiv) return;

          if (!lastSnap.exists()) {
            lastMsgDiv.innerText = "No messages yet";
            lastTimeDiv.innerText = "";
            return;
          }

          const msg = lastSnap.val();

          if (msg.senderId !== currentUser.uid) {
            markChatAsDelivered(chatId);
          }

          const prefix = msg.senderId === currentUser.uid ? "You: " : "";
          let preview = msg.text || "";

          if (preview.length > 30) {
            preview = preview.slice(0, 30) + "...";
          }

          const time = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          lastMsgDiv.innerText = prefix + preview;
          lastTimeDiv.innerText = time;
        });

        db.ref("unread/" + currentUser.uid + "/" + chatId).on(
          "value",
          function (unreadSnap) {
            const badge = document.getElementById("unread-" + contact.uid);
            if (!badge) return;

            const count = unreadSnap.val();

            if (count && count > 0) {
              badge.innerText = count;
              badge.style.display = "inline-flex";
            } else {
              badge.innerText = "0";
              badge.style.display = "none";
            }
          }
        );
      });
    });
  });
}

/* DELIVERED */
function markChatAsDelivered(chatId) {
  if (!currentUser) return;

  db.ref("chats/" + chatId + "/messages")
    .once("value")
    .then(function (snapshot) {
      const updates = {};

      snapshot.forEach(function (child) {
        const msg = child.val();
        const messageId = child.key;

        if (msg.senderId !== currentUser.uid && msg.delivered !== true) {
          updates["chats/" + chatId + "/messages/" + messageId + "/delivered"] = true;
        }
      });

      if (Object.keys(updates).length > 0) {
        return db.ref().update(updates);
      }
    });
}

/* OPEN CHAT */
function openChat(uid, name, photoURL = "") {
  currentChatUser = uid;
  currentChatUserName = name;

  const chatId = getChatId(currentUser.uid, uid);
  currentChatId = chatId;

  db.ref("unread/" + currentUser.uid + "/" + chatId).remove();

  const photo = getProfilePhoto(photoURL, name);

  hideAllRightPanels();

  document.getElementById("chatPhoto").src = photo;
  document.getElementById("chatWithName").innerText = name;

  document.getElementById("chatContainer").style.display = "flex";
  document.getElementById("chatContainer").style.flexDirection = "column";

  if (window.innerWidth <= 768) {
    document.getElementById("rightPanel").classList.add("active");
  }

  listenChatStatus(uid);
  listenTypingStatus(uid);
  loadMessages();

  setTimeout(function () {
    markCurrentChatAsSeen();
  }, 300);
}

/* BACK */
function goBack() {
  currentChatUser = null;
  currentChatUserName = "";
  currentChatId = null;

  if (currentMessagesRef) {
    currentMessagesRef.off();
    currentMessagesRef = null;
  }

  if (currentStatusRef) {
    currentStatusRef.off();
    currentStatusRef = null;
  }

  if (currentTypingRef) {
    currentTypingRef.off();
    currentTypingRef = null;
  }

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
    const newMsgRef = db.ref("chats/" + chatId + "/messages").push();

    const messageData = {
      messageId: newMsgRef.key,
      senderId: currentUser.uid,
      senderName: me.name,
      text: text,
      timestamp: Date.now(),
      delivered: false,
      seen: false,
      edited: false,
      deleted: false,
    };

    if (replyMessage) {
      messageData.replyTo = {
        senderName: replyMessage.senderName,
        text: replyMessage.text,
      };
    }

    const updates = {};

    updates["chats/" + chatId + "/messages/" + newMsgRef.key] = messageData;

    updates["lastMessages/" + chatId] = {
      messageId: newMsgRef.key,
      senderId: currentUser.uid,
      senderName: me.name,
      text: text,
      timestamp: messageData.timestamp,
    };

    updates["unread/" + currentChatUser + "/" + chatId] =
      firebase.database.ServerValue.increment(1);

    db.ref()
      .update(updates)
      .then(function () {
        input.value = "";
        cancelReply();
      });
  });
}

/* REPLY */
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

  if (currentMessagesRef) {
    currentMessagesRef.off();
  }

  currentMessagesRef = db.ref("chats/" + chatId + "/messages");

  currentMessagesRef.on("value", function (snapshot) {
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

      if (msg.replyTo && !msg.deleted) {
        replyHTML = `
          <div class="replied-message">
            <strong>${escapeHtml(msg.replyTo.senderName)}</strong>
            <p>${escapeHtml(msg.replyTo.text)}</p>
          </div>
        `;
      }

      let tickSymbol = "✓";
      let tickClass = "";

      if (msg.seen === true) {
        tickSymbol = "✓✓";
        tickClass = "seen";
      } else if (msg.delivered === true) {
        tickSymbol = "✓✓";
      }

      const ticksHTML =
        msg.senderId === currentUser.uid
          ? `<span class="ticks ${tickClass}">${tickSymbol}</span>`
          : "";

      let messageBodyHTML = "";

      if (msg.deleted) {
        messageBodyHTML = `
          <div class="deleted-text">
            This message was deleted
          </div>
        `;
      } else if (editingMessageId === messageId && editingChatId === chatId) {
        messageBodyHTML = `
          <div class="edit-message-box">
            <input
              type="text"
              id="editInput-${messageId}"
              class="edit-message-input"
              value="${escapeHtml(msg.text)}"
            />

            <div class="edit-actions">
              <button onclick="saveEditedMessage('${chatId}', '${messageId}')">
                Save
              </button>

              <button class="cancel-edit-btn" onclick="cancelEditMessage()">
                Cancel
              </button>
            </div>
          </div>
        `;
      } else {
        messageBodyHTML = `
          <div>
            ${escapeHtml(msg.text)}
            ${
              msg.edited
                ? `<span class="edited-label">edited</span>`
                : ""
            }
          </div>
        `;
      }

      let menuHTML = "";

      if (!msg.deleted) {
        menuHTML = `
          <div class="msg-menu-wrap">
            <button class="msg-dots" onclick="toggleMessageMenu('${messageId}')">⋮</button>

            <div id="msgMenu-${messageId}" class="msg-menu">
              <button onclick="replyToMessageById('${chatId}', '${messageId}')">
                Reply
              </button>

              ${
                msg.senderId === currentUser.uid
                  ? `<button onclick="startEditMessage('${chatId}', '${messageId}')">
                      Edit
                    </button>`
                  : ""
              }

              ${
                msg.senderId === currentUser.uid
                  ? `<button class="delete-menu-btn" onclick="deleteMessageForEveryone('${chatId}', '${messageId}')">
                      Delete for everyone
                    </button>`
                  : ""
              }
            </div>
          </div>
        `;
      }

      div.innerHTML = `
        <div class="msg-wrapper">
          <div class="bubble">
            ${replyHTML}

            <div class="sender">
              ${escapeHtml(msg.senderName)}
            </div>

            ${messageBodyHTML}

            <div class="message-meta">
              <span class="msg-time">${time}</span>
              ${ticksHTML}
            </div>
          </div>

          ${menuHTML}
        </div>
      `;

      messages.appendChild(div);
    });

    messages.scrollTop = messages.scrollHeight;

    if (currentChatId === chatId && currentChatUser && !document.hidden) {
      markCurrentChatAsSeen();
    }
  });
}

/* MESSAGE MENU */
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

/* REPLY BY ID */
function replyToMessageById(chatId, messageId) {
  db.ref("chats/" + chatId + "/messages/" + messageId)
    .once("value")
    .then(function (snapshot) {
      const msg = snapshot.val();

      if (!msg || msg.deleted) return;

      replyToMessage(msg, messageId);
    });
}

/* EDIT MESSAGE INLINE */
function startEditMessage(chatId, messageId) {
  editingChatId = chatId;
  editingMessageId = messageId;

  document.querySelectorAll(".msg-menu").forEach(function (menu) {
    menu.classList.remove("show");
  });

  loadMessages();

  setTimeout(function () {
    const input = document.getElementById("editInput-" + messageId);
    if (input) {
      input.focus();
      input.select();

      input.addEventListener("keypress", function (e) {
        if (e.key === "Enter") {
          saveEditedMessage(chatId, messageId);
        }
      });
    }
  }, 200);
}

function cancelEditMessage() {
  editingChatId = null;
  editingMessageId = null;
  loadMessages();
}

function saveEditedMessage(chatId, messageId) {
  const input = document.getElementById("editInput-" + messageId);
  if (!input) return;

  const updatedText = input.value.trim();

  if (!updatedText) {
    alert("Message can't be empty.");
    return;
  }

  const updates = {};

  updates["chats/" + chatId + "/messages/" + messageId + "/text"] = updatedText;
  updates["chats/" + chatId + "/messages/" + messageId + "/edited"] = true;

  db.ref("lastMessages/" + chatId).once("value", function (snapshot) {
    const lastMsg = snapshot.val();

    if (lastMsg && lastMsg.messageId === messageId) {
      updates["lastMessages/" + chatId + "/text"] = updatedText;
    }

    db.ref()
      .update(updates)
      .then(function () {
        editingChatId = null;
        editingMessageId = null;
      });
  });
}

/* DELETE MESSAGE */
function deleteMessageForEveryone(chatId, messageId) {
  const confirmDelete = confirm("Delete this message for everyone?");

  if (!confirmDelete) return;

  const updates = {};

  updates["chats/" + chatId + "/messages/" + messageId + "/deleted"] = true;
  updates["chats/" + chatId + "/messages/" + messageId + "/text"] = "";
  updates["chats/" + chatId + "/messages/" + messageId + "/replyTo"] = null;

  db.ref("lastMessages/" + chatId).once("value", function (snapshot) {
    const lastMsg = snapshot.val();

    if (lastMsg && lastMsg.messageId === messageId) {
      updates["lastMessages/" + chatId + "/text"] = "This message was deleted";
    }

    db.ref().update(updates);
  });
}

/* SEEN */
function markCurrentChatAsSeen() {
  if (!currentUser || !currentChatUser || !currentChatId) return;
  if (document.hidden) return;

  db.ref("chats/" + currentChatId + "/messages")
    .once("value")
    .then(function (snapshot) {
      const updates = {};

      snapshot.forEach(function (child) {
        const msg = child.val();
        const messageId = child.key;

        if (msg.senderId !== currentUser.uid && msg.seen !== true) {
          updates["chats/" + currentChatId + "/messages/" + messageId + "/seen"] = true;
          updates["chats/" + currentChatId + "/messages/" + messageId + "/delivered"] = true;
        }
      });

      if (Object.keys(updates).length > 0) {
        return db.ref().update(updates);
      }
    });
}

/* ONLINE STATUS */
function setOnlineStatus() {
  if (!currentUser) return;

  const statusRef = db.ref("status/" + currentUser.uid);

  statusRef.update({
    state: "online",
    lastSeen: Date.now(),
  });

  statusRef.onDisconnect().update({
    state: "offline",
    lastSeen: Date.now(),
  });
}

function listenChatStatus(uid) {
  if (currentStatusRef) {
    currentStatusRef.off();
  }

  currentStatusRef = db.ref("status/" + uid);

  currentStatusRef.on("value", function (snapshot) {
    const status = snapshot.val();
    const statusDiv = document.getElementById("chatStatus");

    if (!statusDiv) return;

    if (!status) {
      statusDiv.innerText = "Offline";
      return;
    }

    if (status.state === "online") {
      statusDiv.innerText = "Online";
    } else {
      const time = new Date(status.lastSeen).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      statusDiv.innerText = "Last seen " + time;
    }
  });
}

/* TYPING */
function handleTyping() {
  if (!currentUser || !currentChatUser) return;

  const chatId = getChatId(currentUser.uid, currentChatUser);

  db.ref("typing/" + chatId + "/" + currentUser.uid).set(true);

  clearTimeout(typingTimer);

  typingTimer = setTimeout(function () {
    db.ref("typing/" + chatId + "/" + currentUser.uid).remove();
  }, 1500);
}

function listenTypingStatus(otherUid) {
  if (currentTypingRef) {
    currentTypingRef.off();
  }

  const chatId = getChatId(currentUser.uid, otherUid);
  currentTypingRef = db.ref("typing/" + chatId + "/" + otherUid);

  currentTypingRef.on("value", function (snapshot) {
    const isTyping = snapshot.val();

    if (isTyping) {
      document.getElementById("chatStatus").innerText = "typing...";
    } else {
      updateChatHeaderStatus(otherUid);
    }
  });
}

function updateChatHeaderStatus(uid) {
  db.ref("status/" + uid).once("value", function (snapshot) {
    const status = snapshot.val();
    const statusDiv = document.getElementById("chatStatus");

    if (!statusDiv) return;

    if (status && status.state === "online") {
      statusDiv.innerText = "Online";
    } else if (status && status.lastSeen) {
      const time = new Date(status.lastSeen).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      statusDiv.innerText = "Last seen " + time;
    } else {
      statusDiv.innerText = "Offline";
    }
  });
}

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

    messageInput.addEventListener("input", function () {
      handleTyping();
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

document.addEventListener("visibilitychange", function () {
  if (!document.hidden && currentChatUser) {
    markCurrentChatAsSeen();
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