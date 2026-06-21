const scenarios = [
  {
    id: "stale-request",
    shortTitle: "Stale Request",
    title: "Stale request",
    summary:
      "A b-thread keeps requesting an action that was justified by an earlier observation, even after the state has changed.",
    requirement: "Requests must be based on the current synchronization state.",
    code: `var WayAhead = bp.Event("WayAhead");
var GoAhead = bp.Event("GoAhead");
var BlockedAhead = bp.Event("BlockedAhead");
var TurnRight = bp.Event("TurnRight");

bp.registerBThread("RobotNavigation", function () {
  while (true) {
    bp.sync({
      waitFor: WayAhead
    });

    bp.sync({
      request: GoAhead
    });
  }
});`,
    explanation: [
      "The robot observes WayAhead and then requests GoAhead. The request can become stale if the environment changes before GoAhead is selected.",
      "Another b-thread may select TurnRight or BlockedAhead while RobotNavigation remains at a synchronization point that still requests GoAhead.",
      "The bug is subtle because GoAhead is not always wrong. It becomes wrong only in a later state where the original assumption is no longer valid."
    ],
    trace: ["WayAhead", "TurnRight", "BlockedAhead", "GoAhead"],
    traceNote:
      "The last event is wrong because GoAhead is selected after the path has become blocked."
  },
  {
    id: "incorrect-response-obligation",
    shortTitle: "Incorrect Response Obligation",
    title: "Wrong implementation of \"for every X, there must be a corresponding Y\"",
    summary:
      "A sequential b-thread creates only one cleanup obligation and can miss later events that require their own response.",
    requirement: "Every Jump(v) must eventually have a matching Remove(v).",
    code: `bp.registerBThread("ExecuteCaptures", function () {
  while (true) {
    var jump = bp.sync({
      waitFor: JumpMoves
    });

    var victim = jump.data.cap_id;

    bp.sync({
      request: RemoveEvent(victim)
    });
  }
});`,
    explanation: [
      "The b-thread observes one capture jump and then moves to a synchronization point that requests the corresponding remove event.",
      "While it is waiting for that remove event, it is no longer waiting for additional jump events. A second jump can therefore be missed.",
      "The requirement is not merely that some remove event occurs after a jump. Each jump creates its own independent cleanup obligation."
    ],
    trace: [
      "JumpMove(redPiece1, blackVictim1)",
      "JumpMove(redPiece1, blackVictim2)",
      "Remove(blackVictim1)",
      "NormalMove(otherBlackPiece)"
    ],
    traceNote:
      "The second captured piece is never removed, but execution continues with another move."
  },
  {
    id: "win-vs-draw-priority",
    shortTitle: "Win-vs-Draw Priority Bug",
    title: "Win-vs-draw conflict caused by missing priority or missing block",
    summary:
      "A final move can create both a win and a full board, allowing Draw to be selected when XWin should override it.",
    requirement: "A win should override a draw when both terminal conditions become enabled.",
    code: `bp.registerBThread("DetectXWin", function () {
  bp.sync({ waitFor: XLine });
  bp.sync({ waitFor: XLine });
  bp.sync({ waitFor: XLine });

  bp.sync({
    request: XWin
  });
});

bp.registerBThread("DetectDraw", function () {
  for (var i = 0; i < 9; i++) {
    bp.sync({
      waitFor: Move
    });
  }

  bp.sync({
    request: Draw
  });
});

bp.registerBThread("EndOfGame", function () {
  bp.sync({
    waitFor: [XWin, OWin, Draw]
  });

  bp.sync({
    block: bp.all
  });
});`,
    explanation: [
      "The win detector and draw detector are independent terminal-condition b-threads.",
      "If the final move fills the board and also creates a winning line, both XWin and Draw can be requested at the same synchronization point.",
      "Without a priority rule or a block that prevents Draw when a win is available, the event-selection strategy may choose the wrong terminal event."
    ],
    trace: [
      "X(0,0)",
      "O(1,1)",
      "X(2,2)",
      "O(1,2)",
      "X(1,0)",
      "O(2,1)",
      "X(0,1)",
      "O(0,2)",
      "X(2,0)",
      "Draw"
    ],
    traceNote:
      "After X(2,0), X completed the column X(0,0), X(1,0), X(2,0), so the expected terminal event is XWin."
  },
  {
    id: "uncoordinated-hot-cold",
    shortTitle: "Uncoordinated Hot-Cold Requirements",
    title: "At-least Hot-Cold requirements without preventing consecutive hot events",
    summary:
      "Independent counting requirements can be satisfied while the ordering constraint between Hot and Cold is violated.",
    requirement: "The model needs both occurrence counts and a no-consecutive-Hot coordination rule.",
    code: `var Hot = bp.Event("Hot");
var Cold = bp.Event("Cold");

bp.registerBThread("AtLeastThreeHot", function () {
  for (var i = 0; i < 3; i++) {
    bp.sync({
      request: Hot
    });
  }
});

bp.registerBThread("AtLeastThreeCold", function () {
  for (var i = 0; i < 3; i++) {
    bp.sync({
      request: Cold
    });
  }
});`,
    explanation: [
      "The implementation creates two progress obligations: at least three Hot events and at least three Cold events.",
      "It does not encode the coordination constraint that two Hot events should not occur consecutively.",
      "If Hot and Cold are both requested and neither is blocked, event selection may still choose consecutive Hot events."
    ],
    trace: ["Hot", "Hot", "Cold", "Hot", "Cold", "Cold"],
    traceNote:
      "The trace satisfies the counting requirement, but it violates the intended rule because the first two Hot events are consecutive."
  }
];

