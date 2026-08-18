# Coverage history lookup — server

Metabolic Membership tools for enrollment experience/optimization.

Small Flask app. Patient data lives in a server-side SQLite database; the browser only ever
receives the single record a signed-in staff member searches for. Every lookup is written to an
access log (`access_log` table: username, MRN, timestamp).

## 1. Run it locally first

```bash
cd coverage-lookup-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Build the database from the source CSVs (defaults to ~/Downloads/pitch_*.csv)
python3 build_db.py

# Create your own login
python3 create_user.py yourname

# Secret key signs the login session cookie — generate a random one, keep it secret
export SECRET_KEY=$(python3 -c "import secrets;print(secrets.token_hex(32))")

python3 app.py
```

Open http://127.0.0.1:5000, sign in, confirm a lookup works end to end before doing anything else.

## 2. Add your team

```bash
source .venv/bin/activate
python3 create_user.py colleague-name
```

Run this once per teammate. Each person gets their own login — that's what makes the access log
useful (`SELECT * FROM access_log ORDER BY ts DESC` in `data/coverage.db` shows who looked up what,
when).

## 3. Put it somewhere the team can reach

You said there's no hosting set up yet, so the fastest safe option is a small managed platform —
no server admin, managed HTTPS, and you can restrict who can reach it.

**Recommended: Render.com (or Fly.io / Railway — same idea)**
1. Push this folder to a private git repo (do **not** commit `data/coverage.db` or `.env` — both
   are already in `.gitignore`).
2. Create a new Web Service on Render, point it at the repo.
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app` (already in the `Procfile`)
3. Set the `SECRET_KEY` environment variable in Render's dashboard (generate one the same way as
   above — don't reuse the local one).
4. Render's SQLite disk is ephemeral on redeploy by default — add a **persistent disk** mounted at
   `data/` (Render calls this a "Disk" in the service settings) so `coverage.db` survives restarts,
   or run `build_db.py` as part of your deploy step each time.
5. Once it's live, run `create_user.py` for each teammate (Render gives you a shell into the
   running service, or run it locally against a copy of the DB and upload it).
6. Restrict access: Render lets you require a login at the platform level too, or you can put the
   whole service behind your company's VPN/IP allowlist if you have one — the app's own login is
   the baseline, network restriction is the belt-and-suspenders layer on top.

**If you'd rather self-host:** any small VPS (DigitalOcean, Hetzner, Linode — a few dollars a
month) works: install Python, `pip install -r requirements.txt`, run `gunicorn app:app` behind
Nginx with a free TLS cert (Certbot/Let's Encrypt), same environment variable and user-creation
steps as above. More to maintain yourself, no platform dependency.

## Keeping it current

When the source extracts refresh:

```bash
python3 build_db.py /path/to/new_summary.csv /path/to/new_items.csv /path/to/new_daily.csv
```

This rebuilds `data/coverage.db` from scratch — logins and the access log live in the same file,
so back it up first if you want to keep history across a refresh (or move `users`/`access_log` to
a separate DB file if refreshes become frequent).

## Outreach list

A second page (`/outreach`) surfaces patients with an unattended appointment coming up, a
diagnosis on file, and rejected/cancelled billing history worth mentioning on the call. It adds
three tables (`appointments`, `contacts`, `diagnoses`) to the same `coverage.db` — run this after
`build_db.py`, whenever the retention workbook or diagnosis export refreshes:

```bash
python3 build_outreach.py /path/to/Retention_Master.xlsx /path/to/NewPatientLook.csv
```

Defaults to the Downloads copies if no paths are given. Like the billing CSVs, these source files
never get committed — only the compiled `coverage.db` (already gitignored) holds the data.

The "rejected value" shown is the patient's highest-value visit in the last 4 months, or their
highest-value visit ever if none fall in that window — a talking point, not a live quote.

## What changed vs. the standalone HTML file

- Patient data no longer ships to the browser — `/api/patient/<mrn>` returns only the record
  requested, `/api/landing` returns aggregate counts, never the underlying rows.
- Real login (per-person, hashed passwords) replaces the old client-side "Reveal" button as the
  actual access boundary. The Reveal button still exists for the Unbilled section within a
  session, but the page itself now requires signing in first.
- Every patient lookup is logged with who looked it up and when.
