# All Saints & Ascension: Website + Admin

Static website (plain HTML/CSS/JS, no build step) plus a small admin area at `/admin`
so parish staff can manage **Events**, **Announcements**, **Photos** and the **top banner**
without touching code. Hosted on Vercel; data, logins and photos live in Supabase.

## How it works

| Piece | What it does |
|---|---|
| `/admin/` | Login + admin screens (Admin and Editor roles) |
| `/api/content` | Public: published events/announcements/banner (drafts only for signed-in staff in preview) |
| `/api/users` | Admin-only: add / remove / turn off people, reset passwords (checked on the server) |
| `/api/config` | Hands the admin page the public Supabase address + public key from environment variables |
| `cms.js` | Fills the public pages (home, schedule, news) with published content; falls back to built-in text if anything fails |
| `supabase/schema.sql` | Database tables + security rules (Row Level Security) + photo storage rules |

**Security:** every permission is enforced in the database (Row Level Security) and in `/api/users`,
never only in the screen. Secrets live only in Vercel environment variables. The browser only ever gets the
*public* anon key (that is how Supabase is designed to work). Editors cannot manage people, change the banner,
delete photos, or delete published items.

## One-time setup (about 20 minutes)

1. **Create a Supabase project** at supabase.com (free plan is fine). Pick a region near Missouri (US East / Central). Save the database password.
2. **Run the database script:** Supabase → *SQL Editor* → *New query* → paste all of `supabase/schema.sql` → *Run*. (Safe to run again.)
3. **Turn off public sign-ups:** Supabase → *Authentication* → *Sign In / Providers* (or *Providers → Email*) → switch **off** "Allow new users to sign up". People are added only by an Admin.
4. **Create the first Admin:** Supabase → *Authentication* → *Users* → *Add user* → *Create new user*. Email `asa2018@sbcglobal.net`, choose a strong password, tick **Auto Confirm User**. The database automatically makes this email an **Admin**.
5. **Copy 3 values** from Supabase → *Project Settings* → *API*: Project URL, `anon` public key, and `service_role` secret key.
6. **Add them in Vercel:** Project → *Settings* → *Environment Variables* (Production + Preview):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`  (secret; never put it in any file or share it)
7. **Deploy:** push these files to GitHub (Vercel redeploys automatically). If you added the variables *after* the last deploy, click *Deployments → ⋯ → Redeploy*.
8. Open `https://YOUR-SITE/admin/` and sign in.

*Optional, recommended:* in Supabase → *Authentication → URL Configuration*, set **Site URL** to your real site address, and add `https://YOUR-SITE/admin/` under Redirect URLs (needed for the "Forgot password" email link).

## Passwords & email (important)

- Supabase's built-in email sender is limited and may **not deliver to outside addresses**. For reliable "Forgot password" emails, set up **Custom SMTP** (Supabase → *Authentication → SMTP Settings*; Resend or Gmail app password both work).
- Until then, nothing depends on email: an Admin can add people and **Reset Password** on the *People* page, which shows a one-time temporary password. The person must choose their own password at first sign-in.

## Everyday use

See `TRAINING.md` (one-page guide for staff).

## Roles

| | Admin | Editor |
|---|---|---|
| Add / edit / publish / unpublish events & announcements | Yes | Yes |
| Delete drafts | Yes | Yes |
| Delete published items | Yes | No (take down first, or ask an Admin) |
| Upload photos | Yes | Yes |
| Delete photos, edit top banner | Yes | No |
| Add / remove people, change roles, reset passwords | Yes | No |

Safeguards: you cannot remove or demote yourself, and there must always be at least one active Admin.
Sessions sign out automatically after 60 minutes of inactivity.

## Changing the first-Admin email
Edit the email in `handle_new_user()` inside `supabase/schema.sql` and run it again (before creating that user).

## Troubleshooting

| Problem | Fix |
|---|---|
| Admin page says "not connected to its database yet" | The 3 Vercel environment variables are missing or the site was not redeployed after adding them. |
| Can sign in but "doesn't have access" | The user has no profile. First Admin: create it with the exact email in step 4. Others: add them from *People*. |
| Event doesn't show on the website | It is still a Draft, or its date is in the past (past events are hidden). Public pages refresh within ~15 seconds. |
| Preview says "sign in" | Sign in at `/admin/` in the same browser, then click Preview again. |
| Photo upload fails | Use JPG/PNG/WebP; max 5 MB after automatic shrinking. Confirm step 2 ran (it creates the `media` storage bucket). |
| Forgot-password email never arrives | Set up Custom SMTP (above), or ask an Admin to reset your password. |

## Local files / editing the rest of the site

Everything else is unchanged static HTML. Files live in one folder:

## Files (keep them ALL in ONE folder)

```
index.html        ← Home
im-new.html       ← I'm New / FAQ
about.html        ← History, Rector, Ministries, Episcopal Church, Vestry
schedule.html     ← Worship times + events
news.html         ← News & newsletters
funeral-notices.html ← Funeral & memorial notices
gallery.html      ← Photo gallery
watch.html        ← Watch Live
giving.html       ← Give Online
contact.html      ← Contact, form, map
resources.html    ← Bulletins, forms, links
styles.css        ← The shared design
site.js           ← Builds the header + footer on every page
```

## Deploy on Vercel (this is what fixes the 404)

The earlier 404 happened because the files were inside a **subfolder**. Do this:

1. Put **all 13 files directly at the top level** of your GitHub repo. NOT inside a folder.
   Your repo root should show `index.html` right there, not `something/index.html`.
2. Push to GitHub.
3. In Vercel, import the repo and deploy. No build step, no settings needed, it's plain HTML.
4. Visit your URL. The homepage loads, and every menu link now stays on your new site.

**If you drag-and-drop into Vercel instead of GitHub:** select all the files themselves (not the folder containing them) so `index.html` lands at the root.

**Quick local test:** double-click `index.html` on your computer. The whole site works offline too, since links are relative.

## Editing the menu

The navigation and footer are built once in **`site.js`**. Change a menu link there and it updates on every page automatically.

## Adding photos

Where you see a placeholder box (about page, gallery), replace it with:
```html
<img src="your-photo.jpg" alt="A short description">
```
Put the image file in the same folder and reference it by name.

## Content sources

Service times, history, ministries, clergy (Rev. Renee Fenner), address, and photos were taken from your existing site so everything is accurate. The gallery and news reuse your current image URLs, which will keep working.