const views = {
  intro: document.querySelector("#intro-view"),
  scenarios: document.querySelector("#scenarios-view"),
  detail: document.querySelector("#detail-view")
};

const scenarioGrid = document.querySelector("#scenario-grid");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function highlightCode(code) {
  const escaped = escapeHtml(code);
  return escaped
    .replace(/\b(function|var|let|const|if|else|while|for|true|false|return|break|null)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(bp|sync|registerBThread|request|waitFor|block)\b/g, '<span class="bp">$1</span>')
    .replace(/(&quot;.*?&quot;)/g, '<span class="str">$1</span>');
}

function showView(name) {
  Object.values(views).forEach((view) => view.classList.remove("is-active"));
  views[name].classList.add("is-active");
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderScenarioGrid() {
  scenarioGrid.innerHTML = scenarios
    .map(
      (scenario, index) => `
        <a class="scenario-card" href="#scenario/${scenario.id}">
          <div>
            <span class="index">Scenario ${String(index + 1).padStart(2, "0")}</span>
            <h2>${escapeHtml(scenario.shortTitle)}</h2>
            <p>${escapeHtml(scenario.summary)}</p>
          </div>
          <span class="open-label">Open scenario</span>
        </a>
      `
    )
    .join("");
}

function renderDetail(scenario) {
  views.detail.innerHTML = `
    <div class="detail-shell">
      <a class="back-link" href="#scenarios">Back to scenarios</a>
      <div class="detail-hero">
        <div>
          <p class="eyebrow">Bug pattern</p>
          <h1>${escapeHtml(scenario.title)}</h1>
          <p class="lede">${escapeHtml(scenario.summary)}</p>
        </div>
        <div class="detail-meta" aria-label="Scenario metadata">
          <div class="meta-pill">${escapeHtml(scenario.requirement)}</div>
          <a class="button secondary" href="mailto:almogzh@post.bgu.ac.il,achiya@bgu.ac.il,gera.weiss@gmail.com?subject=Feedback%20on%20${encodeURIComponent(scenario.shortTitle)}">Send feedback on this scenario</a>
        </div>
      </div>

      <div class="detail-layout">
        <article class="code-panel">
          <header>
            <span>Incorrect BP-style JavaScript</span>
            <span>.js</span>
          </header>
          <pre><code>${highlightCode(scenario.code)}</code></pre>
        </article>

        <div class="detail-copy">
          <section>
            <h2>Explanation</h2>
            ${scenario.explanation.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
          </section>

          <article class="trace-list">
            <header>
              <span>Wrong trace example</span>
              <span>${scenario.trace.length} events</span>
            </header>
            <ol>
              ${scenario.trace
                .map(
                  (event, index) => `
                    <li>
                      <span class="step">${index + 1}</span>
                      <span class="event">${escapeHtml(event)}</span>
                    </li>
                  `
                )
                .join("")}
            </ol>
          </article>

          <section>
            <h2>Why the trace is wrong</h2>
            <p>${escapeHtml(scenario.traceNote)}</p>
          </section>
        </div>
      </div>
    </div>
  `;
}

function route() {
  const hash = window.location.hash.replace(/^#/, "");

  if (hash.startsWith("scenario/")) {
    const id = hash.split("/")[1];
    const scenario = scenarios.find((item) => item.id === id);
    if (scenario) {
      renderDetail(scenario);
      showView("detail");
      document.title = `${scenario.shortTitle} | BP Debugging Scenarios`;
      return;
    }
  }

  if (hash === "scenarios") {
    showView("scenarios");
    document.title = "Scenarios | BP Debugging Scenarios";
    return;
  }

  showView("intro");
  document.title = "Behavioral Programming Debugging Scenarios";
}

renderScenarioGrid();
window.addEventListener("hashchange", route);
route();
