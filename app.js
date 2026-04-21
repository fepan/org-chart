(function () {
  "use strict";

  const chartEl = document.getElementById("chart");
  const fileInput = document.getElementById("file-input");
  const uploadBtn = document.getElementById("upload-btn");
  const expandBtn = document.getElementById("expand-btn");
  const mgmtBtn = document.getElementById("mgmt-btn");
  const collapseBtn = document.getElementById("collapse-btn");

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

  // ── Rendering ──

  function renderTree(roots) {
    chartEl.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.classList.add("children", "tree-root");

    for (const root of roots) {
      wrapper.appendChild(renderNode(root, 0));
    }

    chartEl.appendChild(wrapper);
  }

  function renderNode(node, depth) {
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

    if (isManager) {
      // Reports count
      const reportsEl = document.createElement("div");
      reportsEl.className = "reports";
      reportsEl.textContent =
        node.children.length +
        " direct report" +
        (node.children.length !== 1 ? "s" : "");
      card.appendChild(reportsEl);

      // Toggle indicator
      const toggleEl = document.createElement("span");
      toggleEl.className = "toggle";
      toggleEl.textContent = "−"; // minus sign
      card.appendChild(toggleEl);

      // Accessibility
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-expanded", "true");

      // Click handler
      card.addEventListener("click", function () {
        toggleNode(treeNode);
      });

      // Keyboard handler
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleNode(treeNode);
        }
      });
    }

    treeNode.appendChild(card);

    // Children container
    if (isManager) {
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "children";

      for (const child of node.children) {
        childrenContainer.appendChild(renderNode(child, depth + 1));
      }

      treeNode.appendChild(childrenContainer);
    }

    return treeNode;
  }

  // ── Toggle / Expand / Collapse ──

  function toggleNode(treeNodeEl) {
    const childrenContainer = treeNodeEl.querySelector(":scope > .children");
    if (!childrenContainer) return;

    const card = treeNodeEl.querySelector(":scope > .node-card");
    const isCollapsed = childrenContainer.classList.toggle("collapsed");

    if (card) {
      card.setAttribute("aria-expanded", String(!isCollapsed));
      const toggle = card.querySelector(".toggle");
      if (toggle) {
        toggle.textContent = isCollapsed ? "+" : "−";
      }
    }
  }

  function clearIcHidden() {
    chartEl.querySelectorAll(".tree-node.ic-hidden").forEach(function (tn) {
      tn.classList.remove("ic-hidden");
    });
  }

  function expandAll() {
    clearIcHidden();
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

  // ── Event listeners ──

  uploadBtn.addEventListener("click", function () {
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
      const text = e.target.result;

      if (!text || text.trim() === "") {
        showError("Please upload a CSV file");
        fileInput.value = "";
        return;
      }

      const result = parseCSV(text);

      if (result.error === "empty") {
        showError("Please upload a CSV file");
      } else if (result.error === "columns") {
        showError("CSV must contain columns: Name, Title, Manager");
      } else if (result.error === "no_data") {
        showError("No valid data found in CSV");
      } else {
        const roots = buildTree(result.people);
        renderTree(roots);
        applyDefaultExpansion(getDefaultDepth());
      }

      fileInput.value = "";
    };

    reader.readAsText(file);
  });

  expandBtn.addEventListener("click", expandAll);
  mgmtBtn.addEventListener("click", expandManagers);
  collapseBtn.addEventListener("click", collapseAll);

})();
