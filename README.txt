The A&A Vault - Premium Chat App

This ZIP is updated for the new Firebase project:
Project ID: the-aa-vault

Important fixes in this version:
- New Firebase config added in app.js
- Signup denied issue fixed for auth-only/locked database rules
- Signup now creates Firebase Auth user first, then saves username/profile after login
- Friend request undefined username fix included
- Push/Blaze/Cloud Functions removed
- Free in-app alerts only
- Premium UI with dark/light mode

Firebase setup required:
1. Firebase Console > Authentication > Sign-in method > Email/Password > Enable
2. Firebase Console > Realtime Database > Create Database
3. Realtime Database > Rules > paste these rules and Publish:

{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}

Important:
- Keep app.js databaseURL same as your Realtime Database URL.
- Current app.js uses:
  https://the-aa-vault-default-rtdb.firebaseio.com
- If Firebase shows a different database URL, replace databaseURL in app.js.

How to test:
1. Run app with VS Code Live Server / localhost / HTTPS hosting.
2. Create a new account with username, name, email and password.
3. Login with username or email.
4. Search another username and send friend request.
5. Accept request and start chat.

Free alerts:
This version does not need Blaze plan. It supports in-app sound, toast, unread badge and title alert while the app is open.
Real background notifications when the app is fully closed are not included because those need backend/Blaze or another push service.

Firebase Hosting deploy optional:
firebase deploy --only hosting,database --project the-aa-vault
