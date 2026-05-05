#!/usr/bin/env python3
"""カリステニクストレーニング記録管理アプリ"""

import sqlite3
import os
from datetime import datetime, date, timedelta
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "training.db")

CATEGORIES = {
    "1": "上半身プッシュ",
    "2": "上半身プル",
    "3": "下半身",
    "4": "コア",
    "5": "全身",
}

PRESET_EXERCISES = [
    ("プッシュアップ",       "上半身プッシュ", "reps"),
    ("ダイヤモンドプッシュアップ", "上半身プッシュ", "reps"),
    ("パイクプッシュアップ",  "上半身プッシュ", "reps"),
    ("ワイドプッシュアップ",  "上半身プッシュ", "reps"),
    ("ディップス",           "上半身プッシュ", "reps"),
    ("プルアップ",           "上半身プル",    "reps"),
    ("チンアップ",           "上半身プル",    "reps"),
    ("オーストラリアンプルアップ", "上半身プル", "reps"),
    ("マッスルアップ",       "上半身プル",    "reps"),
    ("インバーテッドロウ",   "上半身プル",    "reps"),
    ("スクワット",           "下半身",        "reps"),
    ("ランジ",               "下半身",        "reps"),
    ("ピストルスクワット",   "下半身",        "reps"),
    ("グルートブリッジ",     "下半身",        "reps"),
    ("カーフレイズ",         "下半身",        "reps"),
    ("プランク",             "コア",          "seconds"),
    ("サイドプランク",       "コア",          "seconds"),
    ("Lシット",              "コア",          "seconds"),
    ("ハンギングレッグレイズ", "コア",         "reps"),
    ("マウンテンクライマー", "コア",          "reps"),
    ("バーピー",             "全身",          "reps"),
    ("ジャンピングジャック", "全身",          "reps"),
    ("ハンドスタンド",       "全身",          "seconds"),
]

