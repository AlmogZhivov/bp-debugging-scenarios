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
    shortTitle: "Incorrect Handling of Response Obligations",
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
    shortTitle: "Missing Priority Specification",
    title: "Incorrect Event Selection Caused by Missing Priority or Blocking",
    summary:
      "When multiple events are selectable at the same synchronization point, failing to encode the required precedence may allow the wrong event to be selected.",
    requirement:
      "A win should take precedence over a tie when both terminal conditions become enabled at the same time.",
    codeLabel: "Incorrect BP-style pseudocode",
    codeType: "pseudocode",
    code: `b-thread DetectXWin:
    waitFor(X completes a winning line)
    request(XWin)

b-thread DetectTie:
    repeat 9 times:
        waitFor(Move)

    request(Tie)

b-thread EndOfGame:
    waitFor([XWin, OWin, Tie])
    block(AllEvents)`,
    explanation: [
      "The win detector and the tie detector represent two independent behavioral requirements.",
      "DetectXWin requests XWin when an X move completes a winning line. At the same time, DetectTie counts every move and requests Tie after the ninth move.",
      "If the ninth move also completes a winning line for X, both b-threads reach their request points in the same synchronization state: DetectXWin requests XWin, while DetectTie requests Tie. Both events are therefore selectable.",
      "The intended behavior requires XWin to take precedence over Tie. Since no priority rule or blocking relation expresses this requirement, the event-selection mechanism may select Tie.",
      "Neither b-thread is individually incorrect. The bug appears in the interaction between their requests because the required precedence was not encoded."
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
      "Tie"
    ],
    traceExplanation: [
      "The final move X(2,0) completes the column X(0,0), X(1,0), X(2,0).",
      "It is also the ninth move, so both the win condition and the tie condition become enabled.",
      "The expected terminal event is XWin, but because no precedence between XWin and Tie is encoded, Tie may be selected instead."
    ]
  },
  {
    id: "uncoordinated-requirements",
    shortTitle: "Uncoordinated Requirements",
    title: "Uncoordinated Requirements",
    summary:
      "Multiple requirements may be individually correct, yet their interaction can prevent the system from making progress.",
    requirement: "Coordination between requirements must preserve both safety and progress.",
    codeLabel: "Incorrect BP-style pseudocode",
    codeType: "pseudocode",
    code: `b-thread RequireHot:
    repeat 3 times:
        request(Hot)

b-thread RequireCold:
    repeat 3 times:
        request(Cold)

b-thread NoConsecutiveHot:
    while true:
        waitFor(Hot)

        sync(
            waitFor = Cold,
            block   = Hot
        )`,
    explanation: [
      "The three requirements are individually reasonable, but their interaction can create a state in which a required event is permanently blocked.",
      "RequireHot requests three Hot events, RequireCold requests three Cold events, and NoConsecutiveHot blocks Hot after every Hot until a Cold occurs.",
      "A request does not guarantee that the requested event will eventually occur. Another b-thread may prevent it from being selected.",
      "If all three Cold events occur before the final Hot obligation, NoConsecutiveHot can later wait for a Cold that no b-thread will request. At the same time, it blocks the remaining requested Hot, leaving no selectable event."
    ],
    trace: ["Cold", "Cold", "Hot", "Cold", "Hot"],
    traceOutcome: "[STUCK]",
    traceExplanation: [
      "The system still needs another Hot, but Hot is blocked until a Cold occurs.",
      "No b-thread requests another Cold, so no event is selectable and the system cannot make progress.",
      "The remaining Hot requirement is never satisfied, even though the no-consecutive-Hot safety rule is preserved."
    ]
  }
];

const smells = [
  {
    id: "unobserved-event",
    title: "Unobserved Event",
    summary:
      "An event is requested and selected, but no observing b-thread explicitly waits for or reacts to it.",
    principle:
      "An event that affects the behavioral model would normally be observed by at least one relevant b-thread.",
    code: `b-thread Producer:
    request(Action)

No observing b-thread:
    waitFor(Action)

Selected event:
    Action`,
    suspicious: [
      "The model requests Action, and execution evidence confirms that Action is selected. Nevertheless, no observing b-thread waits for it or reacts to its occurrence.",
      "The absence of a listener is a structural warning; observing the event in an execution makes the warning stronger because the unobserved event is reachable in practice.",
      "This may indicate a missing listener, a missing behavioral response, or an event that is no longer relevant to the model."
    ],
    caveat: [
      "Some events are intentionally produced only as outputs to the environment and do not require another b-thread to observe them."
    ],
    finding: "Action was selected but has no known observing b-thread.",
    causes: "missing listener · missing behavioral response · obsolete event"
  },
  {
    id: "event-waited-for-never-produced",
    title: "Event Waited For but Never Produced",
    summary:
      "One or more b-threads wait for an event, but no b-thread in the model requests it.",
    principle:
      "A b-thread waiting for an internally generated event needs some possible source for that event.",
    code: `b-thread Consumer:
    waitFor(DataReady)

No b-thread:
    request(DataReady)`,
    suspicious: [
      "The waiting b-thread may never progress because the event it expects cannot be generated by the behavioral model.",
      "This may indicate a missing producer, an incorrect event name, or obsolete behavioral logic."
    ],
    caveat: [
      "The event may be produced externally by the environment. Events explicitly defined as external inputs should therefore be excluded from this warning."
    ],
    finding: "DataReady is waited for but has no known producer.",
    causes: "missing producer · event-name mismatch · external event not declared"
  },
  {
    id: "closed-event-dependency-cycle",
    title: "Closed Event-Dependency Cycle",
    summary:
      "A group of b-threads forms a circular event dependency with no apparent event that can initiate the interaction.",
    principle:
      "A closed event-dependency cycle needs a possible initiating event or an incoming dependency.",
    code: `b-thread A:
    waitFor(X)
    request(Y)

b-thread B:
    waitFor(Y)
    request(X)`,
    suspicious: [
      "Neither behavior can initiate the sequence by itself: X enables Y, while Y enables X.",
      "The model contains a behavioral cycle but no apparent entry point into that cycle, so both b-threads may remain waiting indefinitely.",
      "A linter can construct an event-dependency graph and flag a closed component that has no incoming producer."
    ],
    caveat: [
      "One of the events may be generated externally, or another execution path not shown here may initiate the cycle."
    ],
    finding: "X → Y → X. No internal initiating event was found.",
    causes: "missing producer · external event not declared · unreachable interaction"
  },
  {
    id: "ineffective-blocking-rule",
    title: "Ineffective Blocking Rule",
    summary:
      "A b-thread blocks an event that is never requested and is not known to originate externally.",
    principle:
      "A blocking requirement should normally constrain an event that can actually occur.",
    code: `b-thread Constraint:
    block(Cancel)

No b-thread:
    request(Cancel)`,
    suspicious: [
      "The blocking declaration can never influence event selection if the event has no possible source.",
      "It may indicate obsolete behavior, a missing producer, or an event-name mismatch."
    ],
    caveat: [
      "The event may be generated externally or by a component that is not represented in the analyzed model."
    ],
    finding: "Cancel is blocked but has no known internal or external producer.",
    causes: "obsolete constraint · missing producer · event-name mismatch"
  }
];

