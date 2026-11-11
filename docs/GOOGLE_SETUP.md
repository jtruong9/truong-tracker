# Turning on Google sign-in (for the iPhone)

Computers open the Drive folder directly and need none of this. The phone signs in to Google and reads the same
folder through Google Drive, which needs a free **OAuth client ID** from your own Google Cloud project. Do this once,
about 10 minutes, on a computer, signed in to the **same Google account whose Drive holds "Truong Tracker Data"**.

## 1. Make a project

1. Go to <https://console.cloud.google.com/> and accept the terms if asked.
2. Project picker (top left) › **New project**. Name: `Truong Tracker`. No organization. **Create**, then make sure
   it is the selected project.

## 2. Turn on the Drive API

1. **APIs & Services › Library**, search **Google Drive API**, open it, **Enable**.

## 3. Sign-in screen (consent screen)

1. **APIs & Services › OAuth consent screen** (newer consoles call it **Google Auth Platform › Branding**). **Get started**.
2. App name `Truong Tracker`; support email and developer contact = your Gmail. Audience: **External**. Create.
3. **Data access** (or **Scopes**): add `https://www.googleapis.com/auth/drive` ("See, edit, create and delete all of
   your Google Drive files"). It is listed as restricted; that's fine for your own use.
4. **Audience** (or **Test users**): add **your own Gmail address** as a test user. Leave the app in **Testing**.

## 4. The client ID

1. **APIs & Services › Credentials › Create credentials › OAuth client ID**.
2. Application type **Web application**, name `Truong Tracker web`.
3. **Authorized JavaScript origins:** `https://jtruong9.github.io`
4. **Authorized redirect URIs:** `https://jtruong9.github.io/truong-tracker/`, exactly, with the trailing slash.
   (If the repo has another name, use that name.)
5. **Create**, and copy the **Client ID** (it ends in `.apps.googleusercontent.com`). You don't need the client secret.

## 5. Put it in the app

1. In the repo, open `js/config.js` and paste it: `googleClientId: "1234…apps.googleusercontent.com",`
2. Commit and push. The client ID is not a secret (it only works from the address above), so it's fine in a public repo.

## 6. On the iPhone

1. Open `https://jtruong9.github.io/truong-tracker/` in **Safari**, tap **Sign in with Google**, pick your account.
2. Google says **"Google hasn't verified this app."** It's your own app: tap **Continue** (or **Advanced › Go to
   Truong Tracker (unsafe)**), then allow Drive access.
3. The app finds **Truong Tracker Data** and shows your list.
4. **Share › Add to Home Screen.** Use the home-screen icon from then on.

## Things to know

- **Testing mode:** while the app stays in Testing, Google may ask you to sign in again more often (sign-ins for
  apps in Testing can expire after about 7 days). The app sends you to Google and back on its own when it can; if Google
  wants your password, sign in again. Nothing is lost: unsaved edits wait on the phone.
- **Only you:** only Google accounts listed as test users can sign in.
- **To stop it:** Google Account › Security › Third-party apps › Truong Tracker › Remove access, or delete the project.
