# Don't Shoot the Messenger

A 45-minute climate storytelling game for groups of three, built as a single static web page for the climate communication workshop (Module 1).

Each player opens the page on their own phone and presses their role:

- **I am a newsbearer** draws a climate news snapshot (69 stories, each linked to its source). It works as a prompt: newsbearers can weave it in for an extra challenge or stick to their own personal story.
- **I am a character** draws one of 36 characters living across Scotland. The top of the card is read out: who they are and the scene where the newsbearer meets them. The hidden side is for the character and the referee only: a climate view on a six-step scale from Alarmed to Dismissive, scores for time, wallet and reach, and triggers and door openers. On a phone, the hidden side fits on one screen.
- **I am a referee** types or picks the character's name to see their hidden side, then runs a five-minute talk clock, full-screen yellow and red cards (5 seconds each, counted), a tap-to-score board that adds up the total, and a verdict checklist. Ticking all six parts of the verdict sets off a full-screen celebration.

The conversation runs in three steps: connect, my why, one thing. The rules of the game sit below the buttons on the same page, with a who-sees-what table, the six climate views, a collapsible worked example and a collapsible list of further resources.

## Publish it with GitHub Pages

1. In the repository, go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Pick the branch that holds these files and the `/ (root)` folder, then save.
4. After a minute or two the page is live at `https://<your-username>.github.io/<repository-name>/`.

There is no build step. Opening `index.html` directly in a browser also works.

## Edit the content

- News: `data/news.js`. Copy any block, keep the snapshot to two or three plain sentences and link the original article.
- Characters: `data/characters.js`. The comment at the top explains each field. The six climate views, with how to play each one and what tends to work, sit at the top of the same file.
- The two decks are drawn separately and at random. Every card comes up once before any card repeats. Each phone shuffles at its first tap, using the browser's crypto random source as well as Math.random, so phones don't all draw the same first card even in page viewers where Math.random repeats.

## Accessibility checks

`tests/a11y.mjs` loads the page in Chromium and runs axe-core against WCAG 2.0, 2.1 and 2.2 (levels A and AA) plus axe's best-practice rules. It runs in light and dark mode at 1280px, 390px and 320px wide, for every state of the page: at rest, rules folds open, news card, character card with the hidden side hidden and shown, referee kit with a character looked up and with several matches, and every overlay. It also checks that:

- the page never scrolls sideways, including with every story and every character drawn and with the WCAG 1.4.12 text-spacing override applied
- every character card is complete and uses one of the six climate views, and every view is used
- each character's hidden side fits on one phone screen
- the referee can find every character by full name, by part of a name (offering a choice when several match) and gets a clear message for an unknown name
- with Math.random stuck, ten fresh phones still draw different first cards
- keyboard focus starts at the skip link, reaches the role buttons and always shows a visible ring
- focus returns to the right button after a card overlay closes, and a second yellow turns red
- both web fonts load and the console stays free of errors

Run it with:

```
npm install
npm test
```
