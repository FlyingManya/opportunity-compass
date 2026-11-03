"""Generate the four README architecture diagrams as editable SVGs."""

from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent

INK = "#25213b"
MUTED = "#6c6683"
PURPLE = "#7556bf"
LAVENDER = "#ede6ff"
PEACH = "#ffe6d6"
GREEN = "#e5f4e9"
BLUE = "#e5efff"
GOLD = "#fff1cc"


def txt(x, y, lines, size=24, weight=500, color=INK, step=None, anchor="start"):
    if isinstance(lines, str):
        lines = [lines]
    step = step or int(size * 1.4)
    parts = [
        f'<text x="{x}" y="{y + i * step}" text-anchor="{anchor}" '
        f'font-family="Inter, Arial, sans-serif" font-size="{size}" '
        f'font-weight="{weight}" fill="{color}">{escape(line)}</text>'
        for i, line in enumerate(lines)
    ]
    return "".join(parts)


def icon(x, y, title, color):
    """A small line illustration keyed to a card's role."""
    key = title.lower()
    if "mongo" in key or "entries" in key:
        drawing = '<ellipse cx="25" cy="12" rx="16" ry="6"/><path d="M9 12v27c0 8 32 8 32 0V12 M9 25c0 8 32 8 32 0"/>'
    elif "vercel environment" in key or "config" in key:
        drawing = '<circle cx="25" cy="22" r="10"/><path d="M25 32v13m0-8h10m-10 5h7"/>'
    elif "vercel" in key:
        drawing = '<path d="M7 42 25 10l18 32Z"/>'
    elif "browser" in key or "template" in key or "cards" in key:
        drawing = '<rect x="6" y="8" width="38" height="33" rx="5"/><path d="M6 18h38M12 13h2m6 0h2m-9 13h13m-13 7h19"/>'
    elif "github" in key:
        drawing = '<circle cx="25" cy="11" r="5"/><circle cx="10" cy="39" r="5"/><circle cx="40" cy="39" r="5"/><path d="M25 16v10m0 0L10 34m15-8 15 8"/>'
    elif "image" in key or "artwork" in key:
        drawing = '<rect x="6" y="9" width="38" height="32" rx="5"/><circle cx="17" cy="19" r="3"/><path d="m8 37 11-11 8 7 8-11 7 13"/>'
    elif "wonder" in key or "research" in key or "recheck" in key:
        drawing = '<circle cx="22" cy="22" r="14"/><path d="m33 33 11 11M17 22h10m-5-5v10"/>'
    elif "spark" in key or "meta" in key:
        drawing = '<path d="m25 4 4 16 16 5-16 4-4 16-5-16-16-4 16-5Z"/>'
    elif "calendar" in key or "date" in key or "deadline" in key:
        drawing = '<rect x="7" y="11" width="36" height="34" rx="5"/><path d="M7 21h36M17 6v10m16-10v10M16 30h6m7 0h6m-19 7h6"/>'
    elif "refresh" in key or "validate" in key:
        drawing = '<path d="M39 18a16 16 0 1 0 2 17M39 18v-9m0 9h-9M17 25l6 6 11-13"/>'
    elif "profile" in key or "interested" in key:
        drawing = '<circle cx="25" cy="17" r="9"/><path d="M9 44c2-11 9-17 16-17s14 6 16 17"/>'
    else:
        drawing = '<rect x="7" y="7" width="36" height="38" rx="5"/><path d="M15 17h20M15 25h20M15 33h13"/>'
    return f'<g transform="translate({x},{y})"><circle cx="25" cy="25" r="26" fill="#ffffff" opacity=".72"/><g fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">{drawing}</g></g>'


def card(x, y, w, h, label, title, body, fill, accent=PURPLE):
    if isinstance(body, str):
        body = [body]
    return f"""
    <g filter="url(#shadow)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="28" fill="{fill}" stroke="#ded8eb" stroke-width="2"/></g>
    <rect x="{x+24}" y="{y+23}" width="9" height="{h-46}" rx="5" fill="{accent}"/>
    {txt(x+56,y+53,label.upper(),17,800,accent)}
    {icon(x+w-84,y+19,title,accent)}
    {txt(x+56,y+101,title,30,750)}
    {txt(x+56,y+142,body,20,500,MUTED,29)}
    """


def pill(x, y, w, label, fill=LAVENDER, color=PURPLE):
    return f'<rect x="{x}" y="{y}" width="{w}" height="36" rx="18" fill="{fill}"/>{txt(x+w/2,y+25,label,17,700,color,anchor="middle")}'


