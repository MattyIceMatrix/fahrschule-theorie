# Theorieprüfung Klasse B

Phone-friendly German driving theory trainer (Klasse B): study by chapter with animated lesson videos, practice with instant explanations, and a 30-question timed exam using the real point rules. DE/EN.

Live: https://mattyicematrix.github.io/fahrschule-theorie/

## What "the real point rules" means

The exam mode follows the official rules for a first-time Klasse B theory test: **30 questions**
(20 Grundstoff + 10 Zusatzstoff Klasse B), each worth 2 to 5 Fehlerpunkte, **a pass at no more
than 10 Fehlerpunkte**, and **a fail regardless of the total if two 5-point questions are wrong**.
`tests/test_app.js` checks the scoring against that rule table on every push, including the
3 + 3 + 4 = exactly 10 boundary and the two-fives case.

The questions themselves are **not** the official catalogue — they are written from the StVO,
StVZO and FeV for practice. Use your Fahrschule's app for the real question bank.

## Checks

`node --test tests/test_app.js` runs the page's own script against a small DOM shim and checks:
the exam draw and scoring rules, that the question bank is well formed in both languages, that
every lesson animation actually animates, that the DE/EN switch leaves nothing behind, and that
nothing private is shipped in a public file. No dependencies.

## Privacy

No accounts, no analytics, no server; progress is kept in your browser's local storage only.
The page does load its two display typefaces from **fonts.googleapis.com**, which means a
visitor's IP address reaches Google before any consent. That is the page's only outside request.
