(function () {
  "use strict";

  const chartEl = document.getElementById("chart");
  const fileInput = document.getElementById("file-input");
  const uploadBtn = document.getElementById("upload-btn");
  const expandBtn = document.getElementById("expand-btn");
  const mgmtBtn = document.getElementById("mgmt-btn");
  const collapseBtn = document.getElementById("collapse-btn");

  var editPanel = document.getElementById("edit-panel");
  var panelName = document.getElementById("panel-name");
  var panelTitle = document.getElementById("panel-title");
  var panelManager = document.getElementById("panel-manager");
  var panelReports = document.getElementById("panel-reports");
  var panelCloseBtn = document.getElementById("panel-close-btn");
  var panelSaveBtn = document.getElementById("panel-save-btn");
  var panelCancelBtn = document.getElementById("panel-cancel-btn");
  var saveCsvBtn = document.getElementById("save-csv-btn");
  var resetBtn = document.getElementById("reset-btn");
  var legendEl = document.getElementById("change-legend");
  var statsBar = document.getElementById("stats-bar");
  var statTotal = document.getElementById("stat-total");
  var statAssoc = document.getElementById("stat-associates");
  var statManagers = document.getElementById("stat-managers");
  var statMgrOfMgr = document.getElementById("stat-mgr-of-mgr");
  var statRatio = document.getElementById("stat-ratio");
  var statOpenRoles = document.getElementById("stat-open-roles");

  let originalPeople = [];
  let currentPeople = [];
  let selectedPerson = null;
  var currentViewMode = "default";

  function getChanges() {
    var changes = new Map();
    var origMap = new Map(originalPeople.map(function (p) {
      return [p.name, p];
    }));

    for (var i = 0; i < currentPeople.length; i++) {
      var curr = currentPeople[i];
      var orig = origMap.get(curr.name);
      if (!orig) continue;

      var moved = curr.manager !== orig.manager;
      var edited = curr.title !== orig.title;

      if (moved || edited) {
        changes.set(curr.name, {
          moved: moved,
          edited: edited,
          originalManager: orig.manager
        });
      }
    }

    return changes;
  }

  function hasChanges() {
    return getChanges().size > 0;
  }

  function getSubtreeNames(name) {
    var names = [];
    var directReports = currentPeople.filter(function (p) { return p.manager === name; });
    for (var i = 0; i < directReports.length; i++) {
      names.push(directReports[i].name);
      names = names.concat(getSubtreeNames(directReports[i].name));
    }
    return names;
  }

  // ── Panel Logic ──

  function openPanel(name) {
    var person = currentPeople.find(function (p) { return p.name === name; });
    if (!person) return;

    selectedPerson = name;

    panelName.textContent = person.name;
    panelTitle.value = person.title;

    // Populate manager dropdown — exclude self and subtree
    var excluded = getSubtreeNames(name);
    excluded.push(name);

    panelManager.innerHTML = "";

    var noMgrOption = document.createElement("option");
    noMgrOption.value = "";
    noMgrOption.textContent = "(No Manager)";
    panelManager.appendChild(noMgrOption);

    var sortedPeople = currentPeople
      .filter(function (p) { return excluded.indexOf(p.name) === -1; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });

    for (var i = 0; i < sortedPeople.length; i++) {
      var opt = document.createElement("option");
      opt.value = sortedPeople[i].name;
      opt.textContent = sortedPeople[i].name;
      panelManager.appendChild(opt);
    }

    panelManager.value = person.manager;

    // Populate direct reports
    panelReports.innerHTML = "";
    var reports = currentPeople.filter(function (p) { return p.manager === name; });
    for (var j = 0; j < reports.length; j++) {
      var li = document.createElement("li");
      li.textContent = reports[j].name + " — " + reports[j].title;
      panelReports.appendChild(li);
    }

    // Show panel
    editPanel.removeAttribute("hidden");
    requestAnimationFrame(function () {
      editPanel.classList.add("visible");
    });
    document.body.classList.add("panel-open");

    highlightSelectedCard();
  }

  function closePanel() {
    selectedPerson = null;
    editPanel.classList.remove("visible");
    document.body.classList.remove("panel-open");

    var prev = chartEl.querySelector(".node-card.selected");
    if (prev) prev.classList.remove("selected");

    setTimeout(function () {
      if (!editPanel.classList.contains("visible")) {
        editPanel.setAttribute("hidden", "");
      }
    }, 250);
  }

  function highlightSelectedCard() {
    var prev = chartEl.querySelector(".node-card.selected");
    if (prev) prev.classList.remove("selected");

    if (!selectedPerson) return;

    var cards = chartEl.querySelectorAll(".node-card");
    for (var i = 0; i < cards.length; i++) {
      var nameEl = cards[i].querySelector(".name");
      if (nameEl && nameEl.textContent === selectedPerson) {
        cards[i].classList.add("selected");
        break;
      }
    }
  }

  function panelHasUnsavedChanges() {
    if (!selectedPerson) return false;
    var person = currentPeople.find(function (p) { return p.name === selectedPerson; });
    if (!person) return false;
    return panelTitle.value !== person.title || panelManager.value !== person.manager;
  }

  function updateToolbarButtons() {
    var changed = hasChanges();
    saveCsvBtn.hidden = !changed;
    resetBtn.hidden = !changed;
  }

  function updateLegend() {
    legendEl.hidden = !hasChanges();
  }

  // ── CSV Parsing ──

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) return { error: "empty" };

    const headerLine = lines[0];
    const headers = splitCSVRow(headerLine).map((h) => h.trim().toLowerCase());

    const nameIdx = headers.indexOf("name");
    const titleIdx = headers.indexOf("title");
    const managerIdx = headers.indexOf("manager");

    if (nameIdx === -1 || titleIdx === -1 || managerIdx === -1) {
      return { error: "columns" };
    }

    const colCount = headers.length;
    const people = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCSVRow(lines[i]);
      if (cols.length !== colCount) continue;

      const name = cols[nameIdx].trim();
      const title = cols[titleIdx].trim();
      const manager = cols[managerIdx].trim();

      if (!name) continue;

      people.push({ name, title, manager });
    }

    if (people.length === 0) return { error: "no_data" };
    return { people };
  }

  function splitCSVRow(row) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (inQuotes) {
        if (ch === '"' && row[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          result.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }

  // ── Tree Building ──

  function buildTree(people) {
    const map = new Map();

    for (const p of people) {
      map.set(p.name, {
        name: p.name,
        title: p.title,
        manager: p.manager,
        children: [],
      });
    }

    for (const p of people) {
      if (p.manager && !map.has(p.manager)) {
        map.set(p.manager, {
          name: p.manager,
          title: "",
          manager: "",
          children: [],
        });
      }
    }

    const roots = [];

    for (const node of map.values()) {
      if (node.manager && map.has(node.manager)) {
        map.get(node.manager).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  // ── Stats ──

  function isOpenRole(name) {
    return name.toLowerCase().includes("backfill") || /\d/.test(name);
  }

  function countOpenRoles(node) {
    var count = isOpenRole(node.name) ? 1 : 0;
    for (var i = 0; i < node.children.length; i++) {
      count += countOpenRoles(node.children[i]);
    }
    return count;
  }

  function computeOrgStats(roots) {
    var associates = 0;
    var managers = 0;
    var managersOfManagers = 0;
    var openRoles = 0;
    var directOpenRoles = 0;

    function walk(node) {
      if (isOpenRole(node.name)) { openRoles++; }
      if (node.children.length === 0) {
        associates++;
      } else {
        managers++;
        var hasManagerChild = false;
        for (var i = 0; i < node.children.length; i++) {
          if (isOpenRole(node.children[i].name)) { directOpenRoles++; }
          if (node.children[i].children.length > 0) {
            hasManagerChild = true;
          }
          walk(node.children[i]);
        }
        if (hasManagerChild) {
          managersOfManagers++;
        }
      }
    }

    for (var i = 0; i < roots.length; i++) {
      walk(roots[i]);
    }

    return {
      total: associates + managers,
      associates: associates,
      managers: managers,
      managersOfManagers: managersOfManagers,
      openRoles: openRoles,
      directOpenRoles: directOpenRoles,
      ratio: managers > 0 ? (associates / managers).toFixed(1) : "N/A"
    };
  }

  function updateStatsBar(roots) {
    if (roots.length === 0) {
      statsBar.hidden = true;
      return;
    }
    var stats = computeOrgStats(roots);
    statTotal.textContent = stats.total;
    statAssoc.textContent = stats.associates;
    statManagers.textContent = stats.managers;
    statMgrOfMgr.textContent = stats.managersOfManagers;
    statOpenRoles.textContent = stats.openRoles;
    statRatio.textContent = stats.ratio;
    statsBar.hidden = false;
  }

  // ── Rendering ──

  function renderTree(roots) {
    var changes = getChanges();
    chartEl.innerHTML = "";

    if (legendEl) {
      legendEl.hidden = changes.size === 0;
      // Re-append legend since innerHTML cleared it
      if (changes.size > 0) {
        chartEl.appendChild(legendEl);
        legendEl.removeAttribute("hidden");
      }
    }

    var wrapper = document.createElement("div");
    wrapper.classList.add("children", "tree-root");

    for (var i = 0; i < roots.length; i++) {
      wrapper.appendChild(renderNode(roots[i], 0, changes));
    }

    chartEl.appendChild(wrapper);
  }

  function renderNode(node, depth, changes) {
    const treeNode = document.createElement("div");
    treeNode.className = "tree-node";

    const card = document.createElement("div");
    const isManager = node.children.length > 0;
    card.className = "node-card " + (isManager ? "manager" : "leaf");

    // Name
    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = node.name;
    card.appendChild(nameEl);

    // Title
    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = node.title;
    card.appendChild(titleEl);

    var change = changes.get(node.name);
    if (change) {
      if (change.moved && change.edited) {
        card.classList.add("diff-both");
      } else if (change.moved) {
        card.classList.add("diff-moved");
      } else if (change.edited) {
        card.classList.add("diff-edited");
      }

      if (change.moved) {
        var wasUnder = document.createElement("div");
        wasUnder.className = "was-under";
        var origMgr = change.originalManager || "no one";
        wasUnder.textContent = "\u2190 was under " + origMgr;
        card.appendChild(wasUnder);
      }
    }

    card.addEventListener("click", function () {
      if (selectedPerson === node.name) {
        if (panelHasUnsavedChanges()) {
          if (!confirm("You have unsaved changes. Discard them?")) return;
        }
        closePanel();
        return;
      }
      if (selectedPerson && panelHasUnsavedChanges()) {
        if (!confirm("You have unsaved changes. Discard them?")) return;
      }
      openPanel(node.name);
    });

    if (isManager) {
      // Reports count — click to expand/collapse all directs
      const reportsEl = document.createElement("div");
      reportsEl.className = "reports";
      reportsEl.textContent =
        node.children.length +
        " direct report" +
        (node.children.length !== 1 ? "s" : "");
      reportsEl.setAttribute("tabindex", "0");
      reportsEl.setAttribute("role", "button");
      reportsEl.setAttribute("title", "Expand all direct reports");
      reportsEl.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleNodeAll(treeNode);
      });
      reportsEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleNodeAll(treeNode);
        }
      });
      var directOpen = 0;
      for (var oi = 0; oi < node.children.length; oi++) {
        if (isOpenRole(node.children[oi].name)) directOpen++;
      }
      if (directOpen > 0) {
        var openEl = document.createElement("span");
        openEl.className = "open-badge";
        openEl.textContent = directOpen + " open";
        reportsEl.appendChild(openEl);
      }
      card.appendChild(reportsEl);

      // Toggle indicator — click to expand/collapse managers only
      const toggleEl = document.createElement("span");
      toggleEl.className = "toggle";
      toggleEl.textContent = "−";
      toggleEl.setAttribute("tabindex", "0");
      toggleEl.setAttribute("role", "button");
      toggleEl.setAttribute("title", "Expand managers only");
      toggleEl.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleNodeManagers(treeNode);
      });
      toggleEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleNodeManagers(treeNode);
        }
      });
      card.appendChild(toggleEl);

      card.setAttribute("aria-expanded", "true");

      var tooltip = document.createElement("div");
      tooltip.className = "org-tooltip";
      card.appendChild(tooltip);
      card.addEventListener("mouseenter", function () {
        var s = computeOrgStats([node]);
        var myDirectOpen = 0;
        for (var di = 0; di < node.children.length; di++) {
          if (isOpenRole(node.children[di].name)) myDirectOpen++;
        }
        tooltip.textContent =
          s.total + " Total · " +
          s.associates + " Associates · " +
          s.managers + " Managers · " +
          s.managersOfManagers + " Mgrs of Mgrs · " +
          myDirectOpen + " Direct Open · " +
          s.openRoles + " Org Open · " +
          s.ratio + " Assoc/Mgr";
        var cardRect = card.getBoundingClientRect();
        var barBottom = statsBar.getBoundingClientRect().bottom;
        tooltip.classList.toggle("tooltip-below", cardRect.top - barBottom < 40);
        tooltip.classList.toggle("tooltip-right", cardRect.left < 100);
        tooltip.classList.toggle("tooltip-left", window.innerWidth - cardRect.right < 100);
      });
    }

    treeNode.appendChild(card);

    // Children container
    if (isManager) {
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "children";

      for (const child of node.children) {
        childrenContainer.appendChild(renderNode(child, depth + 1, changes));
      }

      treeNode.appendChild(childrenContainer);
    }

    return treeNode;
  }

  // ── Toggle / Expand / Collapse ──

  function updateCardState(card, expanded) {
    if (!card) return;
    card.setAttribute("aria-expanded", String(expanded));
    var toggle = card.querySelector(".toggle");
    if (toggle) toggle.textContent = expanded ? "−" : "+";
  }

  function clearIcHiddenSubtree(treeNodeEl) {
    treeNodeEl.querySelectorAll(".tree-node.ic-hidden").forEach(function (tn) {
      tn.classList.remove("ic-hidden");
    });
  }

  function collapseSubtree(treeNodeEl) {
    var childrenContainer = treeNodeEl.querySelector(":scope > .children");
    if (!childrenContainer) return;
    childrenContainer.classList.add("collapsed");
    treeNodeEl.removeAttribute("data-expand-mode");
    clearIcHiddenSubtree(treeNodeEl);
    updateCardState(treeNodeEl.querySelector(":scope > .node-card"), false);
  }

  function flashNoManagers(card) {
    var toggle = card.querySelector(".toggle");
    if (!toggle) return;
    toggle.classList.add("flash-no-managers");
    setTimeout(function () {
      toggle.classList.remove("flash-no-managers");
    }, 600);
  }

  function expandManagersSubtree(treeNodeEl) {
    var childrenContainer = treeNodeEl.querySelector(":scope > .children");
    if (!childrenContainer) return;

    var childNodes = childrenContainer.querySelectorAll(":scope > .tree-node");
    childNodes.forEach(function (child) {
      var childCard = child.querySelector(":scope > .node-card");
      if (childCard && childCard.classList.contains("leaf")) {
        child.classList.add("ic-hidden");
      }
    });

    childrenContainer.classList.remove("collapsed");
    treeNodeEl.setAttribute("data-expand-mode", "managers");
    updateCardState(treeNodeEl.querySelector(":scope > .node-card"), true);

    childNodes.forEach(function (child) {
      var childCard = child.querySelector(":scope > .node-card");
      if (childCard && childCard.classList.contains("manager")) {
        var childChildren = child.querySelector(":scope > .children");
        if (childChildren && childChildren.querySelector(":scope > .tree-node > .node-card.manager")) {
          expandManagersSubtree(child);
        }
      }
    });
  }

  function toggleNodeAll(treeNodeEl) {
    var childrenContainer = treeNodeEl.querySelector(":scope > .children");
    if (!childrenContainer) return;

    if (!childrenContainer.classList.contains("collapsed")) {
      collapseSubtree(treeNodeEl);
    } else {
      clearIcHiddenSubtree(treeNodeEl);
      childrenContainer.classList.remove("collapsed");
      treeNodeEl.setAttribute("data-expand-mode", "all");
      updateCardState(treeNodeEl.querySelector(":scope > .node-card"), true);
    }
  }

  function toggleNodeManagers(treeNodeEl) {
    var childrenContainer = treeNodeEl.querySelector(":scope > .children");
    if (!childrenContainer) return;

    if (!childrenContainer.classList.contains("collapsed")) {
      collapseSubtree(treeNodeEl);
      return;
    }

    var hasManagerChild = childrenContainer.querySelector(
      ":scope > .tree-node > .node-card.manager"
    );
    if (!hasManagerChild) {
      flashNoManagers(treeNodeEl.querySelector(":scope > .node-card"));
      return;
    }

    expandManagersSubtree(treeNodeEl);
  }

  function clearIcHidden() {
    chartEl.querySelectorAll(".tree-node.ic-hidden").forEach(function (tn) {
      tn.classList.remove("ic-hidden");
    });
  }

  function expandAll() {
    clearIcHidden();
    chartEl.querySelectorAll("[data-expand-mode]").forEach(function (tn) {
      tn.removeAttribute("data-expand-mode");
    });
    const containers = chartEl.querySelectorAll(".children.collapsed");
    containers.forEach(function (c) {
      c.classList.remove("collapsed");
    });

    const cards = chartEl.querySelectorAll('.node-card.manager');
    cards.forEach(function (card) {
      card.setAttribute("aria-expanded", "true");
      const toggle = card.querySelector(".toggle");
      if (toggle) toggle.textContent = "−";
    });
  }

  function collapseAll() {
    clearIcHidden();
    chartEl.querySelectorAll("[data-expand-mode]").forEach(function (tn) {
      tn.removeAttribute("data-expand-mode");
    });
    const containers = chartEl.querySelectorAll(
      ".tree-node > .children"
    );
    containers.forEach(function (c) {
      c.classList.add("collapsed");
    });

    const cards = chartEl.querySelectorAll('.node-card.manager');
    cards.forEach(function (card) {
      card.setAttribute("aria-expanded", "false");
      const toggle = card.querySelector(".toggle");
      if (toggle) toggle.textContent = "+";
    });
  }

  function expandManagers() {
    collapseAll();
    chartEl.querySelectorAll(".tree-node").forEach(function (tn) {
      var card = tn.querySelector(":scope > .node-card");
      if (card && card.classList.contains("leaf")) {
        tn.classList.add("ic-hidden");
      }
    });
    var treeNodes = chartEl.querySelectorAll(".tree-node");
    treeNodes.forEach(function (treeNode) {
      var childrenContainer = treeNode.querySelector(":scope > .children");
      if (!childrenContainer) return;

      var hasManagerChild = childrenContainer.querySelector(
        ":scope > .tree-node > .node-card.manager"
      );
      if (!hasManagerChild) return;

      childrenContainer.classList.remove("collapsed");
      treeNode.setAttribute("data-expand-mode", "managers");
      var card = treeNode.querySelector(":scope > .node-card");
      if (card) {
        card.setAttribute("aria-expanded", "true");
        var toggle = card.querySelector(".toggle");
        if (toggle) toggle.textContent = "−";
      }
    });
  }

  // ── Default expansion depth ──

  function getDefaultDepth() {
    const w = window.innerWidth;
    if (w > 1024) return 2;
    if (w >= 768) return 1;
    return 0;
  }

  function applyDefaultExpansion(depth) {
    collapseAll();
    if (depth > 0) {
      const topWrapper = chartEl.querySelector(':scope > .children');
      if (topWrapper) {
        expandToDepth(topWrapper, 0, depth);
      }
    }
  }

  function expandToDepth(parentEl, currentDepth, maxDepth) {
    if (currentDepth >= maxDepth) return;

    const treeNodes = parentEl.querySelectorAll(":scope > .tree-node");
    treeNodes.forEach(function (treeNode) {
      const childrenContainer = treeNode.querySelector(":scope > .children");
      if (childrenContainer) {
        childrenContainer.classList.remove("collapsed");

        const card = treeNode.querySelector(":scope > .node-card");
        if (card) {
          card.setAttribute("aria-expanded", "true");
          const toggle = card.querySelector(".toggle");
          if (toggle) toggle.textContent = "−";
        }

        expandToDepth(childrenContainer, currentDepth + 1, maxDepth);
      }
    });
  }

  // ── Error display ──

  function showError(message) {
    chartEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "error-state";
    p.textContent = message;
    chartEl.appendChild(p);
  }

  // ── Load CSV text ──

  function loadCSVText(text) {
    if (!text || text.trim() === "") {
      showError("Please upload a CSV file");
      return;
    }

    var result = parseCSV(text);

    if (result.error === "empty") {
      showError("Please upload a CSV file");
    } else if (result.error === "columns") {
      showError("CSV must contain columns: Name, Title, Manager");
    } else if (result.error === "no_data") {
      showError("No valid data found in CSV");
    } else {
      var fullPeople = addMissingManagers(result.people);
      originalPeople = fullPeople.map(function (p) {
        return { name: p.name, title: p.title, manager: p.manager };
      });
      currentPeople = fullPeople.map(function (p) {
        return { name: p.name, title: p.title, manager: p.manager };
      });
      selectedPerson = null;
      rebuildAndRender();
    }
  }

  function rebuildAndRender() {
    var roots = buildTree(currentPeople);
    renderTree(roots);
    updateStatsBar(roots);
    if (currentViewMode === "expand") {
      expandAll();
    } else if (currentViewMode === "managers") {
      expandManagers();
    } else if (currentViewMode === "collapse") {
      collapseAll();
    } else {
      applyDefaultExpansion(getDefaultDepth());
    }
    highlightSelectedCard();
  }

  function addMissingManagers(people) {
    var names = new Set(people.map(function (p) { return p.name; }));
    var toAdd = [];
    for (var i = 0; i < people.length; i++) {
      var mgr = people[i].manager;
      if (mgr && !names.has(mgr)) {
        names.add(mgr);
        toAdd.push({ name: mgr, title: "", manager: "" });
      }
    }
    return people.concat(toAdd);
  }

  function csvEscape(value) {
    if (value.indexOf(",") !== -1 || value.indexOf('"') !== -1 || value.indexOf("\n") !== -1) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  // ── Event listeners ──

  uploadBtn.addEventListener("click", function () {
    if (hasChanges()) {
      if (!confirm("You have unsaved changes. Load a new file?")) return;
    }
    fileInput.click();
  });

  fileInput.addEventListener("change", function () {
    const file = fileInput.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      showError("Please upload a CSV file");
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      loadCSVText(e.target.result);
      fileInput.value = "";
    };

    reader.readAsText(file);
  });

  // Auto-load from ?file= URL parameter
  var params = new URLSearchParams(window.location.search);
  var autoFile = params.get("file");
  if (autoFile) {
    fetch(autoFile)
      .then(function (r) { return r.text(); })
      .then(loadCSVText)
      .catch(function () { showError("Could not load " + autoFile); });
  }

  expandBtn.addEventListener("click", function () { currentViewMode = "expand"; expandAll(); });
  mgmtBtn.addEventListener("click", function () { currentViewMode = "managers"; expandManagers(); });
  collapseBtn.addEventListener("click", function () { currentViewMode = "collapse"; collapseAll(); });

  panelCloseBtn.addEventListener("click", function () {
    if (panelHasUnsavedChanges()) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    closePanel();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && selectedPerson) {
      if (panelHasUnsavedChanges()) {
        if (!confirm("You have unsaved changes. Discard them?")) return;
      }
      closePanel();
    }
  });

  panelCancelBtn.addEventListener("click", function () {
    if (panelHasUnsavedChanges()) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    closePanel();
  });

  panelSaveBtn.addEventListener("click", function () {
    if (!selectedPerson) return;

    var newTitle = panelTitle.value.trim();
    var newManager = panelManager.value;

    currentPeople = currentPeople.map(function (p) {
      if (p.name === selectedPerson) {
        return { name: p.name, title: newTitle, manager: newManager };
      }
      return { name: p.name, title: p.title, manager: p.manager };
    });

    var savedName = selectedPerson;
    rebuildAndRender();
    updateToolbarButtons();
    updateLegend();
    openPanel(savedName);
  });

  saveCsvBtn.addEventListener("click", function () {
    var lines = ["Name,Title,Manager"];

    for (var i = 0; i < currentPeople.length; i++) {
      var p = currentPeople[i];
      lines.push(csvEscape(p.name) + "," + csvEscape(p.title) + "," + csvEscape(p.manager));
    }

    var csvText = lines.join("\n") + "\n";
    var blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);

    var today = new Date().toISOString().slice(0, 10);
    var a = document.createElement("a");
    a.href = url;
    a.download = "reorg-" + today + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  resetBtn.addEventListener("click", function () {
    if (!confirm("Discard all changes?")) return;

    currentPeople = originalPeople.map(function (p) {
      return { name: p.name, title: p.title, manager: p.manager };
    });
    selectedPerson = null;
    closePanel();
    rebuildAndRender();
    updateToolbarButtons();
    updateLegend();
  });

})();