def arrow(x1, y1, x2, y2, bend=0, color=PURPLE):
    if bend:
        d = f"M{x1},{y1} C{x1+bend},{y1} {x2-bend},{y2} {x2},{y2}"
    else:
        d = f"M{x1},{y1} L{x2},{y2}"
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="5" stroke-linecap="round" marker-end="url(#arrow)"/>'


def base(number, title, subtitle, content):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="{escape(title)}">
    <defs>
      <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#f9f6ff"/><stop offset=".56" stop-color="#fffaf6"/><stop offset="1" stop-color="#f5fbff"/></linearGradient>
      <linearGradient id="top" x2="1" y2="0"><stop stop-color="#7f62c4"/><stop offset="1" stop-color="#f2a984"/></linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="13" flood-color="#5b4c84" flood-opacity=".10"/></filter>
      <marker id="arrow" markerWidth="13" markerHeight="13" refX="10" refY="6.5" orient="auto"><path d="M1,1 L11,6.5 L1,12" fill="none" stroke="#7556bf" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></marker>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)"/>
    <circle cx="1510" cy="52" r="200" fill="#f1e8ff" opacity=".72"/>
    <circle cx="54" cy="844" r="194" fill="#ffeadd" opacity=".55"/>
    <rect x="0" y="0" width="1600" height="12" fill="url(#top)"/>
    {pill(72,42,205,"OPPORTUNITY COMPASS", "#ece5fb")}
    {txt(72,138,title,52,800)}
    {txt(73,180,subtitle,22,500,MUTED)}
    {content}
    <rect x="72" y="847" width="1456" height="1.5" fill="#ded8e9"/>
    {txt(72,878,"SYSTEM DIAGRAM  /  README",16,700,MUTED)}
    {txt(1528,878,f"0{number} / 04",16,700,MUTED,anchor="end")}
    </svg>"""


slides = {}

# 1. Architecture. Arrows denote data/control flow, not deployment of secrets to the browser.
slides["01-tech-stack"] = base(1, "How the app fits together", "React interface, Vercel server, MongoDB Atlas, and Meta Model API", """
    {git}
    {vercel}
    {browser}
    {atlas}
    {secrets}
    {meta}
    {a1}{a2}{a3}{a4}{a5}
    {note}
""".format(
    git=card(72,228,360,174,"source","GitHub repository",["Next.js, React, TypeScript","and shared UI components"],"#ffffff"),
    vercel=card(545,228,510,174,"deploy + run","Vercel",["Next.js app + server API routes","Authentication and validation run here"],LAVENDER),
    browser=card(1168,228,360,174,"user interface","Browser / phone",["Dashboard, chat, stories,","interested list, calendar"],"#ffffff"),
    atlas=card(72,535,447,214,"data","MongoDB Atlas",["Accounts + sessions","Profile, keywords, opportunities","Saved dates and generated artwork"],GREEN,"#429267"),
    secrets=card(575,535,450,214,"private config","Vercel environment",["MONGODB_URI + MODEL_API_KEY","AGENT_PROVIDER and model IDs","Available to server code only"],GOLD,"#b47731"),
    meta=card(1081,535,447,214,"model api","Meta models",["Muse Spark 1.3  •  chat","Muse Wonder 1.0  •  research","Muse Image 1.0  •  artwork"],PEACH,"#c16b54"),
    a1=arrow(438,315,533,315), a2=arrow(1061,315,1156,315),
    a3=arrow(705,412,480,523,-170), a4=arrow(800,523,800,412), a5=arrow(935,412,1110,523,130),
    note=txt(800,807,"The browser never receives the database URI or Meta API key.",21,700,PURPLE,anchor="middle"),
))

# 2. Search. Keywords are refreshed as part of discovery, not on every profile save.
slides["02-discovery-flow"] = base(2, "From a goal to a dashboard card", "Muse Wonder researches; the server checks and stores; React displays", """
    {profile}{wonder}{results}
    {a1}{a2}{a3}{a4}{a5}
    {validate}{database}{cardbox}
    {foot}