const views = {
  intro: document.querySelector("#intro-view"),
  scenarios: document.querySelector("#scenarios-view"),
  smells: document.querySelector("#smells-view"),
  detail: document.querySelector("#detail-view")
};

const scenarioGrid = document.querySelector("#scenario-grid");
const smellGrid = document.querySelector("#smell-grid");

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
    .replace(/\b(function|var|let|const|if|else|while|for|repeat|times|true|false|return|break|null)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(b-thread|bp|sync|registerBThread|request|waitFor|block)\b/g, '<span class="bp">$1</span>')
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

function renderSmellGrid() {
  smellGrid.innerHTML = smells
    .map(
      (smell, index) => `
        <a class="smell-card" href="#smell/${smell.id}">
          <div>
            <span class="smell-index">Smell ${String(index + 1).padStart(2, "0")}</span>
            <h2>${escapeHtml(smell.title)}</h2>
            <p>${escapeHtml(smell.summary)}</p>
          </div>
          <span class="smell-open-label">Inspect pattern</span>
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
            <span>${escapeHtml(scenario.codeLabel ?? "Incorrect BP-style pseudocode")}</span>
            <span>${escapeHtml(scenario.codeType ?? "pseudocode")}</span>
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
              <span>${scenario.trace.length} events${scenario.traceOutcome ? " + outcome" : ""}</span>
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
              ${scenario.traceOutcome ? `
                <li class="trace-outcome">
                  <span class="step">!</span>
                  <span class="event">${escapeHtml(scenario.traceOutcome)}</span>
                </li>
              ` : ""}
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

function renderSmellDetail(smell) {
  views.detail.innerHTML = `
    <div class="detail-shell smell-detail">
      <a class="back-link smell-back-link" href="#smells">Back to bad smells</a>
      <div class="detail-hero">
        <div>
          <span class="badge-row">
            <span class="smell-badge">Potential smell</span>
          </span>
          <h1>${escapeHtml(smell.title)}</h1>
          <p class="lede">${escapeHtml(smell.summary)}</p>
        </div>
        <div class="detail-meta" aria-label="Bad smell metadata">
          <div class="meta-pill smell-principle">${escapeHtml(smell.principle)}</div>
          <button class="button secondary compose-action" type="button" data-compose-url="https://mail.google.com/mail/?view=cm&fs=1&to=almogzh@post.bgu.ac.il,achiya@bgu.ac.il,geraw@bgu.ac.il&su=Feedback%20on%20potential%20BP%20bad%20smell%3A%20${encodeURIComponent(smell.title)}">Send feedback on this smell</button>
        </div>
      </div>

      <div class="detail-layout">
        <article class="code-panel smell-code-panel">
          <header>
            <span>BP-style pseudocode</span>
            <span>pseudocode</span>
          </header>
          <pre><code>${highlightCode(smell.code)}</code></pre>
        </article>

        <div class="detail-copy smell-copy">
          <section class="smell-finding">
            <p class="section-label">Example finding</p>
            <p class="finding-message">${escapeHtml(smell.finding)}</p>
            <p class="possible-causes"><strong>Possible causes:</strong> ${escapeHtml(smell.causes)}</p>
          </section>

          <section>
            <h2>Why it may be suspicious</h2>
            ${smell.suspicious.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
          </section>

          <section class="caveat-section">
            <h2>Not always a problem</h2>
            ${smell.caveat.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
          </section>
        </div>
      </div>
    </div>
  `;
}

function route() {
  const hash = window.location.hash.replace(/^#/, "");

  if (hash.startsWith("smell/")) {
    const id = hash.split("/")[1];
    const smell = smells.find((item) => item.id === id);
    if (smell) {
      renderSmellDetail(smell);
      showView("detail");
      document.title = `${smell.title} | Potential BP Bad Smells`;
      return;
    }
  }

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
    document.title = "Debugging Scenarios | BP Expert Catalog";
    return;
  }

  if (hash === "smells") {
    showView("smells");
    document.title = "Potential Bad Smells | BP Expert Catalog";
    return;
  }

  showView("intro");
  document.title = "Behavioral Programming Expert Catalog";
}

renderScenarioGrid();
renderSmellGrid();
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
