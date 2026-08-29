const scenarios = [
  {
    id: "stale-request",
    shortTitle: "Stale Request",
    title: "Stale Request",
    summary:
      "A b-thread continues requesting an event after the condition that justified the request is no longer valid.",
    requirement:
      "A request should remain active only while the condition that justified it is still valid.",
    codeLabel: "Incorrect BP-style pseudocode",
    codeType: "pseudocode",
    code: `b-thread HandleCommands:
    while true:
        command = waitFor(AllCommands)
        request(Do(command))

b-thread ServiceState:
    while true:
        waitFor(StopService)

        sync(
            waitFor = ResumeService,
            block   = AllDoActions
        )`,
    explanation: [
      "After receiving a command, HandleCommands requests the corresponding Do(command) event.",
      "If StopService occurs before that action is selected, ServiceState moves to a synchronization point that blocks all Do(...) actions until ResumeService occurs.",
      "Blocking the event does not remove the existing request. HandleCommands therefore remains at the same synchronization point and continues requesting the old action.",
      "When ResumeService occurs, ServiceState leaves the blocking synchronization point. The old request may then become selectable even though the condition that originally justified it is no longer valid. The request is therefore stale."
    ],
    trace: ["Command(A)", "StopService", "ResumeService", "Do(A)"],
    traceExplanation: [
      "Do(A) corresponds to a command received before the service was stopped.",
      "Stopping the service should invalidate pending actions from the previous service state. After the service resumes, the old action should not execute simply because the blocking constraint has been removed.",
      "The bug occurs because HandleCommands never withdraws or invalidates its old request for Do(A)."
    ]
  },
  {
    id: "incorrect-response-obligation",
    shortTitle: "Incorrect Response Obligation",
    title: "Wrong Implementation of \"For Every X, There Must Be a Corresponding Y\"",
    summary:
      "A sequential b-thread may miss a new occurrence of X while it is still handling the response Y for a previous occurrence.",
    requirement: "Every occurrence of X must create its own corresponding Y obligation.",
    codeLabel: "Incorrect BP-style pseudocode",
    codeType: "pseudocode",
    code: `b-thread LogMessages:
    while true:
        m = waitFor(Message)
        request(Log(m))

b-thread ProduceMessages:
    request(Message("Hello"))
    request(Message("World"))`,
    explanation: [
      "LogMessages is intended to implement the requirement: for every Message(m), a corresponding Log(m) must occur.",
      "After observing Message(\"Hello\"), the b-thread moves to its next synchronization point and requests Log(\"Hello\"). At that moment, however, it is no longer waiting for Message events.",
      "Meanwhile, ProduceMessages may request Message(\"World\"). Both Log(\"Hello\") and Message(\"World\") can now be selectable.",
      "If Message(\"World\") is selected first, LogMessages does not observe it because the b-thread is still at the synchronization point requesting Log(\"Hello\"). The second message therefore creates no corresponding logging obligation.",
      "The problem is that a single sequential b-thread is being used to implement multiple potentially overlapping response obligations."
    ],
    trace: ["Message(\"Hello\")", "Message(\"World\")", "Log(\"Hello\")"],
    traceExplanation: [
      "Message(\"World\") occurs while LogMessages is still handling the obligation created by Message(\"Hello\").",
      "Because the b-thread is not waiting for new messages at that synchronization point, it misses Message(\"World\").",
      "As a result, Log(\"World\") is never requested, violating the requirement that every message must have its own corresponding log event."
    ]
  },
  {
    id: "missing-priority-priority",
    shortTitle: "Missing Priority Bug",
    title: "Incorrect event selection caused by missing priority or missing blocking",
    summary:
      "When multiple events are selectable at the same synchronization point and one should take precedence, failing to encode priority or blocking may allow an unintended lower-priority event to be selected.",
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
    id: "uncoordinated-requirements",
    shortTitle: "Uncoordinated Requirements",
    title: "Incorrect behavior caused by uncoordinated requirements",
    summary:
      "Independent requirements may each be satisfied while their combined behavior violates an implicit relationship or ordering constraint.",   
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
  const traceExplanation = scenario.traceExplanation ?? [scenario.traceNote];

  views.detail.innerHTML = `
    <div class="detail-shell">
      <a class="back-link" href="#scenarios">Back to scenarios</a>
      <div class="detail-hero">
        <div>
          <p class="eyebrow">Bug type</p>
          <h1>${escapeHtml(scenario.title)}</h1>
          <p class="lede">${escapeHtml(scenario.summary)}</p>
        </div>
        <div class="detail-meta" aria-label="Scenario metadata">
          <div class="meta-pill">${escapeHtml(scenario.requirement)}</div>
          <button class="button secondary compose-action" type="button" data-compose-url="https://mail.google.com/mail/?view=cm&fs=1&to=almogzh@post.bgu.ac.il,achiya@bgu.ac.il,geraw@bgu.ac.il&su=Feedback%20on%20${encodeURIComponent(scenario.shortTitle)}">Send feedback on this type</button>
        </div>
      </div>

      <div class="detail-layout">
        <article class="code-panel">
          <header>
            <span>${escapeHtml(scenario.codeLabel ?? "Incorrect BP-style JavaScript")}</span>
            <span>${escapeHtml(scenario.codeType ?? ".js")}</span>
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
            ${traceExplanation.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
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
document.addEventListener("click", (event) => {
  const action = event.target.closest(".compose-action");
  if (!action) {
    return;
  }

  event.preventDefault();
  window.open(action.dataset.composeUrl, "_blank", "noopener");
});
route();