""".format(
    profile=card(72,226,438,218,"01 / user context","Profile + search brief",["Interests, skills, trusted sites","Optional résumé sharing","Keyword cache supports source leads"],BLUE,"#5682bd"),
    wonder=card(581,226,438,218,"02 / research","Muse Wonder 1.0",["Question + chosen context + date","Meta web_search finds pages","Returns structured candidates"],LAVENDER),
    results=card(1090,226,438,218,"03 / candidate fields","Structured results",["Title • organizer • description","Source URL • reason it matches","Deadline, or blank if unknown"],PEACH,"#c16b54"),
    a1=arrow(522,330,569,330), a2=arrow(1031,330,1078,330),
    a3=arrow(1309,456,1309,530),
    validate=card(1090,540,438,223,"04 / server checks","Validate + deduplicate",["URL must match search sources","Reject known past deadlines","Keep useful undated leads"],GOLD,"#b47731"),
    database=card(581,540,438,223,"05 / account-scoped","MongoDB entries",["discovered_opportunities","One user’s records; up to 20","Saved separately from sample cards"],GREEN,"#429267"),
    cardbox=card(72,540,438,223,"06 / render","Reusable card template",["React reads stored records","Same layout for every result","Open a card for deeper research"],"#ffffff"),
    a4=arrow(1078,647,1031,647), a5=arrow(569,647,522,647),
    foot=txt(800,811,"Wonder receives consented profile context directly; cached keywords help source-lead matching.",18,700,PURPLE,anchor="middle"),
))

# 3. Media generation and on-demand card detail are distinct paths.
slides["03-model-roles"] = base(3, "Visuals and details, on demand", "The app keeps factual text separate from generated illustration", """
    {image_input}{image_model}{image_output}
    {i1}{i2}
    {detail_input}{detail_wonder}{detail_fallback}
    {d1}{d2}
    {foot}
""".format(
    image_input=card(72,232,420,218,"artwork input","Stored opportunity",["Title, organizer, description","Source-backed card data","Requested when needed"],BLUE,"#5682bd"),
    image_model=card(590,232,420,218,"image generation","Muse Image 1.0",["Landscape card illustration","Vertical story illustration","Artwork saved per account"],PEACH,"#c16b54"),
    image_output=card(1108,232,420,218,"render","Cards + stories",["App overlays title, date, link","Template art if image unavailable","Facts stay readable as text"],GREEN,"#429267"),
    i1=arrow(504,340,578,340), i2=arrow(1022,340,1096,340),
    detail_input=card(72,530,420,216,"user action","Open opportunity",["Research only this card","Avoid bulk detail requests","Ask again for missing deadline"],"#ffffff"),
    detail_wonder=card(590,530,420,216,"detail research","Muse Wonder 1.0",["Web search on the source","Summary and deadline check","Citations when available"],LAVENDER),
    detail_fallback=card(1108,530,420,216,"if research fails","Muse Spark 1.3",["General preparation guide only","No invented dates or claims","Template detail if needed"],GOLD,"#b47731"),
    d1=arrow(504,638,578,638), d2=arrow(1022,638,1096,638),
    foot=txt(800,811,"Image generation enriches the experience without blocking the opportunity card.",20,700,PURPLE,anchor="middle"),
))

# 4. Server-side deadline and retention logic.
slides["04-deadlines-refresh"] = base(4, "Deadlines, calendar, and refresh", "Missing dates remain visible; known expired opportunities are removed", """
    {undated}{recheck}{dated}
    {a1}{a2}{a3}{a4}
    {interested}{calendar}{refresh}
    {foot}
""".format(
    undated=card(72,231,438,220,"date unknown","Keep the opportunity",["Card says deadline not mentioned","No invented application date","User can still inspect its source"],BLUE,"#5682bd"),
    recheck=card(581,231,438,220,"on demand","Recheck or enter date",["Muse Wonder searches again","Or user enters a verified date","No bulk deadline API calls"],LAVENDER),
    dated=card(1090,231,438,220,"known date","Validate against today",["Use the user’s timezone","Past date → remove record","Future date → keep card"],GOLD,"#b47731"),
    a1=arrow(522,340,569,340), a2=arrow(1031,340,1078,340), a3=arrow(1309,463,1309,540), a4=arrow(522,652,569,652),
    interested=card(72,546,438,220,"user choice","Mark Interested",["Save the chosen opportunity","Can save even without a date","Known dates go to calendar"],PEACH,"#c16b54"),
    calendar=card(581,546,438,220,"plan","In-app calendar",["Shows saved application dates","Export .ics for other calendars","No direct Google sync"],GREEN,"#429267"),
    refresh=card(1090,546,438,220,"server cleanup","Refresh dashboard",["Delete known expired records","Clean researched + saved data","Show up to 20 current cards"],"#ffffff"),
    foot=txt(800,813,"Muse Wonder finds dates; server code validates and deletes. Undated cards stay until reviewed.",19,700,PURPLE,anchor="middle"),
))

for stem, svg in slides.items():
    path = HERE / f"{stem}.svg"
    path.write_text(svg, encoding="utf-8")
    print(path)
