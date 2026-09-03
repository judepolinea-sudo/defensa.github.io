#!/usr/bin/env python3
"""
Defensa — Practice Data Export (styled PDF)

Renders an executive-themed HTML report to PDF.

Setup
-----
    pip install weasyprint
    # Windows also needs the GTK runtime:
    #   winget install --id tschoonj.GTKForWindows
    # (macOS: brew install pango  ·  Debian/Ubuntu: apt install libpango-1.0-0)

Run
---
    python scripts/generate_report.py                       # -> defensa-practice-data-export.pdf
    python scripts/generate_report.py out.pdf               # custom output path
    python scripts/generate_report.py out.pdf --engine chrome   # render via headless Chrome/Edge
                                                               #   (no GTK needed)

`--engine auto` (the default) tries WeasyPrint, then falls back to a headless
Chrome/Edge if one is installed, then to writing the raw .html.

Edit the DATA block below to regenerate with different numbers.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from html import escape

# ─────────────────────────────────────────────────────────────────────────────
# DATA  — edit these to regenerate
# ─────────────────────────────────────────────────────────────────────────────

EXPORT_DATE = "September 3, 2026"
EXPORT_TIME = "4:25 PM"

PROFILE = {
    "Student Name": "Student4  (Jude Poline Echeche Austria)",
    "Email": "st4@nu-clark.edu.ph",
    "Program": "BSIT — 3rd Year",
    "Methodology": "Quantitative",
    "Project Title": "Capstone Project Manuscript Guidelines",
}

# Section 2 — every practice session
SESSIONS = [
    ("09/03/2026 4:08 PM", 62, "3 / 3", "Use Case Actors, Authentication (Table 7), System Design"),
    ("08/28/2026 2:16 PM", 21, "1 / 2", "Use Case Actors & Evidence (1 skipped)"),
    ("08/28/2026 1:58 PM", 56, "1 / 1", "System Architecture Hardware (8 GB RAM requirement)"),
    ("08/28/2026 1:56 PM", 54, "1 / 1", "System Testing Status"),
    ("07/31/2026 4:41 PM", 0,  "0 / 8", "Business Plan & Entrepreneurial Mind (all skipped)"),
    ("07/29/2026 4:58 PM", 0,  "0 / 7", "Diskarte Financial Testing & Feedback (all skipped)"),
    ("07/29/2026 1:36 PM", 36, "1 / 2", "Target Beneficiaries & Business Plan Significance"),
    ("07/29/2026 1:28 PM", 0,  "0 / 1", "Operations & Equipment (skipped)"),
    ("07/29/2026 12:29 PM", 0, "0 / 5", "System Architecture & Methodology (all skipped)"),
    ("07/28/2026 6:47 PM", 11, "1 / 1", "Handling Multiple Financial Tools"),
]

# Section 3 — detailed question evaluation highlights
#   metrics: (accuracy, completeness, clarity, confidence, final)
HIGHLIGHTS = [
    {
        "session": "Session — September 3, 2026  ·  Overall 62 / 100",
        "tag": "Q1 · Actor Scoping Justification",
        "question": (
            "How does limiting actors to 'Student' and 'Administrator' justify handling "
            "all web-app requirements without introducing implicit roles?"
        ),
        "answer": (
            "Actors define core intent and permission boundaries rather than access "
            "devices; administrative sub-roles collapse under the Administrator's RBAC scope."
        ),
        "metrics": (78, 72, 85, 84, 79),
    },
    {
        "session": "Session — September 3, 2026  ·  Overall 62 / 100",
        "tag": "Q2 · Authentication Pre/Post-conditions (Table 7)",
        "question": (
            "How does 'Authenticate User' differentiate preconditions / postconditions "
            "for Student vs. Administrator?"
        ),
        "answer": "The user is designed to just log in safely with the authentication of the admin.",
        "metrics": (15, 10, 20, 90, 30),
    },
    {
        "session": "Session — September 3, 2026  ·  Overall 62 / 100",
        "tag": "Q3 · Preventing Privilege Escalation in Table 7",
        "question": (
            "How does the design ensure successful authentication does not grant Students "
            "admin functions, and where in Table 7 is this access-control logic defined?"
        ),
        "answer": (
            "Handled in Main Success Scenario steps / Extension blocks where the system "
            "verifies role flags upon credential validation."
        ),
        "metrics": (85, 65, 70, 90, 78),
    },
]

# Section 4 — older response highlights
HISTORY = [
    ("08/28/2026", "System Hardware Requirement (RAM)",
     "I could further elaborate this that it is required — wait, to run with the minimum of 8 GB RAM.", 56),
    ("08/28/2026", "Testing Status",
     "I would like to explain it in a harsh way — that we have not yet turned on the testing.", 54),
    ("07/29/2026", "Target Beneficiaries & Significance",
     "Detailed explanation on student-entrepreneurs, break-even horizons and low cap-ex as a "
     "concrete playbook for micro-financing.", 72),
    ("07/28/2026", "Handling Multiple Financial Tools",
     "Brief, unstructured response; did not address integration or reconciliation.", 11),
]

# ─────────────────────────────────────────────────────────────────────────────
# THEME
# ─────────────────────────────────────────────────────────────────────────────

DOC_TITLE = "Defensa — Practice Data Export"

CSS = """
/* Zero L/R page margin so the dark header can bleed to the paper edges;
   footer lives in the bottom margin box. Page 1 also drops the top margin
   so the header is flush with the top edge (true full-bleed). */