# ── DB ─────────────────────────────────────────────────────────────────────

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS exercises (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL UNIQUE,
                category    TEXT    NOT NULL,
                unit        TEXT    NOT NULL CHECK(unit IN ('reps','seconds'))
            );

            CREATE TABLE IF NOT EXISTS workouts (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                date    TEXT    NOT NULL,
                notes   TEXT    DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS workout_sets (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id  INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
                exercise_id INTEGER NOT NULL REFERENCES exercises(id),
                set_number  INTEGER NOT NULL,
                value       INTEGER NOT NULL,
                notes       TEXT    DEFAULT ''
            );
        """)
        # プリセット種目を初期登録
        for name, cat, unit in PRESET_EXERCISES:
            conn.execute(
                "INSERT OR IGNORE INTO exercises (name, category, unit) VALUES (?,?,?)",
                (name, cat, unit),
            )


# ── helpers ────────────────────────────────────────────────────────────────

def clear():
    os.system("clear" if os.name == "posix" else "cls")


def hr(char="─", width=50):
    print(char * width)


def header(title: str):
    clear()
    hr("═")
    print(f"  {title}")
    hr("═")


def pause():
    input("\n[Enter] で戻る...")


def pick_int(prompt: str, lo: int, hi: int) -> int:
    while True:
        try:
            v = int(input(prompt))
            if lo <= v <= hi:
                return v
            print(f"  {lo}〜{hi} の数値を入力してください。")
        except ValueError:
            print("  数値を入力してください。")


def today_str() -> str:
    return date.today().isoformat()


def unit_label(unit: str) -> str:
    return "回" if unit == "reps" else "秒"


# ── exercise management ────────────────────────────────────────────────────

def list_exercises(conn, category: str | None = None):
    sql = "SELECT * FROM exercises"
    params: list = []
    if category:
        sql += " WHERE category = ?"
        params.append(category)
    sql += " ORDER BY category, name"
    return conn.execute(sql, params).fetchall()


def exercise_menu():
    while True:
        header("種目管理")
        print("1. 種目一覧を表示")
        print("2. カテゴリ別に表示")
        print("3. 種目を追加")
        print("0. 戻る")
        hr()
        choice = input("選択: ").strip()

        if choice == "1":
            _show_exercises()
        elif choice == "2":
            _show_exercises_by_category()
        elif choice == "3":
            _add_exercise()
        elif choice == "0":
            break


def _show_exercises(category=None):
    header("種目一覧" if not category else f"種目一覧 [{category}]")
    with get_db() as conn:
        rows = list_exercises(conn, category)
    if not rows:
        print("  種目がありません。")
    else:
        cur_cat = None
        for r in rows:
            if r["category"] != cur_cat:
                cur_cat = r["category"]
                print(f"\n【{cur_cat}】")
            print(f"  {r['id']:3d}. {r['name']}  ({unit_label(r['unit'])})")
    pause()


def _show_exercises_by_category():
    header("カテゴリ選択")
    for k, v in CATEGORIES.items():
        print(f"{k}. {v}")
    print("0. 戻る")
    hr()
    choice = input("選択: ").strip()
    if choice in CATEGORIES:
        _show_exercises(CATEGORIES[choice])


def _add_exercise():
    header("種目を追加")
    name = input("種目名: ").strip()
    if not name:
        print("種目名を入力してください。")
        pause()
        return

    print("\nカテゴリ:")
    for k, v in CATEGORIES.items():
        print(f"  {k}. {v}")
    cat_key = input("選択: ").strip()
    if cat_key not in CATEGORIES:
        print("無効な選択です。")
        pause()
        return
    category = CATEGORIES[cat_key]

    print("\n単位:")
    print("  1. 回数 (reps)")
    print("  2. 秒数 (seconds)")
    unit_choice = input("選択: ").strip()
    unit = "reps" if unit_choice == "1" else "seconds" if unit_choice == "2" else None
    if not unit:
        print("無効な選択です。")
        pause()
        return

    with get_db() as conn:
        try:
            conn.execute(
                "INSERT INTO exercises (name, category, unit) VALUES (?,?,?)",
                (name, category, unit),
            )
            print(f"\n✓ 「{name}」を追加しました。")
        except sqlite3.IntegrityError:
            print(f"\n「{name}」はすでに登録されています。")
    pause()


# ── workout recording ──────────────────────────────────────────────────────

def get_or_create_today_workout(conn) -> int:
    today = today_str()
    row = conn.execute(
        "SELECT id FROM workouts WHERE date = ?", (today,)
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO workouts (date, notes) VALUES (?, '')", (today,)
    )
    return cur.lastrowid


def record_menu():
    while True:
        header("トレーニングを記録")
        with get_db() as conn:
            workout_id = get_or_create_today_workout(conn)
            sets = conn.execute("""
                SELECT ws.*, e.name, e.unit
                FROM workout_sets ws
                JOIN exercises e ON e.id = ws.exercise_id
                WHERE ws.workout_id = ?
                ORDER BY ws.id
            """, (workout_id,)).fetchall()

        print(f"  日付: {today_str()}\n")
        if sets:
            print("  本日の記録:")
            cur_ex = None
            for s in sets:
                if s["name"] != cur_ex:
                    cur_ex = s["name"]
                    print(f"\n  【{cur_ex}】")
                print(f"    セット{s['set_number']}: {s['value']} {unit_label(s['unit'])}"
                      + (f"  ({s['notes']})" if s["notes"] else ""))
        else:
            print("  まだ記録がありません。")

        hr()
        print("1. セットを追加")
        print("2. セットを削除")
        print("3. ワークアウトにメモを追加")
        print("0. 戻る")
        hr()
        choice = input("選択: ").strip()

        if choice == "1":
            _add_set()
        elif choice == "2":
            _delete_set()
        elif choice == "3":
            _add_workout_note()
        elif choice == "0":
            break


def _add_set():
    header("セットを追加")
    with get_db() as conn:
        exercises = list_exercises(conn)

    if not exercises:
        print("種目がありません。先に種目を追加してください。")
        pause()
        return

    cur_cat = None
    for ex in exercises:
        if ex["category"] != cur_cat:
            cur_cat = ex["category"]
            print(f"\n【{cur_cat}】")
        print(f"  {ex['id']:3d}. {ex['name']}  ({unit_label(ex['unit'])})")

    hr()
    ex_id_str = input("種目番号を入力 (0でキャンセル): ").strip()
    if ex_id_str == "0":
        return

    with get_db() as conn:
        ex = conn.execute("SELECT * FROM exercises WHERE id = ?", (ex_id_str,)).fetchone()
    if not ex:
        print("無効な番号です。")
        pause()
        return

    label = unit_label(ex["unit"])
    print(f"\n種目: {ex['name']}")

    n_sets = pick_int("セット数を入力: ", 1, 20)
    values = []
    for i in range(1, n_sets + 1):
        v = pick_int(f"  セット{i} の{label}数: ", 1, 9999)
        note = input(f"  セット{i} のメモ (任意): ").strip()
        values.append((v, note))

    with get_db() as conn:
        workout_id = get_or_create_today_workout(conn)
        existing = conn.execute(
            "SELECT MAX(set_number) as max_s FROM workout_sets WHERE workout_id=? AND exercise_id=?",
            (workout_id, ex["id"]),
        ).fetchone()
        start = (existing["max_s"] or 0) + 1

        for i, (v, note) in enumerate(values):
            conn.execute(
                "INSERT INTO workout_sets (workout_id, exercise_id, set_number, value, notes) VALUES (?,?,?,?,?)",
                (workout_id, ex["id"], start + i, v, note),
            )

    print(f"\n✓ {ex['name']} {n_sets}セットを記録しました。")
    pause()


def _delete_set():
    header("セットを削除")
    with get_db() as conn:
        workout_id = get_or_create_today_workout(conn)
        sets = conn.execute("""
            SELECT ws.id, ws.set_number, ws.value, e.name, e.unit
            FROM workout_sets ws
            JOIN exercises e ON e.id = ws.exercise_id
            WHERE ws.workout_id = ?
            ORDER BY ws.id
        """, (workout_id,)).fetchall()

    if not sets:
        print("削除できる記録がありません。")
        pause()
        return

    for s in sets:
        print(f"  {s['id']:4d}. {s['name']} セット{s['set_number']}: {s['value']} {unit_label(s['unit'])}")

    hr()
    sid = input("削除するID (0でキャンセル): ").strip()
    if sid == "0":
        return

    with get_db() as conn:
        cur = conn.execute("DELETE FROM workout_sets WHERE id = ?", (sid,))
        if cur.rowcount:
            print("✓ 削除しました。")
        else:
            print("IDが見つかりません。")
    pause()


def _add_workout_note():
    header("メモを追加")
    note = input("メモ: ").strip()
    with get_db() as conn:
        workout_id = get_or_create_today_workout(conn)
        conn.execute("UPDATE workouts SET notes = ? WHERE id = ?", (note, workout_id))
    print("✓ メモを保存しました。")
    pause()


# ── history & progress ─────────────────────────────────────────────────────

def history_menu():
    while True:
        header("履歴・進捗")
        print("1. 最近のトレーニング履歴")
        print("2. 種目別の進捗を見る")
        print("3. 日付を指定して表示")
        print("0. 戻る")
        hr()
        choice = input("選択: ").strip()

        if choice == "1":
            _show_recent_history()
        elif choice == "2":
            _show_exercise_progress()
        elif choice == "3":
            _show_by_date()
        elif choice == "0":
            break


def _show_recent_history(days: int = 7):
    header(f"最近 {days} 日間のトレーニング")
    since = (date.today() - timedelta(days=days - 1)).isoformat()

    with get_db() as conn:
        workouts = conn.execute(
            "SELECT * FROM workouts WHERE date >= ? ORDER BY date DESC", (since,)
        ).fetchall()

    if not workouts:
        print("  記録がありません。")
        pause()
        return

    with get_db() as conn:
        for w in workouts:
            print(f"\n  ▶ {w['date']}" + (f"  [{w['notes']}]" if w["notes"] else ""))
            sets = conn.execute("""
                SELECT ws.set_number, ws.value, ws.notes, e.name, e.unit
                FROM workout_sets ws
                JOIN exercises e ON e.id = ws.exercise_id
                WHERE ws.workout_id = ?
                ORDER BY e.name, ws.set_number
            """, (w["id"],)).fetchall()
            cur_ex = None
            for s in sets:
                if s["name"] != cur_ex:
                    cur_ex = s["name"]
                    print(f"    【{cur_ex}】")
                print(f"      セット{s['set_number']}: {s['value']} {unit_label(s['unit'])}"
                      + (f"  ({s['notes']})" if s["notes"] else ""))
    pause()


def _show_exercise_progress():
    header("種目を選択")
    with get_db() as conn:
        exercises = list_exercises(conn)

    cur_cat = None
    for ex in exercises:
        if ex["category"] != cur_cat:
            cur_cat = ex["category"]
            print(f"\n【{cur_cat}】")
        print(f"  {ex['id']:3d}. {ex['name']}")

    hr()
    ex_id_str = input("種目番号 (0でキャンセル): ").strip()
    if ex_id_str == "0":
        return

    with get_db() as conn:
        ex = conn.execute("SELECT * FROM exercises WHERE id = ?", (ex_id_str,)).fetchone()
        if not ex:
            print("無効な番号です。")
            pause()
            return

        rows = conn.execute("""
            SELECT w.date,
                   COUNT(ws.id)       AS total_sets,
                   SUM(ws.value)      AS total_volume,
                   MAX(ws.value)      AS best_set
            FROM workout_sets ws
            JOIN workouts w ON w.id = ws.workout_id
            WHERE ws.exercise_id = ?
            GROUP BY w.date
            ORDER BY w.date DESC
            LIMIT 20
        """, (ex["id"],)).fetchall()

    header(f"進捗: {ex['name']}")
    label = unit_label(ex["unit"])
    if not rows:
        print("  記録がありません。")
    else:
        print(f"  {'日付':<12} {'セット数':>6} {'合計':>8} {'最高':>8}")
        hr("-")
        for r in rows:
            print(f"  {r['date']:<12} {r['total_sets']:>6} {r['total_volume']:>7}{label} {r['best_set']:>7}{label}")
        hr("-")
        all_time_best = max(r["best_set"] for r in rows)
        print(f"  自己ベスト: {all_time_best} {label}")
    pause()


def _show_by_date():
    header("日付を指定")
    d = input("日付を入力 (YYYY-MM-DD, 例: 2026-01-15): ").strip()
    try:
        datetime.strptime(d, "%Y-%m-%d")
    except ValueError:
        print("日付の形式が正しくありません。")
        pause()
        return

    with get_db() as conn:
        workout = conn.execute(
            "SELECT * FROM workouts WHERE date = ?", (d,)
        ).fetchone()

    if not workout:
        print(f"\n  {d} の記録はありません。")
        pause()
        return

    header(f"記録: {d}")
    if workout["notes"]:
        print(f"  メモ: {workout['notes']}")

    with get_db() as conn:
        sets = conn.execute("""
            SELECT ws.set_number, ws.value, ws.notes, e.name, e.unit
            FROM workout_sets ws
            JOIN exercises e ON e.id = ws.exercise_id
            WHERE ws.workout_id = ?
            ORDER BY e.name, ws.set_number
        """, (workout["id"],)).fetchall()

    cur_ex = None
    for s in sets:
        if s["name"] != cur_ex:
            cur_ex = s["name"]
            print(f"\n  【{cur_ex}】")
        print(f"    セット{s['set_number']}: {s['value']} {unit_label(s['unit'])}"
              + (f"  ({s['notes']})" if s["notes"] else ""))
    pause()


# ── statistics ─────────────────────────────────────────────────────────────

def stats_menu():
    header("統計サマリー")
    with get_db() as conn:
        total_workouts = conn.execute("SELECT COUNT(*) FROM workouts").fetchone()[0]
        total_sets = conn.execute("SELECT COUNT(*) FROM workout_sets").fetchone()[0]
        total_exercises = conn.execute("SELECT COUNT(*) FROM exercises").fetchone()[0]

        streak = _calc_streak(conn)

        recent = conn.execute("""
            SELECT e.name, SUM(ws.value) AS vol, e.unit
            FROM workout_sets ws
            JOIN exercises e ON e.id = ws.exercise_id
            JOIN workouts w ON w.id = ws.workout_id
            WHERE w.date >= ?
            GROUP BY ws.exercise_id
            ORDER BY vol DESC
            LIMIT 5
        """, ((date.today() - timedelta(days=30)).isoformat(),)).fetchall()

    print(f"\n  総トレーニング日数: {total_workouts} 日")
    print(f"  総セット数:         {total_sets} セット")
    print(f"  登録種目数:         {total_exercises} 種目")
    print(f"  連続トレーニング:   {streak} 日")

    if recent:
        print("\n  【直近30日間 ボリューム上位5種目】")
        hr("-")
        for r in recent:
            print(f"    {r['name']:<22} {r['vol']:>6} {unit_label(r['unit'])}")

    pause()


def _calc_streak(conn) -> int:
    rows = conn.execute(
        "SELECT date FROM workouts ORDER BY date DESC"
    ).fetchall()
    if not rows:
        return 0

    streak = 0
    check = date.today()
    dates = {r["date"] for r in rows}

    while check.isoformat() in dates:
        streak += 1
        check -= timedelta(days=1)
    return streak


# ── main menu ──────────────────────────────────────────────────────────────

def main():
    init_db()
    while True:
        header("カリステニクス トレーニング記録")
        print("1. トレーニングを記録する")
        print("2. 履歴・進捗を見る")
        print("3. 種目を管理する")
        print("4. 統計サマリー")
        print("0. 終了")
        hr()
        choice = input("選択: ").strip()

        if choice == "1":
            record_menu()
        elif choice == "2":
            history_menu()
        elif choice == "3":
            exercise_menu()
        elif choice == "4":
            stats_menu()
        elif choice == "0":
            clear()
            print("お疲れ様でした！")
            break


if __name__ == "__main__":
    main()
