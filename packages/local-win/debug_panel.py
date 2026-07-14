"""
debug_panel.py — forward-facing OCR diagnostics window for the tray app.

Opened from the tray icon (right-click > OCR diagnostics). Lets the user
temporarily switch the tracker from its standard delete-immediately capture
handling (restored when this window closes) to a rolling buffer of the last
30 screenshots, shown as a vertical list: newest on top, older shots
animating downward until they fall past the "deleted forever" line at the
bottom. Clicking a shot shows the full screenshot, the raw OCR output, and
the verdict the tracker derived from it ("not on the World Tour page",
"read current points = 12", ...). "Keep" pulls a shot out of the rolling
buffer and saves it to debug_captures\\ so it can be shared.

Threading: pystray menu handlers and the tracker loop each run on their own
threads, but ALL Tk calls happen on the single panel thread spawned here —
Tkinter objects must only ever be touched from the thread that created
them. The tracker communicates one-way through season_tracker.DEBUG_BUFFER's
thread-safe event queue, which the panel drains from a root.after() tick.
"""

from __future__ import annotations

import io
import threading
import tkinter as tk
from tkinter import ttk

from PIL import Image, ImageTk

import season_tracker as st

_lock = threading.Lock()
_thread: threading.Thread | None = None
_focus_requested = threading.Event()


def open_panel() -> None:
    """Open the diagnostics window, or focus it if it's already open.
    Safe to call from any thread (i.e. the pystray menu handler)."""
    global _thread
    with _lock:
        if _thread is not None and _thread.is_alive():
            _focus_requested.set()
            return
        _thread = threading.Thread(target=_run, name="ocr-diagnostics", daemon=True)
        _thread.start()


# Layout constants. ROW_H is the vertical slot each screenshot row occupies
# on the canvas; rows tween between slot positions rather than jumping.
ROW_H = 100
THUMB_W = 240
TOP_PAD = 10
LEFT_PAD = 10
TICK_MS = 25          # ~40fps animation/queue-drain tick
EASE = 0.22           # fraction of remaining distance covered per tick

BG = "#1e1e1e"
FG = "#e0e0e0"
FG_DIM = "#9a9a9a"
ROW_BG = "#2a2a2a"
ACCENT = "#d9534f"    # deletion-zone red


def _run() -> None:
    buf = st.DEBUG_BUFFER
    # Drain any events left over from a previous open — they describe
    # records that were cleared when that window closed.
    while not buf.events.empty():
        try:
            buf.events.get_nowait()
        except Exception:
            break

    root = tk.Tk()
    root.title("Season Sprint — OCR diagnostics")
    root.geometry("640x700")
    root.configure(bg=BG)
    _Panel(root, buf)
    root.mainloop()


class _Row:
    """One screenshot entry in the rolling list: a frame embedded in the
    canvas as a window item, tweening toward target_y each tick."""

    def __init__(self, panel: "_Panel", rec) -> None:
        self.rec = rec
        self.dying = False

        f = tk.Frame(panel.canvas, bg=ROW_BG, padx=6, pady=6, cursor="hand2")
        img = Image.open(io.BytesIO(rec.png_bytes))
        img.thumbnail((THUMB_W, ROW_H - 16))
        self.thumb = ImageTk.PhotoImage(img)  # ref held or Tk drops the image
        thumb_lbl = tk.Label(f, image=self.thumb, bg=ROW_BG)
        thumb_lbl.pack(side="left")

        info = tk.Frame(f, bg=ROW_BG)
        info.pack(side="left", fill="both", expand=True, padx=(8, 0))
        head = tk.Frame(info, bg=ROW_BG)
        head.pack(fill="x")
        tk.Label(
            head, text=f"#{rec.seq}  {rec.timestamp:%H:%M:%S}",
            bg=ROW_BG, fg=FG, font=("Segoe UI", 9, "bold"),
        ).pack(side="left")
        tk.Button(
            head, text="Keep", command=lambda: panel.keep(self),
            bg="#3a3a3a", fg=FG, activebackground="#4a4a4a",
            activeforeground=FG, relief="flat", padx=8,
        ).pack(side="right")
        tk.Label(
            info, text=rec.verdict, bg=ROW_BG, fg=FG_DIM,
            font=("Segoe UI", 9), wraplength=300, justify="left", anchor="nw",
        ).pack(fill="both", expand=True)

        for w in (f, thumb_lbl, info, head, *info.winfo_children(), *head.winfo_children()):
            if not isinstance(w, tk.Button):
                w.bind("<Button-1>", lambda _e: panel.show_detail(self.rec))

        self.y = float(TOP_PAD - ROW_H)  # slide in from above the list
        self.target_y = float(TOP_PAD)
        self.win = panel.canvas.create_window(
            LEFT_PAD, self.y, window=f, anchor="nw",
            width=panel.row_width(), height=ROW_H - 8,
        )
        self.frame = f


