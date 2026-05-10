const firebaseConfig = {
  apiKey: "AIzaSyBphIOv0XFDE0AJORVO7dRSnnYnj2ABdXk",
  authDomain: "todo-app-ce884.firebaseapp.com",
  databaseURL: "https://todo-app-ce884-default-rtdb.firebaseio.com",
  projectId: "todo-app-ce884",
  storageBucket: "todo-app-ce884.firebasestorage.app",
  messagingSenderId: "68439117018",
  appId: "1:68439117018:web:21b3dcb792e181b12ce9e3"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

let currentUser = null;
let currentChatUser = null;
let currentChatUserName = null;

/* AUTH STATE */
auth.onAuthStateChanged(function(user) {
  if (user) {
    currentUser = user;

    document.getElementById("authSection").style.display = "none";
    document.getElementById("chatSection").style.display = "flex";

    db.ref("users/" + user.uid).once("value", function(snapshot) {
      const data = snapshot.val();
      document.getElementById("myName").innerText = data.name;
    });

    loadContacts();
    loadRequests();
  } else {
    document.getElementById("authSection").style.display = "flex";
    document.getElementById("chatSection").style.display = "none";
  }
});

/* TAB SWITCH */
function showTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
}

/* SIGNUP */
function signUp() {
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const photoURL = document.getElementById('photoURL').value.trim();

  if (!name || !email || !password) {
    alert('Please fill all fields');
    return;
  }

  auth.createUserWithEmailAndPassword(email, password)
    .then(result => {
      return db.ref('users/' + result.user.uid).set({
        name,
        email,
        photoURL
      });
    })
    .then(() => alert('Account created successfully!'))
    .catch(err => alert(err.message));
}

/* LOGIN */
function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  auth.signInWithEmailAndPassword(email, password)
    .catch(err => alert(err.message));
}

/* LOGOUT */
function logout() {
  auth.signOut();
}

/* SEARCH USER */
function searchUser() {
  const keyword = document
    .getElementById("searchInput")
    .value
    .trim()
    .toLowerCase();

  const resultDiv = document.getElementById("searchResult");
  resultDiv.innerHTML = "";

  if (!keyword) {
    resultDiv.innerHTML =
      '<div class="search-item">Enter name or email to search</div>';
    return;
  }

  // IMPORTANT: use db, not database
  db.ref("users")
    .once("value")
    .then(function(snapshot) {
      let found = false;

      snapshot.forEach(function(child) {
        const user = child.val();
        const uid = child.key;

        // Don't show yourself
        if (uid === currentUser.uid) return;

        const userName = (user.name || "").toLowerCase();
        const userEmail = (user.email || "").toLowerCase();

        const matches =
          userName.includes(keyword) ||
          userEmail.includes(keyword);

        if (!matches) return;

        found = true;

        const div = document.createElement("div");
        div.className = "search-item";

        div.innerHTML = `
          <strong>${user.name}</strong><br>
          <small>${user.email}</small>
          <div class="item-actions">
            <button disabled>Loading...</button>
          </div>
        `;

        resultDiv.appendChild(div);

        const actionContainer = div.querySelector(".item-actions");

        // Check if already added as friend
        db.ref("contacts/" + currentUser.uid + "/" + uid)
          .once("value")
          .then(function(contactSnap) {
            if (contactSnap.exists()) {
              actionContainer.innerHTML = `
                <button disabled style="background:#28a745;color:white;">
                  Friend Added
                </button>
              `;
              return;
            }

            // Check if request already sent
            return db
              .ref("requests/" + uid + "/" + currentUser.uid)
              .once("value")
              .then(function(requestSnap) {
                if (requestSnap.exists()) {
                  actionContainer.innerHTML = `
                    <button disabled style="background:#6c757d;color:white;">
                      Request Sent
                    </button>
                  `;
                } else {
                  actionContainer.innerHTML = `
                    <button class="add-btn"
                      onclick="sendRequest('${uid}')">
                      Add
                    </button>
                  `;
                }
              });
          });
      });

      // Show "No user found"
      setTimeout(function() {
        if (!found && resultDiv.innerHTML === "") {
          resultDiv.innerHTML =
            '<div class="search-item">No user found</div>';
        }
      }, 300);
    })
    .catch(function(error) {
      console.error("Search Error:", error);
      resultDiv.innerHTML =
        '<div class="search-item">Error searching users</div>';
    });
}

