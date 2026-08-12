"""One-time build: turn the three source CSVs into coverage.db (SQLite).

Run whenever the source extracts refresh:
    python3 build_db.py /path/to/pitch_patient_summary.csv /path/to/pitch_item_detail.csv /path/to/pitch_covered_daily.csv
Defaults to the Downloads copies if no paths are given.
"""
import csv
import sqlite3
import sys
from pathlib import Path

DEFAULT_SUMMARY = Path.home() / "Downloads" / "pitch_patient_summary.csv"
DEFAULT_ITEMS = Path.home() / "Downloads" / "pitch_item_detail.csv"
DEFAULT_DAILY = Path.home() / "Downloads" / "pitch_covered_daily.csv"
DB_PATH = Path(__file__).parent / "data" / "coverage.db"

EXCLUDE_MRNS = {"9999999"}  # confirmed test/placeholder record, not a real patient


def normalize_mrn(raw):
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits.lstrip("0") or "0"


def build(summary_path, items_path, daily_path):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    cur.execute("""
        CREATE TABLE items(
            mrn TEXT, service_date TEXT, service TEXT, payer TEXT,
            category TEXT, denial_code TEXT, cash_value REAL
        )
    """)
    cur.execute("""
        CREATE TABLE covered_daily(
            mrn TEXT, service_date TEXT, items REAL, cash REAL
        )
    """)
    cur.execute("""
        CREATE TABLE summary(
            mrn TEXT PRIMARY KEY, denied_cash REAL, canR_cash REAL, canO_cash REAL
        )
    """)
    cur.execute("""
        CREATE TABLE users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE access_log(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT, mrn TEXT, action TEXT, ts TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    n_items = 0
    with open(items_path, newline="") as f:
        for row in csv.DictReader(f):
            mrn = normalize_mrn(row["MRN"])
            if mrn in EXCLUDE_MRNS:
                continue
            cur.execute(
                "INSERT INTO items VALUES (?,?,?,?,?,?,?)",
                (mrn, row["Service Date"], row["Service"], row["Payer"],
                 row["Category"], row["Denial Code"],
                 float(row["Cash Value (AED)"]) if row["Cash Value (AED)"] else 0.0),
            )
            n_items += 1

    n_daily = 0
    with open(daily_path, newline="") as f:
        for row in csv.DictReader(f):
            mrn = normalize_mrn(row["MRN"])
            if mrn in EXCLUDE_MRNS:
                continue
            cur.execute(
                "INSERT INTO covered_daily VALUES (?,?,?,?)",
                (mrn, row["Service Date"], float(row["Covered Items"]),
                 float(row["Covered Cash (AED)"])),
            )
            n_daily += 1

    n_summary = 0
    with open(summary_path, newline="") as f:
        for row in csv.DictReader(f):
            mrn = normalize_mrn(row["MRN"])
            if mrn in EXCLUDE_MRNS:
                continue
            cur.execute(
                "INSERT OR REPLACE INTO summary VALUES (?,?,?,?)",
                (mrn, float(row["Denied Cash (AED)"]),
                 float(row["Cancelled - rejected Cash (AED)"]),
                 float(row["Cancelled - other Cash (AED)"])),
            )
            n_summary += 1

    cur.execute("CREATE INDEX idx_items_mrn ON items(mrn, service_date)")
    cur.execute("CREATE INDEX idx_daily_mrn ON covered_daily(mrn, service_date)")

    con.commit()
    con.close()
    print(f"Built {DB_PATH}")
    print(f"  items: {n_items}")
    print(f"  covered_daily: {n_daily}")
    print(f"  summary: {n_summary}")


if __name__ == "__main__":
    args = sys.argv[1:]
    summary = Path(args[0]) if len(args) > 0 else DEFAULT_SUMMARY
    items = Path(args[1]) if len(args) > 1 else DEFAULT_ITEMS
    daily = Path(args[2]) if len(args) > 2 else DEFAULT_DAILY
    build(summary, items, daily)
