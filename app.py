from datetime import datetime
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "appointments.db"

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

VALID_STATUSES = {"scheduled", "completed", "cancelled"}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            appointment_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'scheduled',
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()

    count = conn.execute("SELECT COUNT(*) FROM appointments").fetchone()[0]
    if count == 0:
        sample_rows = [
            ("Team Stand-up", "Daily sync with the product team.", "2026-09-09", "09:30", "10:00", "completed"),
            ("Design Review", "Review the new appointment board UI.", "2026-09-09", "11:00", "12:00", "scheduled"),
            ("Client Call", "Discuss onboarding requirements.", "2026-09-10", "14:00", "15:00", "scheduled"),
            ("Sprint Retrospective", "What worked, what to improve.", "2026-09-11", "16:00", "17:00", "cancelled"),
        ]
        conn.executemany("""
            INSERT INTO appointments
            (title, description, appointment_date, start_time, end_time, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            (*row, datetime.now().isoformat(timespec="seconds"))
            for row in sample_rows
        ])
        conn.commit()

    conn.close()


def serialize(row):
    data = dict(row)
    return data


def validate_payload(data):
    required = ["title", "appointment_date", "start_time", "end_time"]
    missing = [field for field in required if not str(data.get(field, "")).strip()]
    if missing:
        return False, f"Please provide: {', '.join(missing)}."

    try:
        start = datetime.fromisoformat(f"{data['appointment_date']}T{data['start_time']}")
        end = datetime.fromisoformat(f"{data['appointment_date']}T{data['end_time']}")
    except ValueError:
        return False, "Please use a valid date and time."

    if end <= start:
        return False, "End time must be after start time."

    status = data.get("status", "scheduled")
    if status not in VALID_STATUSES:
        return False, "Invalid appointment status."

    return True, None


def has_conflict(date, start_time, end_time, exclude_id=None):
    conn = get_db()
    query = """
        SELECT id, title, start_time, end_time
        FROM appointments
        WHERE appointment_date = ?
          AND status != 'cancelled'
          AND start_time < ?
          AND end_time > ?
    """
    params = [date, end_time, start_time]

    if exclude_id is not None:
        query += " AND id != ?"
        params.append(exclude_id)

    conflict = conn.execute(query, params).fetchone()
    conn.close()
    return conflict


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/appointments")
def list_appointments():
    date = request.args.get("date", "").strip()
    status = request.args.get("status", "all").strip()

    conn = get_db()
    query = "SELECT * FROM appointments WHERE 1=1"
    params = []

    if date:
        query += " AND appointment_date = ?"
        params.append(date)

    if status and status != "all":
        query += " AND status = ?"
        params.append(status)

    query += """
        ORDER BY appointment_date ASC,
                 CASE status
                     WHEN 'scheduled' THEN 1
                     WHEN 'completed' THEN 2
                     WHEN 'cancelled' THEN 3
                     ELSE 4
                 END,
                 start_time ASC
    """

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([serialize(row) for row in rows])


@app.post("/api/appointments")
def create_appointment():
    data = request.get_json(silent=True) or {}
    ok, error = validate_payload(data)
    if not ok:
        return jsonify({"error": error}), 400

    conflict = has_conflict(
        data["appointment_date"],
        data["start_time"],
        data["end_time"]
    )
    if conflict:
        return jsonify({
            "error": (
                f"Time conflict: '{conflict['title']}' already occupies "
                f"{conflict['start_time']}–{conflict['end_time']}."
            )
        }), 409

    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO appointments
        (title, description, appointment_date, start_time, end_time, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        data["title"].strip(),
        data.get("description", "").strip(),
        data["appointment_date"],
        data["start_time"],
        data["end_time"],
        data.get("status", "scheduled"),
        datetime.now().isoformat(timespec="seconds")
    ))
    conn.commit()
    row = conn.execute(
        "SELECT * FROM appointments WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    conn.close()

    return jsonify(serialize(row)), 201


@app.put("/api/appointments/<int:appointment_id>")
def update_appointment(appointment_id):
    data = request.get_json(silent=True) or {}
    ok, error = validate_payload(data)
    if not ok:
        return jsonify({"error": error}), 400

    conn = get_db()
    existing = conn.execute(
        "SELECT * FROM appointments WHERE id = ?", (appointment_id,)
    ).fetchone()
    conn.close()

    if existing is None:
        return jsonify({"error": "Appointment not found."}), 404

    conflict = has_conflict(
        data["appointment_date"],
        data["start_time"],
        data["end_time"],
        exclude_id=appointment_id
    )
    if conflict:
        return jsonify({
            "error": (
                f"Time conflict: '{conflict['title']}' already occupies "
                f"{conflict['start_time']}–{conflict['end_time']}."
            )
        }), 409

    conn = get_db()
    conn.execute("""
        UPDATE appointments
        SET title = ?, description = ?, appointment_date = ?,
            start_time = ?, end_time = ?, status = ?
        WHERE id = ?
    """, (
        data["title"].strip(),
        data.get("description", "").strip(),
        data["appointment_date"],
        data["start_time"],
        data["end_time"],
        data.get("status", "scheduled"),
        appointment_id
    ))
    conn.commit()
    row = conn.execute(
        "SELECT * FROM appointments WHERE id = ?", (appointment_id,)
    ).fetchone()
    conn.close()

    return jsonify(serialize(row))


@app.patch("/api/appointments/<int:appointment_id>/status")
def update_status(appointment_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")

    if status not in VALID_STATUSES:
        return jsonify({"error": "Invalid appointment status."}), 400

    conn = get_db()
    cursor = conn.execute(
        "UPDATE appointments SET status = ? WHERE id = ?",
        (status, appointment_id)
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM appointments WHERE id = ?", (appointment_id,)
    ).fetchone()
    conn.close()

    if cursor.rowcount == 0:
        return jsonify({"error": "Appointment not found."}), 404

    return jsonify(serialize(row))


@app.delete("/api/appointments/<int:appointment_id>")
def delete_appointment(appointment_id):
    conn = get_db()
    cursor = conn.execute(
        "DELETE FROM appointments WHERE id = ?", (appointment_id,)
    )
    conn.commit()
    conn.close()

    if cursor.rowcount == 0:
        return jsonify({"error": "Appointment not found."}), 404

    return jsonify({"message": "Appointment deleted."})


@app.cli.command("reset-db")
def reset_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()
    print("Database reset with sample appointments.")


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
