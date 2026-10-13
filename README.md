# Money Tracker

A simple spending tracker for iPhone. Every Friday you log what you spent in each category, the app warns you when you get close to a budget, and charts show where your money goes.

It's a web app you add to your iPhone's Home Screen: it opens full-screen like a normal app, works offline, and keeps your data on your phone. No App Store, no account, no server.

## What it does

- **Friday check-in.** Enter one amount per category for the week (Saturday to Friday). You can also add single purchases any time.
- **Friday reminder.** One tap adds a repeating Friday event to your iPhone Calendar, so you get an alert even when the app is closed. The Home screen also shows a check-in card on Fridays, and keeps reminding you about any week you missed.
- **Categories.** Groceries, Eating out, Transport, Home & bills, Shopping, Fun, Health and Other to start with. You can rename them, change the emoji and color, add your own, or hide them.
- **Budgets with warnings.** Set a weekly or monthly budget per category, plus an optional overall budget. You get a warning when you reach 80% (you can change this) and when you go over. Budgets show on the Home screen, and while you type a check-in you can see what each amount will do to your budget.
- **Charts.** Weekly or monthly totals for the last 12 periods with your budget line, a donut chart showing which categories the money went to, trends for a single category, and a table view.
- **Import Apple Pay purchases.** A one-time Shortcuts automation writes every Apple Pay tap to a file in iCloud Drive. Import it in the check-in and each purchase lands in its category. Purchases you already imported are skipped.
- **Import bank or card statements (CSV).** Works with any bank: the app finds the date, shop and amount columns (Hebrew headers included) and lets you fix them. Purchases in weeks you already logged by hand are unticked so nothing is counted twice.
- **Shop memory.** Common shops are recognised out of the box (Starbucks → Eating out, Shell → Transport…). When you change a category the app remembers it for that shop next time.
- **Recurring payments.** Rent, subscriptions, the gym: they're added automatically on their day each month or week.
- **Savings goals.** Set a target and an optional date. The app shows how much to put aside each week and tracks what you add or take out.
- **Insights.** A weekly recap after each check-in (compared with your usual week, top category, biggest jump), your check-in streak 🔥, and a month-end forecast that warns you if you're on pace to go over your budget.
- **Backup.** Export a JSON backup (to Files or iCloud Drive) and restore it later, or export a CSV for Excel or Numbers.

## Put it on your iPhone

1. **Publish the site** (one time). See [Hosting](#hosting) below.
2. On your iPhone, open the site address in **Safari**.
3. Tap **Share** (the square with the arrow) → **Add to Home Screen** → **Add**.
4. Open **Money** from your Home Screen and pick your currency.
5. Go to **Settings → Friday reminder**, choose a time, tap **Add to Calendar**, then tap **Add All**.

> Use the Home Screen app, not the Safari tab. iOS keeps their data separate, so anything you enter in Safari won't show up in the installed app.

## Log Apple Pay purchases automatically

Apple doesn't let apps read your Apple Pay history directly, but the Shortcuts app can write each purchase to a file:

1. **Shortcuts** app → **Automation** → **+** → **Transaction**. Pick your cards, choose **Run Immediately**, then **New Blank Automation**.
2. Add **Append to Text File**. In its text type `MT|`, then insert **Current Date** (Date Format: ISO 8601), `|`, **Merchant**, `|`, **Amount**.
3. Set the file path to `money-tracker-applepay.txt` and turn on **Make New Line**.

On Fridays, tap **Import Apple Pay or bank purchases** in the check-in and pick the file from **iCloud Drive → Shortcuts**. The same steps are in the app under **Settings → Log Apple Pay purchases**. Only Apple Pay taps are logged, not your physical card or online card payments.

## Hosting

The app is plain HTML, CSS and JavaScript with no build step. `.github/workflows/deploy.yml` runs the tests and publishes the app to **GitHub Pages** on every push to `main`.

To turn it on:

1. Open the repo on GitHub → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to **Actions → Test and deploy → Run workflow**, or just push a commit.
4. The app will be at **https://sharonnjd.github.io/Money_Tracking/**.

**Private repo?** GitHub Pages only works on private repos with a paid plan (GitHub Pro, Team or Enterprise). On a free account you can either:

- make the repo public (**Settings → General → Danger Zone → Change visibility**). Only the code becomes public. Your spending data is never in the repo; it stays on your phone.
- or host it for free on Netlify or Cloudflare Pages: connect this repo, leave the build directory as the repo root, and use `node scripts/gen-reminders.mjs https://YOUR-SITE-ADDRESS/` as the build command so the reminder links point to your site.

## Your data

- Everything is saved in the app's storage on your iPhone, and nothing is uploaded anywhere.
- Deleting the Home Screen app also deletes its data, so export a backup now and then (**Settings → Export backup**).
- If you lose your phone, install the app on the new one and use **Settings → Restore from backup**.

## Development

```sh
npm test        # unit tests: dates, budgets, check-ins, recurring, goals, insights, statement import
npm start       # serve locally at http://localhost:8080
```

| Path | What's there |
| --- | --- |
| `index.html`, `manifest.webmanifest`, `sw.js` | App shell, install metadata, offline cache |
| `js/logic.js` | Pure logic: weeks (Sat to Fri), money parsing, totals, budget levels, check-ins, streaks, recurring payments, goals, backup validation, CSV |
| `js/importer.js` | Statement/Apple Pay log parsing, column detection, shop → category suggestions, duplicate keys |
| `js/insights.js` | Month-end forecast, weekly recap, biggest change |
| `js/store.js` | State saved to `localStorage` |
| `js/views/` | Home, History, Charts, Settings screens |
| `js/sheets.js` | Check-in, expense, category/budget, reminder and welcome sheets |
| `js/import-sheet.js`, `js/recurring-sheet.js`, `js/goals.js`, `js/recap.js` | Import flow and Apple Pay guide, recurring payments, savings goals, weekly recap |
| `js/charts.js` | SVG column and donut charts |
| `reminders/` | Weekly Friday calendar files (`npm run reminders` regenerates them) |
| `icons/` | App icon (`npm run icons` re-renders the PNGs from `icon.svg`) |
