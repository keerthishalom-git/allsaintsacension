# All Saints & Ascension: Full Website

Every page in the design of your landing page, with all navigation wired to these local pages (nothing points back to the old WordPress site).

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
