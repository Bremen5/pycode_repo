#!/usr/bin/env python3
"""カリステニクストレーニング記録 Web アプリ"""

from flask import Flask, render_template, request, redirect, url_for, flash
from calisthenics import (
    init_db, get_db, list_exercises, unit_label,
    get_or_create_today_workout, today_str, _calc_streak,
    CATEGORIES,
)
from datetime import date, timedelta
import sqlite3

app = Flask(__name__)
app.secret_key = "calisthenics-secret-key"
app.jinja_env.globals["enumerate"] = enumerate

init_db()


# ── helpers ────────────────────────────────────────────────────────────────

def get_today_sets(conn, workout_id):
    return conn.execute("""
        SELECT ws.id, ws.set_number, ws.value, ws.notes,
               e.id AS exercise_id, e.name, e.unit
        FROM workout_sets ws
        JOIN exercises e ON e.id = ws.exercise_id
        WHERE ws.workout_id = ?
        ORDER BY e.name, ws.set_number
    """, (workout_id,)).fetchall()


# ── routes ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    with get_db() as conn:
        workout_id = get_or_create_today_workout(conn)
        sets = get_today_sets(conn, workout_id)
        workout = conn.execute("SELECT * FROM workouts WHERE id=?", (workout_id,)).fetchone()

    # グループ化
    grouped = {}
    for s in sets:
        grouped.setdefault(s["name"], {"unit": s["unit"], "sets": []})["sets"].append(s)

    return render_template("index.html",
                           today=today_str(),
                           workout=workout,
                           grouped=grouped,
                           unit_label=unit_label)


@app.route("/record", methods=["GET", "POST"])
def record():
    if request.method == "POST":
        exercise_id = request.form.get("exercise_id")
        sets_data = []
        i = 1
        while f"value_{i}" in request.form:
            v = request.form.get(f"value_{i}", "").strip()
            note = request.form.get(f"note_{i}", "").strip()
            if v.isdigit() and int(v) > 0:
                sets_data.append((int(v), note))
            i += 1

        if not exercise_id or not sets_data:
            flash("種目と少なくとも1セットを入力してください。", "error")
            return redirect(url_for("record"))

        with get_db() as conn:
            ex = conn.execute("SELECT * FROM exercises WHERE id=?", (exercise_id,)).fetchone()
            if not ex:
                flash("種目が見つかりません。", "error")
                return redirect(url_for("record"))
            workout_id = get_or_create_today_workout(conn)
            existing = conn.execute(
                "SELECT MAX(set_number) AS m FROM workout_sets WHERE workout_id=? AND exercise_id=?",
                (workout_id, exercise_id),
            ).fetchone()
            start = (existing["m"] or 0) + 1
            for idx, (v, note) in enumerate(sets_data):
                conn.execute(
                    "INSERT INTO workout_sets (workout_id, exercise_id, set_number, value, notes) VALUES (?,?,?,?,?)",
                    (workout_id, exercise_id, start + idx, v, note),
                )
        flash(f"{ex['name']} {len(sets_data)}セットを記録しました！", "success")
        return redirect(url_for("index"))

    with get_db() as conn:
        exercises = list_exercises(conn)

    grouped_ex = {}
    for ex in exercises:
        grouped_ex.setdefault(ex["category"], []).append(ex)

    return render_template("record.html", grouped_ex=grouped_ex, unit_label=unit_label)


@app.route("/delete_set/<int:set_id>", methods=["POST"])
def delete_set(set_id):
    with get_db() as conn:
        conn.execute("DELETE FROM workout_sets WHERE id=?", (set_id,))
    flash("セットを削除しました。", "success")
    return redirect(url_for("index"))


@app.route("/workout_note", methods=["POST"])
def workout_note():
    note = request.form.get("notes", "").strip()
    with get_db() as conn:
        workout_id = get_or_create_today_workout(conn)
        conn.execute("UPDATE workouts SET notes=? WHERE id=?", (note, workout_id))
    flash("メモを保存しました。", "success")
    return redirect(url_for("index"))


@app.route("/history")
def history():
    days = int(request.args.get("days", 14))
    since = (date.today() - timedelta(days=days - 1)).isoformat()

    with get_db() as conn:
        workouts = conn.execute(
            "SELECT * FROM workouts WHERE date >= ? ORDER BY date DESC", (since,)
        ).fetchall()

        history_data = []
        for w in workouts:
            sets = conn.execute("""
                SELECT ws.set_number, ws.value, ws.notes, e.name, e.unit
                FROM workout_sets ws
                JOIN exercises e ON e.id = ws.exercise_id
                WHERE ws.workout_id = ?
                ORDER BY e.name, ws.set_number
            """, (w["id"],)).fetchall()

            grouped = {}
            for s in sets:
                grouped.setdefault(s["name"], {"unit": s["unit"], "sets": []})["sets"].append(s)

            history_data.append({"workout": w, "grouped": grouped})

    return render_template("history.html",
                           history_data=history_data,
                           days=days,
                           unit_label=unit_label)