@page {
    size: A4;
    margin: 14mm 0 15mm 0;
    @bottom-left  { margin-left: 15mm;
                    content: "Defensa — Practice Data Export";
                    font: 8pt 'Helvetica Neue', Arial, sans-serif; color: #94a3b8; }
    @bottom-right { margin-right: 15mm;
                    content: "Page " counter(page) " of " counter(pages);
                    font: 8pt 'Helvetica Neue', Arial, sans-serif; color: #94a3b8; }
}
@page :first { margin-top: 0; }

* { box-sizing: border-box; }

body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.5;
    color: #1e293b;
    background: #f8fafc;
    margin: 0;
}

/* every non-header block is inset from the paper edge */
.wrap { padding: 0 15mm; }

/* ── full-bleed dark header ─────────────────────────────────────── */
.masthead {
    padding: 13mm 15mm 9mm;
    margin-bottom: 10mm;
    background: #0f172a;
    color: #f8fafc;
}
.masthead h1 { margin: 0; font-size: 20pt; font-weight: 700; letter-spacing: -0.01em; }
.masthead .sub { margin: 3pt 0 0; font-size: 10pt; color: #7dd3fc; font-weight: 600; }
.masthead .meta { margin: 8pt 0 0; font-size: 8.5pt; color: #cbd5e1; }

/* ── sections ──────────────────────────────────────────────────── */
h2 {
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #0284c7;
    margin: 16pt 0 6pt;
    padding-bottom: 4pt;
    border-bottom: 1.5pt solid #0284c7;
    break-after: avoid;
}
section { margin-bottom: 6pt; }
body { orphans: 3; widows: 3; }

.card {
    background: #ffffff;
    border: 1pt solid #e2e8f0;
    border-radius: 6pt;
    padding: 10pt 12pt;
}

/* ── profile table ─────────────────────────────────────────────── */
table { width: 100%; border-collapse: collapse; }
.profile td { padding: 6pt 10pt; border: 1pt solid #e2e8f0; vertical-align: top; }
.profile td.k {
    width: 34%; background: #f1f5f9; font-weight: 700; color: #475569;
    text-transform: uppercase; font-size: 8pt; letter-spacing: 0.04em;
}

/* ── data tables ───────────────────────────────────────────────── */
.grid { background: #ffffff; border: 1pt solid #e2e8f0; border-radius: 6pt; overflow: hidden; }
.grid thead { display: table-header-group; }
.grid tr { break-inside: avoid; }
.grid th {
    background: #0f172a; color: #f8fafc; font-size: 8pt; text-transform: uppercase;
    letter-spacing: 0.04em; text-align: left; padding: 7pt 9pt;
}
.grid td { padding: 6pt 9pt; border-top: 1pt solid #e2e8f0; font-size: 8.7pt; vertical-align: top; }
.grid tbody tr:nth-child(even) td { background: #f8fafc; }
.grid td.num { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }

/* ── score badges ──────────────────────────────────────────────── */
.badge {
    display: inline-block; padding: 2pt 7pt; border-radius: 10pt;
    font-size: 8pt; font-weight: 700; letter-spacing: 0.02em;
}
.b-high { background: #dcfce7; color: #15803d; }
.b-mid  { background: #fef9c3; color: #a16207; }
.b-low  { background: #ffedd5; color: #c2410c; }
.b-zero { background: #fee2e2; color: #b91c1c; }

/* ── highlight callout cards ───────────────────────────────────── */
.callout {
    background: #ffffff;
    border: 1pt solid #e2e8f0;
    border-left: 4pt solid #0284c7;
    border-radius: 6pt;
    padding: 10pt 12pt;
    margin-bottom: 9pt;
}
.callout .head-keep { break-inside: avoid; break-after: avoid; }
.metrics { break-inside: avoid; }
.callout.low { border-left-color: #dc2626; background: #fef7f7; }
.callout .ses { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
.callout .tag { font-size: 10pt; font-weight: 700; color: #0f172a; margin: 2pt 0 5pt; }
.callout .q { font-style: italic; color: #334155; margin: 0 0 5pt; }
.callout .a { margin: 0 0 8pt; }
.callout .a b { color: #475569; }

.metrics { width: 100%; border-collapse: collapse; margin-top: 2pt; }
.metrics th {
    font-size: 7pt; text-transform: uppercase; letter-spacing: 0.04em;
    color: #64748b; text-align: center; padding: 3pt 4pt; border-bottom: 1pt solid #e2e8f0;
}
.metrics td {
    text-align: center; padding: 5pt 4pt; font-size: 10pt; font-weight: 700;
    font-variant-numeric: tabular-nums;
}
.metrics td.final { color: #0284c7; }
.m-bar { height: 3pt; border-radius: 2pt; background: #e2e8f0; margin-top: 3pt; }
.m-bar > span { display: block; height: 100%; border-radius: 2pt; background: #0284c7; }
.callout.low .m-bar > span { background: #dc2626; }

.note { color: #64748b; font-size: 8.5pt; }
"""

# ─────────────────────────────────────────────────────────────────────────────
# RENDER
# ─────────────────────────────────────────────────────────────────────────────


def band(score: int) -> tuple[str, str]:
    if score == 0:
        return "b-zero", "Zero"
    if score >= 70:
        return "b-high", "High"
    if score >= 50:
        return "b-mid", "Mid"
    return "b-low", "Low"


def badge(score: int) -> str:
    cls, label = band(score)
    return f'<span class="badge {cls}">{score} / 100 · {label}</span>'


def profile_rows() -> str:
    return "".join(
        f'<tr><td class="k">{escape(k)}</td><td>{escape(v)}</td></tr>'
        for k, v in PROFILE.items()
    )


def session_rows() -> str:
    out = []
    for i, (when, score, attempted, topic) in enumerate(SESSIONS, 1):
        out.append(
            f"<tr><td class='num'>{i}</td>"
            f"<td class='num'>{escape(when)}</td>"
            f"<td>{badge(score)}</td>"
            f"<td class='num'>{escape(attempted)}</td>"
            f"<td>{escape(topic)}</td></tr>"
        )
    return "".join(out)


def metric_table(metrics: tuple[int, int, int, int, int]) -> str:
    acc, comp, clar, conf, final = metrics
    cells = [("Accuracy", acc), ("Completeness", comp), ("Clarity", clar), ("Confidence", conf)]
    head = "".join(f"<th>{n}</th>" for n, _ in cells) + "<th>Final</th>"
    body = ""
    for _, v in cells:
        body += f"<td>{v}<div class='m-bar'><span style='width:{v}%'></span></div></td>"
    body += f"<td class='final'>{final}<div class='m-bar'><span style='width:{final}%'></span></div></td>"
    return f"<table class='metrics'><tr>{head}</tr><tr>{body}</tr></table>"


def highlight_cards() -> str:
    out = []
    for h in HIGHLIGHTS:
        low = h["metrics"][4] < 50
        out.append(
            f"<div class='callout{' low' if low else ''}'>"
            f"<div class='head-keep'>"
            f"<div class='ses'>{escape(h['session'])}</div>"
            f"<div class='tag'>{escape(h['tag'])}</div>"
            f"<p class='q'>&ldquo;{escape(h['question'])}&rdquo;</p>"
            f"</div>"
            f"<p class='a'><b>Response:</b> {escape(h['answer'])}</p>"
            f"{metric_table(h['metrics'])}"
            "</div>"
        )
    return "".join(out)


def history_rows() -> str:
    out = []
    for when, topic, answer, score in HISTORY:
        out.append(
            f"<tr><td class='num'>{escape(when)}</td>"
            f"<td>{escape(topic)}</td>"
            f"<td class='note'>{escape(answer)}</td>"
            f"<td>{badge(score)}</td></tr>"
        )
    return "".join(out)


def build_html() -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{escape(DOC_TITLE)}</title>
<style>{CSS}</style>
</head>
<body>

  <div class="masthead">
    <h1>Defensa — Practice Data Export</h1>
    <p class="sub">Defense Readiness &amp; Simulation History Report</p>
    <p class="meta">Export date: {EXPORT_DATE} &nbsp;·&nbsp; Time: {EXPORT_TIME}</p>
  </div>

  <div class="wrap">

    <section>
      <h2>1 · Student Profile</h2>
      <table class="profile">{profile_rows()}</table>
    </section>

    <section>
      <h2>2 · Practice Sessions Summary</h2>
      <table class="grid">
        <thead><tr>
          <th>#</th><th>Date &amp; Time</th><th>Overall Score</th><th>Attempted</th><th>Primary Topic / Focus</th>
        </tr></thead>
        <tbody>{session_rows()}</tbody>
      </table>
    </section>

    <section>
      <h2>3 · Detailed Question Evaluation Highlights</h2>
      {highlight_cards()}
      <p class="note">Cards with a red left border scored below 50 / 100 overall and are priority review areas.</p>
    </section>

    <section>
      <h2>4 · Historical Responses</h2>
      <table class="grid">
        <thead><tr>
          <th>Date</th><th>Topic</th><th>Response Summary</th><th>Score</th>
        </tr></thead>
        <tbody>{history_rows()}</tbody>
      </table>
    </section>

  </div>
</body>
</html>"""


CHROME_CANDIDATES = [
    "chrome", "google-chrome", "chromium", "chromium-browser", "msedge",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def _find_chrome() -> str | None:
    for c in CHROME_CANDIDATES:
        found = shutil.which(c) if os.sep not in c else (c if os.path.exists(c) else None)
        if found:
            return found
    return None


def _render_weasyprint(html: str, out_path: str) -> bool:
    import contextlib
    import io

    buf = io.StringIO()
    try:
        # WeasyPrint chatters on stderr while probing for native libs — hide it.
        with contextlib.redirect_stderr(buf):
            from weasyprint import HTML  # noqa: PLC0415
    except (ImportError, OSError) as exc:
        sys.stderr.write(f"WeasyPrint unavailable ({str(exc).splitlines()[0]}).\n")
        return False
    HTML(string=html).write_pdf(out_path)
    return True


def _render_chrome(html: str, out_path: str) -> bool:
    exe = _find_chrome()
    if not exe:
        sys.stderr.write("No headless Chrome/Edge found.\n")
        return False
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "report.html")
        with open(src, "w", encoding="utf-8") as fh:
            fh.write(html)
        subprocess.run(
            [exe, "--headless", "--disable-gpu", "--no-pdf-header-footer",
             f"--print-to-pdf={os.path.abspath(out_path)}", "file:///" + src.replace(os.sep, "/")],
            check=True, capture_output=True,
        )
    return os.path.exists(out_path)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    engine = "auto"
    if "--engine" in sys.argv:
        engine = sys.argv[sys.argv.index("--engine") + 1]
    out_path = args[0] if args else "defensa-practice-data-export.pdf"
    html = build_html()

    order = {"auto": ["weasyprint", "chrome"], "weasyprint": ["weasyprint"], "chrome": ["chrome"]}[engine]
    for name in order:
        ok = _render_weasyprint(html, out_path) if name == "weasyprint" else _render_chrome(html, out_path)
        if ok:
            print(f"Wrote {out_path}  (engine: {name})")
            return 0

    # Everything failed → hand back the HTML.
    path = "defensa-practice-data-export.html"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)
    sys.stderr.write(
        f"\nCould not render a PDF. Wrote {path} instead — open it in a browser and use\n"
        "File > Print > Save as PDF (A4, 'Background graphics' on) for an identical result.\n"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
