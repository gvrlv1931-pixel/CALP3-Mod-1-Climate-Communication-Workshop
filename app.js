(function () {
  "use strict";

  var NEWS = window.NEWS || [];
  var CHARACTERS = window.CHARACTERS || [];
  var TALK_SECONDS = 5 * 60;

  function $(id) { return document.getElementById(id); }

  // A shuffled deck: every card comes up once before any card repeats.
  function makeDeck(size) {
    var order = [];
    var pos = 0;
    function shuffle(avoidFirst) {
      order = [];
      for (var i = 0; i < size; i++) order.push(i);
      for (var j = size - 1; j > 0; j--) {
        var k = Math.floor(Math.random() * (j + 1));
        var t = order[j]; order[j] = order[k]; order[k] = t;
      }
      if (size > 1 && order[0] === avoidFirst) {
        var s = order[0]; order[0] = order[1]; order[1] = s;
      }
      pos = 0;
    }
    shuffle(-1);
    return {
      size: size,
      next: function () {
        if (pos >= size) shuffle(order[size - 1]);
        var index = order[pos];
        pos += 1;
        return { index: index, position: pos };
      }
    };
  }

  var newsDeck = makeDeck(NEWS.length);
  var charDeck = makeDeck(CHARACTERS.length);

  var stage = $("stage");
  var panels = {
    news: $("panel-news"),
    character: $("panel-character"),
    referee: $("panel-referee")
  };
  var headings = {
    news: $("news-headline"),
    character: $("char-name"),
    referee: $("clock-title")
  };
  var roleButtons = Array.prototype.slice.call(document.querySelectorAll(".role"));

  function focusHeading(role) {
    var h = headings[role];
    if (!h) return;
    h.focus({ preventScroll: true });
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var top = stage.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) {
      stage.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }

  function showRole(role, moveFocus) {
    stage.hidden = false;
    Object.keys(panels).forEach(function (key) {
      panels[key].hidden = key !== role;
    });
    roleButtons.forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.dataset.role === role ? "true" : "false");
    });
    if (role === "news") drawNews();
    if (role === "character") drawCharacter();
    if (moveFocus) focusHeading(role);
  }

  roleButtons.forEach(function (btn) {
    btn.addEventListener("click", function () { showRole(btn.dataset.role, true); });
  });

  // ---------- Newsbearer ----------
  function drawNews() {
    if (!NEWS.length) return;
    var draw = newsDeck.next();
    var item = NEWS[draw.index];
    $("news-topic").textContent = item.topic;
    $("news-date").textContent = item.date;
    $("news-headline").textContent = item.headline;
    $("news-snapshot").textContent = item.snapshot;
    $("news-source").textContent = item.source;
    $("news-link").href = item.url;
    $("news-count").textContent = "Story " + draw.position + " of " + newsDeck.size;
    restartAnimation(panels.news);
  }

  $("news-next").addEventListener("click", function () {
    drawNews();
    $("news-headline").focus();
  });

  // ---------- Character ----------
  var STAT_INFO = [
    { key: "scepticism", name: "Scepticism", desc: "How hard they push back" },
    { key: "time", name: "Time", desc: "How much spare time they have" },
    { key: "wallet", name: "Wallet", desc: "How much they can spend" },
    { key: "reach", name: "Reach", desc: "How many people listen to them" }
  ];

  function fillList(ul, items) {
    ul.textContent = "";
    items.forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });
  }

  function renderStats(stats) {
    var dl = $("char-stats");
    dl.textContent = "";
    STAT_INFO.forEach(function (info) {
      var value = stats[info.key];
      var wrap = document.createElement("div");
      wrap.className = "stat";

      var dt = document.createElement("dt");
      var name = document.createElement("span");
      name.className = "stat-name";
      name.textContent = info.name;
      var desc = document.createElement("span");
      desc.className = "stat-desc";
      desc.textContent = info.desc;
      dt.appendChild(name);
      dt.appendChild(desc);

      var dd = document.createElement("dd");
      var pips = document.createElement("span");
      pips.className = "pips";
      pips.setAttribute("aria-hidden", "true");
      for (var i = 1; i <= 5; i++) {
        var pip = document.createElement("span");
        pip.className = i <= value ? "pip on" : "pip";
        pips.appendChild(pip);
      }
      var score = document.createElement("span");
      score.className = "score";
      score.textContent = value + " of 5";
      dd.appendChild(pips);
      dd.appendChild(score);

      wrap.appendChild(dt);
      wrap.appendChild(dd);
      dl.appendChild(wrap);
    });
  }

  function setSecret(open) {
    $("secret-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    $("secret-body").hidden = !open;
    $("secret-label").textContent = open ? "Hide triggers and door openers" : "Show triggers and door openers";
  }

  function drawCharacter() {
    if (!CHARACTERS.length) return;
    var draw = charDeck.next();
    var c = CHARACTERS[draw.index];
    $("char-name").textContent = c.name;
    $("char-pronouns").textContent = c.pronouns;
    $("char-age").textContent = c.age;
    $("char-role").textContent = c.role;
    $("char-place").textContent = c.place;
    $("char-tagline").textContent = c.tagline;
    $("char-opening").textContent = c.openingLine;
    $("char-never").textContent = c.neverWithout;
    renderStats(c.stats);
    fillList($("char-triggers"), c.triggers);
    fillList($("char-doors"), c.doorOpeners);
    setSecret(false);
    $("char-count").textContent = "Character " + draw.position + " of " + charDeck.size;
    restartAnimation(panels.character);
  }

  $("secret-toggle").addEventListener("click", function () {
    setSecret(this.getAttribute("aria-expanded") !== "true");
  });

  $("char-next").addEventListener("click", function () {
    drawCharacter();
    $("char-name").focus();
  });

  function restartAnimation(el) {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }

  // ---------- Referee: clock ----------
  var remaining = TALK_SECONDS;
  var endAt = 0;
  var timerId = null;
  var warned = false;
  var wakeLock = null;

  function format(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function announce(text) {
    var status = $("clock-status");
    status.textContent = "";
    window.setTimeout(function () { status.textContent = text; }, 50);
  }

  function renderClock() {
    var clock = $("clock");
    clock.textContent = format(remaining);
    clock.classList.toggle("done", remaining === 0);
  }

  function requestWakeLock() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request("screen").then(function (lock) { wakeLock = lock; }).catch(function () {});
      }
    } catch (e) { /* not available */ }
  }

  function releaseWakeLock() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ }
    wakeLock = null;
  }

  function tick() {
    var left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (left !== remaining) {
      remaining = left;
      renderClock();
      if (remaining === 60 && !warned) {
        warned = true;
        announce("One minute left.");
      }
      if (remaining === 0) {
        stopClock();
        $("clock").textContent = "Time";
        announce("Time's up. Go to the verdict.");
      }
    }
  }

  function startClock() {
    if (remaining === 0) remaining = TALK_SECONDS;
    endAt = Date.now() + remaining * 1000;
    timerId = window.setInterval(tick, 250);
    $("clock-toggle").textContent = "Pause";
    requestWakeLock();
    renderClock();
  }

  function stopClock() {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
    $("clock-toggle").textContent = remaining === 0 ? "Restart" : "Resume";
    releaseWakeLock();
  }

  function resetClock() {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
    remaining = TALK_SECONDS;
    warned = false;
    $("clock-toggle").textContent = "Start";
    releaseWakeLock();
    renderClock();
  }

  $("clock-toggle").addEventListener("click", function () {
    if (timerId) stopClock(); else startClock();
  });
  $("clock-reset").addEventListener("click", resetClock);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && timerId) requestWakeLock();
  });

  // ---------- Referee: cards ----------
  var yellows = 0;
  var reds = 0;
  var lastTrigger = null;
  var dialog = $("penalty");
  var PENALTY_SECONDS = 5;
  var penaltyTimer = null;
  var penaltyLeft = 0;

  function renderTally() {
    $("tally").textContent = "Yellow cards this round: " + yellows + ". Red cards: " + reds + ".";
    updateVerdict();
  }

  function openPenalty(kind, kicker, trigger) {
    lastTrigger = trigger;
    var isRed = kind === "red";
    dialog.classList.toggle("is-red", isRed);
    $("penalty-title").textContent = isRed ? "Red card" : "Yellow card";
    $("penalty-kicker").textContent = kicker || "";
    $("penalty-kicker").hidden = !kicker;
    $("penalty-text").textContent = isRed
      ? "Stop the story. Repair the conversation before you go on."
      : "Warning. Keep going, and drop whatever earned this card.";
    $("penalty-script").hidden = !isRed;
    $("penalty-count").textContent = "Yellows this round: " + yellows + ". Reds this round: " + reds + ".";
    penaltyLeft = PENALTY_SECONDS;
    $("penalty-close").textContent = "Back to the game (" + penaltyLeft + ")";
    if (penaltyTimer) window.clearInterval(penaltyTimer);
    penaltyTimer = window.setInterval(function () {
      penaltyLeft -= 1;
      if (penaltyLeft <= 0) { closePenalty(); return; }
      $("penalty-close").textContent = "Back to the game (" + penaltyLeft + ")";
    }, 1000);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    $("penalty-close").focus();
  }

  function closePenalty() {
    if (penaltyTimer) window.clearInterval(penaltyTimer);
    penaltyTimer = null;
    if (!dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  dialog.addEventListener("close", function () {
    if (penaltyTimer) window.clearInterval(penaltyTimer);
    penaltyTimer = null;
    if (lastTrigger) lastTrigger.focus();
  });
  $("penalty-close").addEventListener("click", closePenalty);
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog || event.target.classList.contains("penalty-inner")) closePenalty();
  });

  $("show-yellow").addEventListener("click", function () {
    yellows += 1;
    if (yellows >= 2) {
      yellows = 0;
      reds += 1;
      renderTally();
      openPenalty("red", "Second yellow", this);
    } else {
      renderTally();
      openPenalty("yellow", "", this);
    }
  });

  $("show-red").addEventListener("click", function () {
    reds += 1;
    renderTally();
    openPenalty("red", "", this);
  });

  // ---------- Referee: score ----------
  var scoreLog = [];
  var tickButtons = Array.prototype.slice.call(document.querySelectorAll(".tick"));

  function scoreTotal() {
    return scoreLog.reduce(function (sum, entry) { return sum + entry.points; }, 0);
  }

  function scoreSummary() {
    var plus = scoreLog.filter(function (e) { return e.points > 0; }).length;
    var minus = scoreLog.length - plus;
    return "Score: " + scoreTotal() + " (" + plus + " plus, " + minus + " minus).";
  }

  function renderScore() {
    $("score-total").textContent = scoreTotal();
    tickButtons.forEach(function (btn) {
      var key = btn.dataset.key;
      var n = scoreLog.filter(function (e) { return e.key === key; }).length;
      btn.querySelector(".tick-count").textContent = n;
      btn.setAttribute("aria-label", btn.querySelector(".tick-name").textContent + ", " + (btn.dataset.points > 0 ? "plus one" : "minus one") + ". Tapped " + n + " times.");
    });
    $("score-undo").disabled = scoreLog.length === 0;
    updateVerdict();
  }

  tickButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      scoreLog.push({ key: btn.dataset.key, points: Number(btn.dataset.points) });
      btn.classList.remove("bump");
      void btn.offsetWidth;
      btn.classList.add("bump");
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) { /* ignore */ }
      renderScore();
      $("score-status").textContent = "Total " + scoreTotal() + ".";
    });
  });

  $("score-undo").addEventListener("click", function () {
    scoreLog.pop();
    renderScore();
    $("score-status").textContent = "Last tap undone. Total " + scoreTotal() + ".";
  });

  // ---------- Referee: verdict ----------
  var form = $("verdict-form");
  var REQUIRED = ["v-why", "v-world", "v-thing", "v-motive", "v-means", "v-opportunity"];
  var celebrated = false;

  function updateVerdict() {
    var answer = form.querySelector('input[name="answer"]:checked');
    var missing = Array.prototype.slice.call(form.querySelectorAll("input[data-mmo]"))
      .filter(function (box) { return !box.checked; })
      .map(function (box) { return box.dataset.mmo; });
    var result = $("verdict-result");
    var score = " " + scoreSummary();

    if (!answer) {
      result.textContent = "Waiting for the character's answer." + score;
      return;
    }
    var gap = missing.length ? " Missing: " + missing.join(", ") + "." : "";
    if (answer.value === "yes" && reds === 0) {
      result.textContent = "The newsbearer wins the round." + score;
    } else if (answer.value === "yes") {
      result.textContent = "A yes, but with a red card, so no win this time." + score;
    } else if (answer.value === "maybe") {
      result.textContent = "Close. Ask the character what would turn maybe into yes." + gap + score;
    } else {
      result.textContent = "Not this time. Ask the character what was missing." + gap + score;
    }
  }

  // ---------- Celebration ----------
  var party = $("celebrate");
  var partyTimer = null;
  var partyFrame = null;
  var partyTrigger = null;

  function runConfetti() {
    var canvas = $("confetti");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    var w = canvas.width = party.clientWidth || window.innerWidth;
    var h = canvas.height = party.clientHeight || window.innerHeight;
    var ink = getComputedStyle(party).color;
    var colours = [ink, "rgba(255,255,255,0.9)", "#FFD13B"];
    var bits = [];
    for (var i = 0; i < 140; i++) {
      bits.push({
        x: Math.random() * w,
        y: reduce ? (Math.random() < 0.5 ? Math.random() * h * 0.12 : h * 0.88 + Math.random() * h * 0.12) : -20 - Math.random() * h * 0.6,
        r: 4 + Math.random() * 6,
        vy: 2 + Math.random() * 3.5,
        vx: -1.5 + Math.random() * 3,
        spin: Math.random() * Math.PI,
        vs: -0.15 + Math.random() * 0.3,
        c: colours[i % colours.length]
      });
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      bits.forEach(function (b) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.spin);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r);
        ctx.restore();
      });
    }
    if (reduce) { draw(); return; }
    var start = performance.now();
    function frame(now) {
      bits.forEach(function (b) {
        b.y += b.vy; b.x += b.vx; b.spin += b.vs;
        if (b.y > h + 20 && now - start < 2500) { b.y = -20; b.x = Math.random() * w; }
      });
      draw();
      if (now - start < 6000) partyFrame = window.requestAnimationFrame(frame);
    }
    partyFrame = window.requestAnimationFrame(frame);
  }

  function closeParty() {
    if (partyTimer) window.clearTimeout(partyTimer);
    partyTimer = null;
    if (partyFrame) window.cancelAnimationFrame(partyFrame);
    partyFrame = null;
    if (party.open) {
      if (typeof party.close === "function") party.close(); else party.removeAttribute("open");
    }
  }

  function celebrate(trigger) {
    partyTrigger = trigger;
    $("celebrate-score").textContent = scoreSummary();
    if (typeof party.showModal === "function") party.showModal(); else party.setAttribute("open", "");
    $("celebrate-close").focus();
    runConfetti();
    try { if (navigator.vibrate) navigator.vibrate([80, 60, 80, 60, 160]); } catch (e) { /* ignore */ }
    partyTimer = window.setTimeout(closeParty, 6000);
  }

  party.addEventListener("close", function () {
    if (partyFrame) window.cancelAnimationFrame(partyFrame);
    if (partyTimer) window.clearTimeout(partyTimer);
    if (partyTrigger) partyTrigger.focus();
  });
  $("celebrate-close").addEventListener("click", closeParty);
  party.addEventListener("click", function (event) {
    if (event.target !== $("celebrate-close")) closeParty();
  });

  // ---------- Pew pew: the newsbearer did not win ----------
  var pew = $("pewpew");
  var pewTimer = null;
  var pewTrigger = null;

  function closePew() {
    if (pewTimer) window.clearTimeout(pewTimer);
    pewTimer = null;
    if (pew.open) {
      if (typeof pew.close === "function") pew.close(); else pew.removeAttribute("open");
    }
  }

  function pewPew(trigger, answer) {
    pewTrigger = trigger;
    var reason = answer === "yes" ? "A yes, but a red card cost the win." : answer === "maybe" ? "The character said maybe." : "The character said no.";
    $("pewpew-detail").textContent = reason + " " + scoreSummary();
    if (typeof pew.showModal === "function") pew.showModal(); else pew.setAttribute("open", "");
    $("pewpew-close").focus();
    try { if (navigator.vibrate) navigator.vibrate([40, 40, 40]); } catch (e) { /* ignore */ }
    pewTimer = window.setTimeout(closePew, 6000);
  }

  pew.addEventListener("close", function () {
    if (pewTimer) window.clearTimeout(pewTimer);
    if (pewTrigger) pewTrigger.focus();
  });
  $("pewpew-close").addEventListener("click", closePew);
  pew.addEventListener("click", function (event) {
    if (event.target !== $("pewpew-close")) closePew();
  });

  form.addEventListener("change", function (event) {
    updateVerdict();
    if (event.target.name === "answer") {
      var lost = event.target.value !== "yes" || reds > 0;
      if (lost) { pewPew(event.target, event.target.value); return; }
    }
    var allTicked = REQUIRED.every(function (id) { return $(id).checked; });
    if (allTicked && !celebrated) {
      celebrated = true;
      celebrate(event.target);
    }
    if (!allTicked) celebrated = false;
  });
  form.addEventListener("submit", function (event) { event.preventDefault(); });

  $("new-round").addEventListener("click", function () {
    form.reset();
    yellows = 0;
    reds = 0;
    scoreLog = [];
    celebrated = false;
    resetClock();
    renderTally();
    renderScore();
    announce("New round. Clock, cards and score reset.");
    $("clock-title").focus();
  });

  renderScore();

  // Open a role straight from a link such as index.html#referee
  var fromHash = { "#newsbearer": "news", "#character": "character", "#referee": "referee" }[window.location.hash];
  if (fromHash) showRole(fromHash, false);
})();
