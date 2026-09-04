# VideoShare — setup

## 1. Copy the files in

Drop these into your `videoshare` project, replacing what's there:

- `index.html` → project root
- `src/main.jsx`
- `src/App.jsx`
- `src/App.css`
- `src/google.js`

You can delete the leftover starter files: `src/index.css`, `src/assets/`, and `public/vite.svg`.

## 2. Add your client ID

Create a file called `.env` in the project root (same folder as `package.json`) containing one line:

```
VITE_GOOGLE_CLIENT_ID=paste-your-client-id-here
```

The name must start with `VITE_` or Vite will ignore it. **Stop and restart `npm run dev` after creating this file** — Vite only reads `.env` at startup.

This value is not a secret. It ships in the browser bundle and that's fine; Google's security here comes from the authorized origins list, not from hiding the ID.

## 3. Run it

```
npm run dev
```

Open the localhost URL on your PC. Sign in with Google. You'll see an "unverified app" warning — click Advanced, then continue. That warning is expected until you go through Google's verification, and only accounts on your Test Users list can get past it.

Recording won't work in a desktop browser. Use it to check that sign-in works and your calendar list loads.

## 4. Test on your phone

```
git add .
git commit -m "Add video upload and calendar sharing"
git push
```

Vercel redeploys automatically. Open your `.vercel.app` URL on your iPhone — the camera button will now open the native recorder.

If sign-in fails on the deployed site, the Vercel URL isn't in your Google OAuth client's **Authorized JavaScript origins**. Add it (no trailing slash) and wait a minute.

Also add `VITE_GOOGLE_CLIENT_ID` under Vercel → your project → Settings → Environment Variables, then redeploy. Vercel doesn't read your local `.env`.

## What it does

1. Signs in with Google, requesting access to Drive and Calendar
2. Opens the iPhone camera to record a video
3. Uploads to **your** Drive with a progress bar, then makes it link-viewable
4. Adds the link to a calendar you pick (including shared family calendars), or downloads a `.ics` invite you can text to anyone

## Known limits

- **Tokens expire after about an hour.** Signing in again is the only fix without a backend.
- **Uploads don't survive backgrounding.** If Safari suspends the tab mid-upload, it fails and restarts from zero.
- **Only test users can sign in** until you complete Google's verification. Add family Gmail addresses under OAuth consent screen → Test users.
- **`drive.file` scope** means the app can only see files it created. It cannot browse the rest of your Drive.
