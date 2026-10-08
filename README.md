# Football on TV

A phone-friendly page listing Premier League and Champions League games for today and the next 7 days, with UK kick-off times and the UK TV channel.

- **Fixtures** come from the official premierleague.com and uefa.com data.
- **Channels** come from the Premier League's own broadcast listings (Sky Sports or TNT Sports), cross-checked against live-footballontv.com for the exact channel (e.g. *Sky Sports Main Event*, *TNT Sports 1*, *Amazon Prime Video*).
- A GitHub Action refreshes `data.json` every 3 hours. The page itself is a static file hosted free on GitHub Pages.

## Files

| File | What it does |
|---|---|
| `index.html` | The app you open on your phone |
| `data.json` | The latest fixtures and channels (rewritten automatically) |
| `scripts/build.mjs` | Fetches and merges the data |
| `.github/workflows/update.yml` | Runs the script every 3 hours |
| `test/run-test.mjs` | Offline test using sample data (`node test/run-test.mjs`) |

## One-off setup

1. Create a new **public** repository called `football-on-tv` (tick "Add a README" so it isn't empty).
2. **Add file → Upload files**, then drag in everything from this folder, including the `.github` folder. Commit.
3. **Settings → Pages**: Source "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
4. **Actions** tab: enable workflows if asked, open **Update fixtures** and click **Run workflow**. It should go green in about a minute.
5. On your phone, open `https://<your-username>.github.io/football-on-tv/` and add it to your home screen.

## If something looks wrong

- A yellow banner on the page means one of the sources couldn't be read on the last update. The rest still works.
- To see what happened, open the latest run on the **Actions** tab and expand **Fetch fixtures and TV channels**. It prints a short report of each source.
- GitHub pauses scheduled actions after 60 days without repository activity. The action commits on each run, so this shouldn't happen. If it does, re-enable it from the Actions tab.