class _Panel:
    def __init__(self, root: tk.Tk, buf) -> None:
        self.root = root
        self.buf = buf
        self.rows: list[_Row] = []      # newest first; index = slot on canvas
        self.dying: list[_Row] = []     # evicted rows still animating out
        self.kept_thumbs: list = []     # PhotoImage refs for the kept strip

        # ── Header: buffering toggle + status line ──
        header = tk.Frame(root, bg=BG, padx=10, pady=8)
        header.pack(fill="x")
        self.buffering = tk.BooleanVar(value=False)
        tk.Checkbutton(
            header,
            text=f"Buffer the last {buf.maxlen} screenshots for diagnosis",
            variable=self.buffering, command=self._toggle,
            bg=BG, fg=FG, activebackground=BG, activeforeground=FG,
            selectcolor="#333333", font=("Segoe UI", 10),
        ).pack(anchor="w")
        tk.Label(
            header,
            text="Standard behavior (screenshots deleted immediately) resumes "
                 "when this window closes.",
            bg=BG, fg=FG_DIM, font=("Segoe UI", 8),
        ).pack(anchor="w")
        self.status = tk.Label(
            header, text="buffering off — screenshots are deleted immediately",
            bg=BG, fg=FG_DIM, font=("Segoe UI", 9, "italic"),
            wraplength=600, justify="left",
        )
        self.status.pack(anchor="w", pady=(6, 0))

        # ── Kept screenshots strip (hidden until first Keep) ──
        self.kept_frame = tk.LabelFrame(
            root, text=" Kept screenshots (saved to debug_captures) ",
            bg=BG, fg=FG, font=("Segoe UI", 9),
        )

        # ── Rolling list canvas ──
        body = tk.Frame(root, bg=BG)
        body.pack(fill="both", expand=True, padx=10, pady=(4, 10))
        self.canvas = tk.Canvas(body, bg=BG, highlightthickness=0)
        sb = ttk.Scrollbar(body, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)
        self.canvas.bind_all(
            "<MouseWheel>",
            lambda e: self.canvas.yview_scroll(-1 * (e.delta // 120), "units"),
        )

        # Deletion zone: a dashed line + label that sit just below the last
        # row (capped at the 30th slot). Rows animating past it are being
        # destroyed — that's the "deleted forever" cue.
        self.line_y = float(self._line_target())
        self.line = self.canvas.create_line(
            LEFT_PAD, self.line_y, 600, self.line_y,
            fill=ACCENT, dash=(6, 4), width=2,
        )
        self.line_label = self.canvas.create_text(
            LEFT_PAD, self.line_y + 10, anchor="nw", fill=ACCENT,
            font=("Segoe UI", 9, "bold"),
            text="\U0001f5d1 screenshots pushed past this line are deleted forever",
        )
        self._update_scrollregion()

        self.canvas.bind("<Configure>", self._on_resize)
        root.protocol("WM_DELETE_WINDOW", self._on_close)
        root.after(TICK_MS, self._tick)

    def row_width(self) -> int:
        # Before the first layout pass winfo_width() reports 1; fall back to
        # a width matching the initial 640px window.
        w = self.canvas.winfo_width()
        return w - LEFT_PAD * 2 if w > 100 else 580

    def _on_resize(self, _event) -> None:
        for row in self.rows + self.dying:
            self.canvas.itemconfigure(row.win, width=self.row_width())

    # ── Buffer toggle / close ──

    def _toggle(self) -> None:
        on = self.buffering.get()
        self.buf.set_enabled(on)
        if on:
            self.status.config(text="buffering on — waiting for the next capture ...")
        # The off path gets its status text from the ("cleared",) event.

    def _on_close(self) -> None:
        self.buf.set_enabled(False)  # restore standard delete-immediately behavior
        self.root.destroy()

    # ── Event pump + animation tick ──

    def _tick(self) -> None:
        if _focus_requested.is_set():
            _focus_requested.clear()
            self.root.deiconify()
            self.root.lift()
            self.root.focus_force()

        while not self.buf.events.empty():
            try:
                ev = self.buf.events.get_nowait()
            except Exception:
                break
            kind = ev[0]
            if kind == "added":
                self._on_added(ev[1])
            elif kind == "evicted":
                self._on_evicted(ev[1])
            elif kind == "cleared":
                self._on_cleared()
            elif kind == "status":
                self.status.config(text=ev[1])

        self._animate()
        self.root.after(TICK_MS, self._tick)

    def _animate(self) -> None:
        for row in self.rows + self.dying:
            dy = row.target_y - row.y
            if abs(dy) < 1.0:
                row.y = row.target_y
            else:
                row.y += dy * EASE
            self.canvas.coords(row.win, LEFT_PAD, row.y)
        for row in [r for r in self.dying if r.y == r.target_y]:
            self.dying.remove(row)
            self.canvas.delete(row.win)
            row.frame.destroy()

        dy = self._line_target() - self.line_y
        if abs(dy) < 1.0:
            self.line_y = float(self._line_target())
        else:
            self.line_y += dy * EASE
        w = max(self.canvas.winfo_width() - LEFT_PAD, 600)
        self.canvas.coords(self.line, LEFT_PAD, self.line_y, w, self.line_y)
        self.canvas.coords(self.line_label, LEFT_PAD, self.line_y + 10)

    # ── Event handlers ──

    def _slot_y(self, index: int) -> float:
        return float(TOP_PAD + index * ROW_H)

    def _line_target(self) -> float:
        return self._slot_y(min(len(self.rows), self.buf.maxlen)) + 6

    def _retarget(self) -> None:
        for i, row in enumerate(self.rows):
            row.target_y = self._slot_y(i)
        self._update_scrollregion()

    def _update_scrollregion(self) -> None:
        bottom = self._line_target() + ROW_H
        self.canvas.configure(scrollregion=(0, 0, 620, bottom))

    def _on_added(self, rec) -> None:
        self.rows.insert(0, _Row(self, rec))
        self._retarget()
        self.status.config(text=f"last capture {rec.timestamp:%H:%M:%S}: {rec.verdict}")

    def _on_evicted(self, seq: int) -> None:
        row = next((r for r in self.rows if r.rec.seq == seq), None)
        if row is None:
            return
        self.rows.remove(row)
        row.dying = True
        row.target_y = self._line_target() + ROW_H  # push it past the line
        self.dying.append(row)
        self._retarget()

    def _on_cleared(self) -> None:
        for row in self.rows + self.dying:
            self.canvas.delete(row.win)
            row.frame.destroy()
        self.rows.clear()
        self.dying.clear()
        self.line_y = float(self._line_target())
        self._update_scrollregion()
        self.status.config(text="buffering off — screenshots are deleted immediately")

    # ── Keep (protect from deletion) ──

    def keep(self, row: _Row) -> None:
        path = self.buf.protect(row.rec.seq)
        if path is None:  # already rolled off between click and handling
            return
        self.rows.remove(row)
        self.canvas.delete(row.win)
        row.frame.destroy()
        self._retarget()
        self._add_kept(row.rec, path)

    def _add_kept(self, rec, path) -> None:
        if not self.kept_frame.winfo_ismapped():
            self.kept_frame.pack(fill="x", padx=10, pady=(0, 4), before=self.canvas.master)
        entry = tk.Frame(self.kept_frame, bg=BG, cursor="hand2")
        entry.pack(fill="x", padx=6, pady=3)
        img = Image.open(io.BytesIO(rec.png_bytes))
        img.thumbnail((120, 44))
        thumb = ImageTk.PhotoImage(img)
        self.kept_thumbs.append(thumb)
        tk.Label(entry, image=thumb, bg=BG).pack(side="left")
        tk.Label(
            entry,
            text=f"\U0001f4cc #{rec.seq}  {rec.timestamp:%H:%M:%S} — saved to {path.name}",
            bg=BG, fg=FG, font=("Segoe UI", 9), anchor="w",
        ).pack(side="left", padx=(8, 0))
        for w in (entry, *entry.winfo_children()):
            w.bind("<Button-1>", lambda _e: self.show_detail(rec))

    # ── Detail view ──

    def show_detail(self, rec) -> None:
        win = tk.Toplevel(self.root)
        win.title(f"Capture #{rec.seq} — {rec.timestamp:%H:%M:%S}")
        win.configure(bg=BG)

        img = Image.open(io.BytesIO(rec.png_bytes))
        # Cap to a sane window size; the region is already a monitor crop.
        img.thumbnail((1000, 500))
        photo = ImageTk.PhotoImage(img)
        win._photo = photo  # keep a ref alive for the window's lifetime
        tk.Label(win, image=photo, bg=BG).pack(padx=12, pady=(12, 8))

        tk.Label(
            win, text=f"Verdict: {rec.verdict}",
            bg=BG, fg=FG, font=("Segoe UI", 10, "bold"),
            wraplength=960, justify="left",
        ).pack(anchor="w", padx=12)
        tk.Label(
            win, text=f"OCR took {rec.ocr_ms:.0f}ms — raw output:",
            bg=BG, fg=FG_DIM, font=("Segoe UI", 9),
        ).pack(anchor="w", padx=12, pady=(8, 2))

        text = tk.Text(
            win, height=max(3, min(10, len(rec.ocr_lines) + 1)), width=80,
            bg="#141414", fg=FG, relief="flat", font=("Consolas", 9),
        )
        if rec.ocr_lines:
            for line, conf in rec.ocr_lines:
                text.insert("end", f"conf={conf:.2f}  {line!r}\n")
        else:
            text.insert("end", "<no text boxes detected>\n")
        text.config(state="disabled")
        text.pack(fill="x", padx=12)

        footer = tk.Frame(win, bg=BG)
        footer.pack(fill="x", padx=12, pady=10)
        if rec.saved_path is not None:
            tk.Label(
                footer, text=f"\U0001f4cc kept — saved to {rec.saved_path}",
                bg=BG, fg=FG_DIM, font=("Segoe UI", 9),
            ).pack(side="left")
        else:
            def _keep_from_detail():
                row = next((r for r in self.rows if r.rec.seq == rec.seq), None)
                if row is not None:
                    self.keep(row)
                win.destroy()

            tk.Button(
                footer, text="Keep this screenshot", command=_keep_from_detail,
                bg="#3a3a3a", fg=FG, activebackground="#4a4a4a",
                activeforeground=FG, relief="flat", padx=10,
            ).pack(side="left")
