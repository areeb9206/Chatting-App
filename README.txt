The A&A Vault - Premium Free Alerts Build

Updated fixes in this build:
- Signup page opens first for new users.
- Search button stays hidden until the user starts typing.
- Search works with Enter key from the keyboard.
- Mobile/WebView chat back button returns to the contact list instead of closing the app.
- Browser/Android back button now closes the open chat/account panel first.
- Added WebView/mobile scroll protection to stop pull-to-refresh while chatting.
- Chat messages, contact list, search results and account panel have smooth mobile scrolling.
- Premium dark/light theme and free in-app alerts are included.

Firebase setup:
1. Enable Authentication > Email/Password.
2. Create Realtime Database.
3. Use these development rules while testing:
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}

Note for APK/WebIntoApp:
- Browser/app-closed push notifications are not included because Firebase Cloud Functions requires Blaze billing.
- This build uses free in-app alerts only.
- If Android shows a security warning while installing APK, it usually comes from installing an APK outside Play Store/unknown sources or the WebView wrapper/signing, not from this frontend code. Build the APK from the official dashboard, sign it properly, avoid extra permissions, and test on another device.