@app.route("/progress")
def progress_list():
    with get_db() as conn:
        exercises = list_exercises(conn)
    grouped_ex = {}
    for ex in exercises:
        grouped_ex.setdefault(ex["category"], []).append(ex)
    return render_template("progress_list.html", grouped_ex=grouped_ex)


@app.route("/progress/<int:exercise_id>")
def progress(exercise_id):
    with get_db() as conn:
        ex = conn.execute("SELECT * FROM exercises WHERE id=?", (exercise_id,)).fetchone()
        if not ex:
            flash("種目が見つかりません。", "error")
            return redirect(url_for("progress_list"))

        rows = conn.execute("""
            SELECT w.date,
                   COUNT(ws.id)   AS total_sets,
                   SUM(ws.value)  AS total_volume,
                   MAX(ws.value)  AS best_set
            FROM workout_sets ws
            JOIN workouts w ON w.id = ws.workout_id
            WHERE ws.exercise_id = ?
            GROUP BY w.date
            ORDER BY w.date DESC
            LIMIT 30
        """, (exercise_id,)).fetchall()

    best = max((r["best_set"] for r in rows), default=0)
    chart_labels = [r["date"] for r in reversed(rows)]
    chart_best = [r["best_set"] for r in reversed(rows)]
    chart_volume = [r["total_volume"] for r in reversed(rows)]

    return render_template("progress.html",
                           ex=ex,
                           rows=rows,
                           best=best,
                           chart_labels=chart_labels,
                           chart_best=chart_best,
                           chart_volume=chart_volume,
                           unit_label=unit_label)


@app.route("/exercises", methods=["GET", "POST"])
def exercises():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        category = request.form.get("category", "").strip()
        unit = request.form.get("unit", "").strip()

        if not name or category not in CATEGORIES.values() or unit not in ("reps", "seconds"):
            flash("入力内容を確認してください。", "error")
        else:
            with get_db() as conn:
                try:
                    conn.execute(
                        "INSERT INTO exercises (name, category, unit) VALUES (?,?,?)",
                        (name, category, unit),
                    )
                    flash(f"「{name}」を追加しました。", "success")
                except sqlite3.IntegrityError:
                    flash(f"「{name}」はすでに登録されています。", "error")
        return redirect(url_for("exercises"))

    with get_db() as conn:
        all_ex = list_exercises(conn)

    grouped_ex = {}
    for ex in all_ex:
        grouped_ex.setdefault(ex["category"], []).append(ex)

    return render_template("exercises.html",
                           grouped_ex=grouped_ex,
                           categories=CATEGORIES,
                           unit_label=unit_label)


@app.route("/stats")
def stats():
    with get_db() as conn:
        total_workouts = conn.execute("SELECT COUNT(*) FROM workouts").fetchone()[0]
        total_sets = conn.execute("SELECT COUNT(*) FROM workout_sets").fetchone()[0]
        total_exercises = conn.execute("SELECT COUNT(*) FROM exercises").fetchone()[0]
        streak = _calc_streak(conn)

        top5 = conn.execute("""
            SELECT e.name, SUM(ws.value) AS vol, e.unit
            FROM workout_sets ws
            JOIN exercises e ON e.id = ws.exercise_id
            JOIN workouts w ON w.id = ws.workout_id
            WHERE w.date >= ?
            GROUP BY ws.exercise_id
            ORDER BY vol DESC
            LIMIT 5
        """, ((date.today() - timedelta(days=30)).isoformat(),)).fetchall()

        monthly = conn.execute("""
            SELECT strftime('%Y-%m', date) AS month, COUNT(*) AS cnt
            FROM workouts
            GROUP BY month
            ORDER BY month DESC
            LIMIT 6
        """).fetchall()

    return render_template("stats.html",
                           total_workouts=total_workouts,
                           total_sets=total_sets,
                           total_exercises=total_exercises,
                           streak=streak,
                           top5=top5,
                           monthly=monthly,
                           unit_label=unit_label)


if __name__ == "__main__":
    import socket
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = "127.0.0.1"
    print(f"\n  アクセスURL: http://{local_ip}:5000")
    print("  (同じWi-Fiのスマホからアクセスできます)\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
