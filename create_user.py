"""Add or reset a staff login. Run: python3 create_user.py <username>
Prompts for a password (not echoed), stores a salted hash — never the plaintext.
"""
import getpass
import sqlite3
import sys
from pathlib import Path
from werkzeug.security import generate_password_hash

DB_PATH = Path(__file__).parent / "data" / "coverage.db"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 create_user.py <username>")
        sys.exit(1)
    username = sys.argv[1].strip()
    if not DB_PATH.exists():
        print("No database yet — run build_db.py first.")
        sys.exit(1)
    pw1 = getpass.getpass("New password: ")
    pw2 = getpass.getpass("Confirm password: ")
    if pw1 != pw2:
        print("Passwords did not match.")
        sys.exit(1)
    if len(pw1) < 8:
        print("Use at least 8 characters.")
        sys.exit(1)
    con = sqlite3.connect(DB_PATH)
    con.execute(
        "INSERT INTO users(username, password_hash) VALUES (?,?) "
        "ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash",
        (username, generate_password_hash(pw1, method="pbkdf2:sha256")),
    )
    con.commit()
    con.close()
    print(f"Saved login for '{username}'.")
