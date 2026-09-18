/* ============================================================
   FIREBASE SETUP
   1. console.firebase.google.com -> Add project (Analytics off).
   2. Build -> Authentication -> Get started -> Sign-in method ->
      enable "Email/Password".
   3. Build -> Firestore Database -> Create database -> production
      mode is fine now since we're using real Security Rules below
      (paste them into the Rules tab).
   4. Project settings -> General -> Your apps -> </> -> register ->
      copy the config -> paste below.

   This file must be loaded (via <script src="js/firebase-config.js">)
   AFTER the three firebase-*-compat.js SDK scripts, and BEFORE
   js/shared.js and any page-specific script.
============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyAFMg6aJIKExIc8S3VanB-NHnIZfLpng5s",
  authDomain: "pta-monitoring-system-4e00a.firebaseapp.com",
  projectId: "pta-monitoring-system-4e00a",
  storageBucket: "pta-monitoring-system-4e00a.firebasestorage.app",
  messagingSenderId: "293969719152",
  appId: "1:293969719152:web:7dd2027df8cf41c685a9b5"
};

/* Paste this into Firestore Database -> Rules tab in the console:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function myAccount() { return get(/databases/$(database)/documents/accounts/$(request.auth.uid)).data; }
    function myRole() { return myAccount().role; }

    match /accounts/{uid} {
      allow read: if isSignedIn() && (request.auth.uid == uid || myRole() in ['admin','principal']);
      allow create: if isSignedIn() && (myRole() == 'admin' || !exists(/databases/$(database)/documents/accounts/$(request.auth.uid)));
      allow update, delete: if isSignedIn() && myRole() == 'admin';
    }
    match /students/{studentId} {
      allow read: if isSignedIn() && (
        myRole() == 'admin' || myRole() == 'principal' ||
        (myRole() == 'adviser' && resource.data.section == myAccount().section) ||
        (myRole() == 'parent' && myAccount().studentId == studentId) ||
        (myRole() == 'student' && myAccount().studentId == studentId)
      );
      allow write: if isSignedIn() && myRole() == 'admin';
    }
    match /payments/{paymentId} {
      allow read: if isSignedIn() && (
        myRole() == 'admin' || myRole() == 'principal' ||
        (myRole() == 'adviser' && resource.data.section == myAccount().section) ||
        (myRole() == 'parent' && resource.data.studentId == myAccount().studentId) ||
        (myRole() == 'student' && resource.data.studentId == myAccount().studentId)
      );
      allow write: if isSignedIn() && myRole() == 'admin';
    }
    match /settings/{docId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && myRole() == 'admin';
    }
  }
}

Note the special case in "accounts -> allow create": it lets someone create their
OWN account doc only if no account exists for their uid yet AND (in practice) this
only ever fires once, for the very first Admin during bootstrap - every account
after that is created by an already-logged-in Admin, which satisfies myRole()=='admin'.
*/

const LOGIN_DOMAIN = '@eskwelapay.local';
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const fsDb = firebase.firestore();
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
function secondaryAuth(){
  let app = firebase.apps.find(a=>a.name==='Secondary');
  if(!app) app = firebase.initializeApp(firebaseConfig, 'Secondary');
  return app.auth();
}
