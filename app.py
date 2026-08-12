import os
import sqlite3
from datetime import datetime
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

DB_PATH = Path(__file__).parent / "data" / "coverage.db"
DATE_MIN, DATE_MAX = "2026-04-06", "2026-07-10"

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY")
if not app.secret_key:
    raise RuntimeError("Set SECRET_KEY in the environment before running (see README).")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def login_required(view):
    @wraps(view)
    def wrapped(*a, **kw):
        if "user" not in session:
            return redirect(url_for("login", next=request.path))
        return view(*a, **kw)
    return wrapped


def norm_mrn(raw):
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits.lstrip("0") or "0"


def log_access(mrn, action):
    get_db().execute(
        "INSERT INTO access_log(username, mrn, action) VALUES (?,?,?)",
        (session.get("user"), mrn, action),
    )
    get_db().commit()


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html", error=None)
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    row = get_db().execute(
        "SELECT password_hash FROM users WHERE username=?", (username,)
    ).fetchone()
    if row and check_password_hash(row["password_hash"], password):
        session.clear()
        session["user"] = username
        session.permanent = True
        return redirect(request.args.get("next") or url_for("index"))
    return render_template("login.html", error="Wrong username or password.")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    return render_template("index.html", user=session["user"],
                            date_min=DATE_MIN, date_max=DATE_MAX)


@app.route("/api/landing")
@login_required
def api_landing():
    fee = request.args.get("fee", type=float) or 0.0
    db = get_db()
    total = db.execute("SELECT COUNT(*) n FROM summary").fetchone()["n"]
    has_denial = db.execute("SELECT COUNT(*) n FROM summary WHERE denied_cash>0").fetchone()["n"]
    exceed_d = db.execute("SELECT COUNT(*) n FROM summary WHERE denied_cash>?", (fee,)).fetchone()["n"]
    exceed_c = db.execute(
        "SELECT COUNT(*) n FROM summary WHERE (canR_cash+canO_cash)>?", (fee,)
    ).fetchone()["n"]
    exceed_both = db.execute(
        "SELECT COUNT(*) n FROM summary WHERE (denied_cash+canR_cash+canO_cash)>?", (fee,)
    ).fetchone()["n"]
    denied_vals = [r["denied_cash"] for r in
                   db.execute("SELECT denied_cash FROM summary WHERE denied_cash>0")]
    denied_vals.sort()
    if denied_vals:
        mid = len(denied_vals) // 2
        median = denied_vals[mid] if len(denied_vals) % 2 else (denied_vals[mid - 1] + denied_vals[mid]) / 2
    else:
        median = 0
    top_rows = db.execute("""
        SELECT mrn, denied_cash d, canR_cash c, canO_cash co
        FROM summary WHERE (denied_cash+canR_cash+canO_cash) > 0
        ORDER BY (denied_cash+canR_cash+canO_cash) DESC LIMIT 8
    """).fetchall()
    return jsonify({
        "total": total, "hasDenial": has_denial, "exceedD": exceed_d,
        "exceedC": exceed_c, "exceedBoth": exceed_both, "median": median,
        "top": [[r["mrn"], r["d"], r["c"], r["co"]] for r in top_rows],
    })


@app.route("/api/patient/<raw_mrn>")
@login_required
def api_patient(raw_mrn):
    mrn = norm_mrn(raw_mrn)
    frm = request.args.get("from", DATE_MIN)
    to = request.args.get("to", DATE_MAX)
    db = get_db()
    items = db.execute(
        "SELECT service_date d, service s, payer p, category c, denial_code k, cash_value v "
        "FROM items WHERE mrn=? AND service_date BETWEEN ? AND ? ORDER BY service_date",
        (mrn, frm, to),
    ).fetchall()
    daily = db.execute(
        "SELECT service_date d, items i, cash v "
        "FROM covered_daily WHERE mrn=? AND service_date BETWEEN ? AND ?",
        (mrn, frm, to),
    ).fetchall()
    if not items and not daily:
        exists = db.execute("SELECT 1 FROM items WHERE mrn=? LIMIT 1", (mrn,)).fetchone() \
            or db.execute("SELECT 1 FROM covered_daily WHERE mrn=? LIMIT 1", (mrn,)).fetchone()
        log_access(mrn, "miss" if not exists else "empty-range")
        return jsonify({"found": False, "exists": bool(exists)})
    log_access(mrn, "lookup")
    return jsonify({
        "found": True,
        "i": [{"d": r["d"], "s": r["s"], "p": r["p"], "c": r["c"], "k": r["k"], "v": r["v"]} for r in items],
        "v": {r["d"]: [r["i"], r["v"]] for r in daily},
    })


if __name__ == "__main__":
    if not DB_PATH.exists():
        raise SystemExit(f"{DB_PATH} not found — run build_db.py first.")
    app.run(host="127.0.0.1", port=5000, debug=False)
