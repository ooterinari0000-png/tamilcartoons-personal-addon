# TamilCartoons Personal Catalogue Add-on

This starter add-on provides a catalogue and links to the original TamilCartoons.in pages. It does **not** extract, proxy, download, or bypass restrictions on video streams. Playback depends on the original site's own page/player and whether your app supports external links.

## Deploy free from an Android phone

1. Download and extract this ZIP.
2. Create/sign in to a GitHub account in your browser.
3. Create a new repository named `tamilcartoons-personal-addon`.
4. Upload the files in this folder to the repository root (`package.json`, `server.js`, `render.yaml`, `README.md`).
5. Open https://render.com and sign in; connect GitHub when prompted.
6. Choose **New → Web Service**, select your repository, and choose the **Free** plan.
7. Set Build Command to `npm install` and Start Command to `npm start`, then deploy.
8. When Render gives you a service URL such as `https://YOUR-SERVICE.onrender.com`, open `https://YOUR-SERVICE.onrender.com/manifest.json` in your browser. If JSON appears, your manifest URL is:
   `https://YOUR-SERVICE.onrender.com/manifest.json`
9. Paste that URL into the add-on install flow supported by your Stremio/Nuvio app.

## Important
- The actual manifest URL does not exist until you deploy and Render assigns your service URL. Do not use the placeholder above.
- Render's free service may sleep when idle and take about a minute to wake up.
- Source website markup can change, which may require updating the catalogue parser.
- Nuvio support may differ by version; if it rejects the manifest, check its current custom add-on instructions.