/* SEND REQUEST */
function sendRequest(toUid) {
  db.ref("users/" + currentUser.uid)
    .once("value")
    .then(function(snapshot) {
      const myData = snapshot.val();

      return db
        .ref("requests/" + toUid + "/" + currentUser.uid)
        .set({
          fromUid: currentUser.uid,
          fromName: myData.name
        });
    })
    .then(function() {
      // Refresh search result => Add becomes Request Sent
      searchUser();
    })
    .catch(function(error) {
      console.error("Request Error:", error);
      alert(error.message);
    });
}

/* LOAD REQUESTS */
function loadRequests() {
  const requestList = document.getElementById('requestList');

  db.ref('requests/' + currentUser.uid).on('value', function(snapshot) {
    requestList.innerHTML = '';

    snapshot.forEach(function(child) {
      const req = child.val();
      const fromUid = child.key;

      const div = document.createElement('div');
      div.className = 'request-item';
      div.innerHTML = `
        <strong>${req.fromName}</strong>
        <div class="item-actions">
          <button class="accept-btn" onclick="acceptRequest('${fromUid}', '${req.fromName}')">Accept</button>
          <button class="reject-btn" onclick="rejectRequest('${fromUid}')">Reject</button>
        </div>
      `;

      requestList.appendChild(div);
    });
  });
}

/* ACCEPT REQUEST */
function acceptRequest(fromUid, fromName) {
  db.ref('users/' + currentUser.uid).once('value', function(snapshot) {
    const myData = snapshot.val();

    const updates = {};

    updates['contacts/' + currentUser.uid + '/' + fromUid] = {
      uid: fromUid,
      name: fromName
    };

    updates['contacts/' + fromUid + '/' + currentUser.uid] = {
      uid: currentUser.uid,
      name: myData.name
    };

    updates['requests/' + currentUser.uid + '/' + fromUid] = null;

    db.ref().update(updates);
  });
  searchUser();
}

/* REJECT REQUEST */
function rejectRequest(fromUid) {
  db.ref('requests/' + currentUser.uid + '/' + fromUid).remove();
  searchUser();
}

/* LOAD CONTACTS */
function loadContacts() {
  const userList = document.getElementById('userList');

  db.ref('contacts/' + currentUser.uid).on('value', function(snapshot) {
    userList.innerHTML = '';

    snapshot.forEach(function(child) {
      const contact = child.val();

      const div = document.createElement('div');
      div.className = 'contact-item';
      div.innerHTML = `<strong>${contact.name}</strong>`;
      div.onclick = function() {
        openChat(contact.uid, contact.name);
      };

      userList.appendChild(div);
    });
  });
}

/* OPEN CHAT */
function openChat(uid, name) {
  currentChatUser = uid;
  currentChatUserName = name;

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('chatContainer').style.display = 'flex';
  document.getElementById('chatContainer').style.flexDirection = 'column';
  document.getElementById('chatWithName').innerText = name;

  loadMessages();
}

/* BACK */
function goBack() {
  currentChatUser = null;
  document.getElementById('chatContainer').style.display = 'none';
  document.getElementById('emptyState').style.display = 'flex';
}

/* CHAT ID */
function getChatId(a, b) {
  return a < b ? a + '_' + b : b + '_' + a;
}

/* SEND MESSAGE */
function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();

  if (!text || !currentChatUser) return;

  db.ref('users/' + currentUser.uid).once('value', function(snapshot) {
    const me = snapshot.val();
    const chatId = getChatId(currentUser.uid, currentChatUser);

    db.ref('chats/' + chatId + '/messages').push({
      senderId: currentUser.uid,
      senderName: me.name,
      text,
      timestamp: Date.now()
    });

    input.value = '';
  });
}

/* LOAD MESSAGES */
function loadMessages() {
  const messages = document.getElementById('messages');
  const chatId = getChatId(currentUser.uid, currentChatUser);

  db.ref('chats/' + chatId + '/messages').off();

  db.ref('chats/' + chatId + '/messages').on('value', function(snapshot) {
    messages.innerHTML = '';

    snapshot.forEach(function(child) {
      const msg = child.val();

      const div = document.createElement('div');
      div.className = 'message';

      if (msg.senderId === currentUser.uid) {
        div.classList.add('self');
      }

      div.innerHTML = `
        <div class="bubble">
          <div class="sender">${msg.senderName}</div>
          <div>${msg.text}</div>
        </div>
      `;

      messages.appendChild(div);
    });

    messages.scrollTop = messages.scrollHeight;
  });
}

/* ENTER TO SEND */
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('messageInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
});