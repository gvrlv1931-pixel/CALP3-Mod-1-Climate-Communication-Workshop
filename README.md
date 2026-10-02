# Don't Kill the Messenger

A 45-minute climate storytelling game for groups of three, built as a single static web page for the climate communication workshop (Module 1).

Each player opens the page on their own phone and presses their role:

- **I am a newsbearer** draws a climate news snapshot (69 stories, each linked to its source). It works as a prompt: newsbearers can weave it in for an extra challenge or stick to their own personal story.
- **I am a character** draws one of 29 characters living across Scotland, with an opening line, scores for scepticism, time, wallet and reach, and hidden triggers and door openers.
- **I am a referee** opens a five-minute talk clock, full-screen yellow and red cards, and a verdict checklist.

The rules of the game sit below the buttons on the same page.

## Publish it with GitHub Pages

1. In the repository, go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Pick the branch that holds these files and the `/ (root)` folder, then save.
4. After a minute or two the page is live at `https://<your-username>.github.io/<repository-name>/`.

There is no build step. Opening `index.html` directly in a browser also works.

## Edit the content

- News: `data/news.js`. Copy any block, keep the snapshot to two or three plain sentences and link the original article.
- Characters: `data/characters.js`. The comment at the top explains each field.
- The two decks are drawn separately and at random. Every card comes up once before any card repeats.

## Accessibility checks

`tests/a11y.mjs` loads the page in Chromium and runs axe-core against WCAG 2.0, 2.1 and 2.2 (levels A and AA) plus axe's best-practice rules. It runs in light and dark mode at 1280px, 390px and 320px wide, for every state of the page: at rest, news card, character card with secrets hidden and shown, referee kit, and both card overlays. It also checks that:

- the page never scrolls sideways, including with every story and every character drawn and with the WCAG 1.4.12 text-spacing override applied
- keyboard focus starts at the skip link, reaches the role buttons and always shows a visible ring
- focus returns to the right button after a card overlay closes, and a second yellow turns red
- both web fonts load and the console stays free of errors

Run it with:

```
npm install
npm test
```
