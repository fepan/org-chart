(function () {
  "use strict";

  var chartEl = document.getElementById("chart");
  var fileInput = document.getElementById("file-input");
  var uploadBtn = document.getElementById("upload-btn");
  var expandBtn = document.getElementById("expand-btn");
  var mgmtBtn = document.getElementById("mgmt-btn");
  var collapseBtn = document.getElementById("collapse-btn");
  var searchInput = document.getElementById("search");

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
  var statAvgSpan = document.getElementById("stat-avg-span");
  var statLevels = document.getElementById("stat-levels");
  var statOpenRoles = document.getElementById("stat-open-roles");
  var tooltipEl = document.getElementById("tooltip");
  var emptyState = chartEl.querySelector(".empty-state");

  var planBtn = document.getElementById("plan-btn");
  var planFileInput = document.getElementById("plan-file-input");
  var ldapBtn = document.getElementById("ldap-btn");
  var ldapModal = document.getElementById("ldap-modal");
  var ldapModalClose = document.getElementById("ldap-modal-close");
  var ldapUidInput = document.getElementById("ldap-uid");
  var ldapDepthInput = document.getElementById("ldap-depth");
  var ldapImportBtn = document.getElementById("ldap-import-btn");
  var ldapCancelBtn = document.getElementById("ldap-cancel-btn");
  var ldapStatus = document.getElementById("ldap-status");

  let originalPeople = [];
  let currentPeople = [];
  let selectedPerson = null;
  var currentViewMode = "default";

  // D3 state
  var svg, g, zoomBehavior;
  var d3Root = null;
  var nodeIdCounter = 0;

  var levelColors = ["#e85d4a", "#e8774a", "#f0a03c", "#4aad8b", "#4a90c4", "#7b6bb5"];
  var levelFills = ["#2d1815", "#2d1f15", "#2d2515", "#152d25", "#15222d", "#1f1a2d"];
  var depthColors = ["transparent", "#555", "#7b6bb5", "#4a90c4", "#4aad8b", "#f0a03c", "#e85d4a"];

  var rectW = 170, rectH = 40;

  // ── Change Tracking ──

  function getChanges() {
    var changes = new Map();
    var origMap = new Map(originalPeople.map(function (p) {
      return [p.name, p];
    }));

    for (var i = 0; i < currentPeople.length; i++) {
      var curr = currentPeople[i];

      if (curr._removed) {
        changes.set(curr.name, {
          moved: false, edited: false, added: false, removed: true,
          originalManager: curr.manager
        });
        continue;
      }

      var orig = origMap.get(curr.name);
      if (!orig) {
        changes.set(curr.name, {
          moved: false, edited: false, added: true, removed: false,
          originalManager: ""
        });
        continue;
      }

      var moved = curr.manager !== orig.manager;
      var edited = curr.title !== orig.title;

      if (moved || edited) {
        changes.set(curr.name, {
          moved: moved,
          edited: edited,
          added: false,
          removed: false,
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

    panelReports.innerHTML = "";
    var reports = currentPeople.filter(function (p) { return p.manager === name; });
    for (var j = 0; j < reports.length; j++) {
      var li = document.createElement("li");
      li.textContent = reports[j].name + " — " + reports[j].title;
      panelReports.appendChild(li);
    }

    editPanel.removeAttribute("hidden");
    requestAnimationFrame(function () {
      editPanel.classList.add("visible");
    });
    document.body.classList.add("panel-open");

    highlightSelectedNode();
    setTimeout(fitToView, 300);
  }

  function closePanel() {
    selectedPerson = null;
    editPanel.classList.remove("visible");
    document.body.classList.remove("panel-open");

    highlightSelectedNode();

    setTimeout(function () {
      if (!editPanel.classList.contains("visible")) {
        editPanel.setAttribute("hidden", "");
      }
      fitToView();
    }, 250);
  }

  function highlightSelectedNode() {
    if (!svg) return;
    d3.selectAll(".node-group").classed("node-selected", function (d) {
      return d && d.data && d.data.name === selectedPerson;
    });
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
    planBtn.hidden = originalPeople.length === 0;
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
    var maxLevels = 0;
    var totalSpan = 0;
    var spanCount = 0;

    function walk(node, depth) {
      if (isOpenRole(node.name)) { openRoles++; }
      if (node.children.length === 0) {
        associates++;
        if (depth > maxLevels) maxLevels = depth;
      } else {
        managers++;
        totalSpan += node.children.length;
        spanCount++;
        var hasManagerChild = false;
        for (var i = 0; i < node.children.length; i++) {
          if (isOpenRole(node.children[i].name)) { directOpenRoles++; }
          if (node.children[i].children.length > 0) {
            hasManagerChild = true;
          }
          walk(node.children[i], depth + 1);
        }
        if (hasManagerChild) {
          managersOfManagers++;
        }
      }
    }

    for (var i = 0; i < roots.length; i++) {
      walk(roots[i], 0);
    }

    return {
      total: associates + managers,
      associates: associates,
      managers: managers,
      managersOfManagers: managersOfManagers,
      openRoles: openRoles,
      directOpenRoles: directOpenRoles,
      ratio: managers > 0 ? (associates / managers).toFixed(1) : "N/A",
      avgSpan: spanCount > 0 ? (totalSpan / spanCount).toFixed(1) : "N/A",
      levels: maxLevels
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
    statAvgSpan.textContent = stats.avgSpan;
    statLevels.textContent = stats.levels;
    statsBar.hidden = false;
  }

  // ── D3 Helpers ──

  function countAll(data) {
    var n = 1;
    var ch = data.children || [];
    for (var i = 0; i < ch.length; i++) {
      n += countAll(ch[i]);
    }
    return n;
  }

  function countManagersInData(data) {
    var ch = data.children || [];
    if (ch.length === 0) return 0;
    var n = 1;
    for (var i = 0; i < ch.length; i++) {
      n += countManagersInData(ch[i]);
    }
    return n;
  }

  function mgrDepth(data) {
    var ch = data.children || [];
    if (ch.length === 0) return 0;
    var max = 0;
    for (var i = 0; i < ch.length; i++) {
      var d = mgrDepth(ch[i]);
      if (d > max) max = d;
    }
    return 1 + max;
  }

  function truncText(t, maxLen) {
    if (!t) return "";
    return t.length > maxLen ? t.slice(0, maxLen - 2) + "..." : t;
  }

  function diagonal(s, t) {
    return "M" + s.y + "," + s.x +
      "C" + ((s.y + t.y) / 2) + "," + s.x +
      " " + ((s.y + t.y) / 2) + "," + t.x +
      " " + t.y + "," + t.x;
  }

  // ── D3 Initialization ──

  function initD3() {
    svg = d3.select("#tree-svg");
    g = svg.append("g");
    zoomBehavior = d3.zoom()
      .scaleExtent([0.1, 3])
      .on("zoom", function (e) { g.attr("transform", e.transform); });
    svg.call(zoomBehavior);
    svg.on("dblclick.zoom", null);
  }

  // ── D3 Rendering ──

  function updateChart(source) {
    if (!d3Root) return;

    var changes = getChanges();
    var treeLayout = d3.tree().nodeSize([48, 240]);
    treeLayout(d3Root);

    var nodes = d3Root.descendants();
    var links = d3Root.links();

    // Filter out virtual root from rendering
    var visibleNodes = nodes.filter(function (d) { return d.data.name !== "__root__"; });
    var visibleLinks = links.filter(function (d) {
      return d.source.data.name !== "__root__" && d.target.data.name !== "__root__";
    });
    // For virtual root, draw links from root's children as if they were roots
    var rootLinks = links.filter(function (d) {
      return d.source.data.name === "__root__";
    });

    var transition = d3.transition().duration(400);

    // ── Links ──
    var link = g.selectAll("path.link").data(visibleLinks.concat(rootLinks), function (d) { return d.target.id; });

    var linkEnter = link.enter().insert("path", "g")
      .attr("class", "link")
      .attr("d", function () {
        var o = { x: source.x0 || 0, y: source.y0 || 0 };
        return diagonal(o, o);
      });

    linkEnter.merge(link).transition(transition)
      .attr("d", function (d) { return diagonal(d.source, d.target); });

    link.exit().transition(transition)
      .attr("d", function () {
        var o = { x: source.x, y: source.y };
        return diagonal(o, o);
      }).remove();

    // ── Nodes ──
    var node = g.selectAll("g.node-group").data(visibleNodes, function (d) { return d.id; });

    var nodeEnter = node.enter().append("g")
      .attr("class", "node-group")
      .attr("transform", "translate(" + (source.y0 || 0) + "," + (source.x0 || 0) + ")");

    // Card background rect
    nodeEnter.append("rect")
      .attr("class", "node-rect")
      .attr("width", rectW)
      .attr("height", rectH)
      .attr("x", -rectW / 2)
      .attr("y", -rectH / 2);

    // Name text
    nodeEnter.append("text")
      .attr("class", "node-name")
      .attr("dy", -4)
      .attr("text-anchor", "middle");

    // Title text
    nodeEnter.append("text")
      .attr("class", "node-title-text")
      .attr("dy", 8)
      .attr("text-anchor", "middle");

    // Reports count (below name/title)
    nodeEnter.append("text")
      .attr("class", "node-count")
      .attr("x", -rectW / 2 + 8)
      .attr("dy", rectH / 2 - 3)
      .attr("text-anchor", "start");

    // Toggle indicator (right side of card)
    nodeEnter.append("text")
      .attr("class", "node-toggle")
      .attr("x", rectW / 2 - 12)
      .attr("dy", 4)
      .attr("text-anchor", "middle");

    // Depth badge circle
    nodeEnter.append("circle")
      .attr("class", "depth-circle")
      .attr("cx", rectW / 2 - 4)
      .attr("cy", -rectH / 2 + 4)
      .attr("r", 8);

    // Depth badge text
    nodeEnter.append("text")
      .attr("class", "depth-badge")
      .attr("x", rectW / 2 - 4)
      .attr("y", -rectH / 2 + 7)
      .attr("text-anchor", "middle");

    // Open roles badge rect (inside card, top-right area)
    nodeEnter.append("rect")
      .attr("class", "node-open-badge-rect")
      .attr("x", rectW / 2 - 48)
      .attr("y", -rectH / 2)
      .attr("width", 0)
      .attr("height", 14)
      .attr("rx", 0).attr("ry", 0);

    // Open roles badge text
    nodeEnter.append("text")
      .attr("class", "node-open-badge-text")
      .attr("x", rectW / 2 - 44)
      .attr("y", -rectH / 2 + 10)
      .attr("text-anchor", "start");

    // Avg span text (inside card, bottom-right)
    nodeEnter.append("text")
      .attr("class", "node-span")
      .attr("x", rectW / 2 - 24)
      .attr("dy", rectH / 2 - 3)
      .attr("text-anchor", "end");

    // "Was under" text for moved nodes (above card)
    nodeEnter.append("text")
      .attr("class", "node-was-under")
      .attr("dy", -rectH / 2 - 4)
      .attr("text-anchor", "middle");

    // Info icon circle
    nodeEnter.append("circle")
      .attr("class", "node-info-circle")
      .attr("cx", -rectW / 2 + 9)
      .attr("cy", -rectH / 2 + 9)
      .attr("r", 6);

    // Info icon "i" text
    nodeEnter.append("text")
      .attr("class", "node-info-text")
      .attr("x", -rectW / 2 + 9)
      .attr("y", -rectH / 2 + 12)
      .attr("text-anchor", "middle")
      .text("i");

    // ── Click handlers ──

    // Click anywhere on card → expand/collapse one level
    nodeEnter.on("click", function (e, d) {
      e.stopPropagation();
      toggleNodeOneLevel(d);
      updateChart(d);
    });

    // (i) icon intercepts click → open edit panel instead
    nodeEnter.each(function () {
      var el = d3.select(this);
      el.select(".node-info-circle").on("click", function (e, d) {
        e.stopPropagation();
        handleNodeClick(d);
      });
      el.select(".node-info-text").on("click", function (e, d) {
        e.stopPropagation();
        handleNodeClick(d);
      });
    });

    // Right-click on card → open edit panel
    nodeEnter.on("contextmenu", function (e, d) {
      e.preventDefault();
      e.stopPropagation();
      handleNodeClick(d);
    });

    // ── Tooltip handlers ──
    nodeEnter
      .on("mouseenter", function (e, d) {
        if (!d.data._isManager) return;
        var s = computeOrgStats([d.data]);
        var myDirectOpen = 0;
        var ch = d.data.children || [];
        for (var i = 0; i < ch.length; i++) {
          if (isOpenRole(ch[i].name)) myDirectOpen++;
        }
        tooltipEl.innerHTML =
          '<div class="tt-name">' + d.data.name + '</div>' +
          '<div class="tt-title">' + d.data.title + '</div>' +
          '<div class="tt-stats">' + s.total + ' Total · ' +
            s.associates + ' Associates · ' +
            s.managers + ' Managers</div>' +
          '<div class="tt-detail">' +
            s.managersOfManagers + ' Mgrs of Mgrs · ' +
            myDirectOpen + ' Direct Open · ' +
            s.openRoles + ' Org Open · ' +
            s.ratio + ' Assoc/Mgr · ' +
            s.avgSpan + ' Avg Span · ' +
            s.levels + ' Levels</div>';
        tooltipEl.classList.add("show");
      })
      .on("mousemove", function (e) {
        tooltipEl.style.left = (e.pageX + 14) + "px";
        tooltipEl.style.top = (e.pageY - 14) + "px";
      })
      .on("mouseleave", function () {
        tooltipEl.classList.remove("show");
      });

    // ── Update selection ──
    var nodeUpdate = nodeEnter.merge(node);

    nodeUpdate.transition(transition)
      .attr("transform", function (d) { return "translate(" + d.y + "," + d.x + ")"; });

    // Update rect colors based on depth and diff
    nodeUpdate.select(".node-rect")
      .attr("fill", function (d) {
        var change = changes.get(d.data.name);
        if (change) {
          if (change.removed) return "#2d1515";
          if (change.added) return "#152d1a";
          if (change.moved) return "#2d1f15";
          if (change.edited) return "#1f1a2d";
        }
        return levelFills[Math.min(d.depth, 5)];
      })
      .attr("stroke", function (d) {
        var change = changes.get(d.data.name);
        if (change) {
          if (change.removed) return "#fc8181";
          if (change.added) return "#38a169";
          if (change.moved) return "#dd6b20";
          if (change.edited) return "#805ad5";
        }
        return levelColors[Math.min(d.depth, 5)];
      })
      .attr("stroke-width", function (d) {
        return changes.has(d.data.name) ? 2 : 1.5;
      })
      .attr("stroke-dasharray", function (d) {
        var change = changes.get(d.data.name);
        return (change && change.removed) ? "6,3" : "none";
      });

    nodeUpdate.select(".node-name")
      .text(function (d) { return truncText(d.data.name, 26); })
      .attr("opacity", function (d) {
        var change = changes.get(d.data.name);
        return (change && change.removed) ? 0.4 : 1;
      });

    nodeUpdate.select(".node-title-text")
      .text(function (d) { return truncText(d.data.title, 32); })
      .attr("opacity", function (d) {
        var change = changes.get(d.data.name);
        return (change && change.removed) ? 0.4 : 1;
      });

    // Reports count
    nodeUpdate.select(".node-count")
      .text(function (d) {
        if (!d.data._isManager) return "";
        var allCh = d._allChildren || d.children || d._children || [];
        var count = allCh.length;
        if (d._children && !d.children) {
          return "+" + countAll(d.data) + " (" + count + " direct)";
        }
        return count + " report" + (count !== 1 ? "s" : "");
      })
      .attr("fill", function (d) { return levelColors[Math.min(d.depth, 5)]; });

    // Toggle icon
    nodeUpdate.select(".node-toggle")
      .text(function (d) {
        if (!d.data._isManager) return "";
        if (d.children) return "−";
        if ((d._children && d._children.length > 0) || (d._allChildren && d._allChildren.length > 0)) return "+";
        return "";
      })
      .attr("fill", function (d) {
        if (!d.data._isManager) return "transparent";
        if (!d.children && !d._children && !d._allChildren) return "transparent";
        return "#8b8f9a";
      });

    // Depth badges
    nodeUpdate.select(".depth-circle")
      .attr("fill", function (d) {
        var md = d.data._mgrDepth || 0;
        return md > 0 ? depthColors[Math.min(md, 6)] : "transparent";
      });

    nodeUpdate.select(".depth-badge")
      .text(function (d) {
        var md = d.data._mgrDepth || 0;
        return md > 0 ? md : "";
      });

    // Open roles badges
    nodeUpdate.select(".node-open-badge-rect")
      .attr("width", function (d) {
        if (!d.data._isManager) return 0;
        var directOpen = 0;
        var ch = d.data.children || [];
        for (var i = 0; i < ch.length; i++) {
          if (isOpenRole(ch[i].name)) directOpen++;
        }
        return directOpen > 0 ? 48 : 0;
      })
      .attr("fill", "rgba(240, 160, 60, 0.15)")
      .attr("stroke", "#f0a03c")
      .attr("stroke-width", 0.5);

    nodeUpdate.select(".node-open-badge-text")
      .text(function (d) {
        if (!d.data._isManager) return "";
        var directOpen = 0;
        var ch = d.data.children || [];
        for (var i = 0; i < ch.length; i++) {
          if (isOpenRole(ch[i].name)) directOpen++;
        }
        return directOpen > 0 ? directOpen + " open" : "";
      })
      .attr("fill", "#f0a03c");

    // Avg span text
    nodeUpdate.select(".node-span")
      .text(function (d) {
        if (!d.data._isManager) return "";
        var hc = countAll(d.data);
        var mgr = countManagersInData(d.data);
        if (mgr > 0) return "avg span " + ((hc - 1) / mgr).toFixed(1);
        return "";
      });

    // Was-under text
    nodeUpdate.select(".node-was-under")
      .text(function (d) {
        var change = changes.get(d.data.name);
        if (!change) return "";
        if (change.removed) return "← removed";
        if (change.added) return "← new";
        if (change.moved) return "← was under " + (change.originalManager || "no one");
        return "";
      })
      .attr("fill", function (d) {
        var change = changes.get(d.data.name);
        if (change && change.removed) return "#fc8181";
        if (change && change.added) return "#38a169";
        return "#dd6b20";
      });

    // ── Exit selection ──
    node.exit().transition(transition)
      .attr("transform", "translate(" + source.y + "," + source.x + ")")
      .remove();

    // Store positions for next transition
    nodes.forEach(function (d) { d.x0 = d.x; d.y0 = d.y; });

    // Highlight selected
    highlightSelectedNode();
  }

  function handleNodeClick(d) {
    if (selectedPerson === d.data.name) {
      if (panelHasUnsavedChanges()) {
        if (!confirm("You have unsaved changes. Discard them?")) return;
      }
      closePanel();
      return;
    }
    if (selectedPerson && panelHasUnsavedChanges()) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    openPanel(d.data.name);
  }

  // ── Toggle / Expand / Collapse (D3 style) ──

  function toggleNodeOneLevel(d) {
    if (d.children) {
      d._children = d._allChildren || d.children;
      d.children = null;
      d._allChildren = null;
      d._expandMode = null;
    } else if (d._children || d._allChildren) {
      var all = d._allChildren || d._children;
      d.children = all;
      d._children = null;
      d._allChildren = null;
      d._expandMode = "all";
      // Collapse grandchildren so only one level opens
      for (var i = 0; i < d.children.length; i++) {
        var child = d.children[i];
        if (child.children && child.children.length > 0) {
          child._children = child._allChildren || child.children;
          child.children = null;
          child._allChildren = null;
          child._expandMode = null;
        }
      }
    }
  }

  function isManagerNode(d) {
    return (d.children && d.children.length > 0) ||
           (d._children && d._children.length > 0) ||
           (d._allChildren && d._allChildren.length > 0);
  }

  function toggleNodeAll(d) {
    if (d.children) {
      // Collapse
      d._children = d._allChildren || d.children;
      d.children = null;
      d._allChildren = null;
      d._expandMode = null;
    } else if (d._children || d._allChildren) {
      // Expand all
      d.children = d._allChildren || d._children;
      d._children = null;
      d._allChildren = null;
      d._expandMode = "all";
    }
  }

  function toggleNodeManagers(d) {
    if (d.children) {
      // Collapse
      d._children = d._allChildren || d.children;
      d.children = null;
      d._allChildren = null;
      d._expandMode = null;
      return;
    }

    var all = d._allChildren || d._children;
    if (!all) return;

    var managerChildren = all.filter(function (c) { return isManagerNode(c); });
    if (managerChildren.length === 0) return;

    d._allChildren = all;
    d.children = managerChildren;
    d._children = null;
    d._expandMode = "managers";

    // Recursively expand managers in children
    for (var i = 0; i < d.children.length; i++) {
      var child = d.children[i];
      if (child._children || child._allChildren) {
        var childAll = child._allChildren || child._children;
        var childMgrs = childAll.filter(function (c) { return isManagerNode(c); });
        if (childMgrs.length > 0) {
          child._allChildren = childAll;
          child.children = childMgrs;
          child._children = null;
          child._expandMode = "managers";
        }
      }
    }
  }

  function walkAll(d, fn) {
    fn(d);
    if (d.children) d.children.forEach(function (c) { walkAll(c, fn); });
    if (d._children) d._children.forEach(function (c) { walkAll(c, fn); });
    if (d._allChildren) d._allChildren.forEach(function (c) { walkAll(c, fn); });
  }

  function expandAll() {
    if (!d3Root) return;
    walkAll(d3Root, function (d) {
      if (d._children || d._allChildren) {
        d.children = d._allChildren || d._children;
        d._children = null;
        d._allChildren = null;
        d._expandMode = "all";
      }
    });
    updateChart(d3Root);
    setTimeout(fitToView, 450);
  }

  function collapseAll() {
    if (!d3Root) return;
    walkAll(d3Root, function (d) {
      if (d.depth > 0 && (d.children || d._allChildren)) {
        d._children = d._allChildren || d.children;
        d.children = null;
        d._allChildren = null;
        d._expandMode = null;
      }
    });
    updateChart(d3Root);
    setTimeout(fitToView, 450);
  }

  function expandManagers() {
    if (!d3Root) return;
    // First collapse all
    walkAll(d3Root, function (d) {
      if (d.depth > 0 && (d.children || d._allChildren)) {
        d._children = d._allChildren || d.children;
        d.children = null;
        d._allChildren = null;
      }
    });

    // Then expand only managers
    function expandMgrs(d) {
      var all = d._children;
      if (!all) return;

      var managerChildren = all.filter(function (c) { return isManagerNode(c); });
      if (managerChildren.length === 0) return;

      d._allChildren = all;
      d.children = managerChildren;
      d._children = null;
      d._expandMode = "managers";

      for (var i = 0; i < d.children.length; i++) {
        expandMgrs(d.children[i]);
      }
    }

    // Expand root's children (or virtual root's children)
    if (d3Root.children) {
      d3Root.children.forEach(function (c) { expandMgrs(c); });
    } else if (d3Root._children) {
      d3Root.children = d3Root._children;
      d3Root._children = null;
      d3Root.children.forEach(function (c) { expandMgrs(c); });
    }

    updateChart(d3Root);
    setTimeout(fitToView, 450);
  }

  function expandToDepth(maxDepth) {
    if (!d3Root) return;
    walkAll(d3Root, function (d) {
      if (d.depth < maxDepth) {
        if (d._children || d._allChildren) {
          d.children = d._allChildren || d._children;
          d._children = null;
          d._allChildren = null;
        }
      } else {
        if (d.children && d.children.length > 0) {
          d._children = d._allChildren || d.children;
          d.children = null;
          d._allChildren = null;
          d._expandMode = null;
        }
      }
    });
  }

  function getDefaultDepth() {
    var w = window.innerWidth;
    if (w > 1024) return 3;
    if (w >= 768) return 2;
    return 1;
  }

  // ── Fit to View ──

  function fitToView() {
    if (!d3Root || !svg) return;
    var nodes = d3Root.descendants().filter(function (d) {
      return d.x !== undefined && d.data.name !== "__root__";
    });
    if (nodes.length === 0) return;

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (d) {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
      if (d.y < minY) minY = d.y;
      if (d.y > maxY) maxY = d.y;
    });

    var svgEl = document.getElementById("tree-svg");
    var width = svgEl.clientWidth;
    var height = svgEl.clientHeight;
    var pad = 120;

    var treeW = (maxY - minY) + rectW + 160;
    var treeH = (maxX - minX) + rectH + 80;
    var vw = width - pad * 2;
    var vh = height - pad * 2;
    var scale = Math.min(vw / treeW, vh / treeH, 1.2);
    var cx = (minY + maxY) / 2;
    var cy = (minX + maxX) / 2;
    var tx = width / 2 - cx * scale;
    var ty = height / 2 - cy * scale;

    svg.transition().duration(500)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  // ── Rebuild and Render ──

  function getCollapsedNames() {
    if (!d3Root) return new Set();
    var collapsed = new Set();
    walkAll(d3Root, function (d) {
      if (d._children && !d.children) {
        collapsed.add(d.data.name);
      }
    });
    return collapsed;
  }

  function rebuildAndRender() {
    var roots = buildTree(currentPeople);

    if (emptyState) emptyState.style.display = "none";

    // Wrap multiple roots under a virtual root
    var treeData;
    if (roots.length === 1) {
      treeData = roots[0];
    } else {
      treeData = { name: "__root__", title: "", manager: "", children: roots };
    }

    // Pre-compute manager info on tree data
    function annotate(node) {
      node._isManager = node.children.length > 0;
      node._mgrDepth = mgrDepth(node);
      for (var i = 0; i < node.children.length; i++) {
        annotate(node.children[i]);
      }
    }
    annotate(treeData);

    // Save expand state
    var wasCollapsed = getCollapsedNames();

    d3Root = d3.hierarchy(treeData);

    // Assign stable IDs
    nodeIdCounter = 0;
    d3Root.descendants().forEach(function (d) {
      d.id = ++nodeIdCounter;
    });

    d3Root.x0 = 0;
    d3Root.y0 = 0;

    // Apply collapse state
    if (wasCollapsed.size > 0) {
      d3Root.descendants().forEach(function (d) {
        if (d.children && d.children.length > 0 && wasCollapsed.has(d.data.name)) {
          d._children = d.children;
          d.children = null;
        }
      });
    } else {
      // First load: apply default expansion
      if (currentViewMode === "expand") {
        // Leave everything expanded
      } else if (currentViewMode === "managers") {
        // Will be applied after updateChart
      } else if (currentViewMode === "collapse") {
        d3Root.descendants().forEach(function (d) {
          if (d.depth > 0 && d.children && d.children.length > 0) {
            d._children = d.children;
            d.children = null;
          }
        });
      } else {
        expandToDepth(1);
      }
    }

    updateChart(d3Root);
    updateStatsBar(roots);
    updateToolbarButtons();
    updateLegend();

    if (currentViewMode === "managers" && wasCollapsed.size === 0) {
      expandManagers();
    } else {
      setTimeout(fitToView, 100);
    }
  }

  // ── Search ──

  searchInput.addEventListener("input", function () {
    if (!d3Root) return;
    var q = searchInput.value.toLowerCase().trim();

    d3.selectAll(".node-group").classed("node-highlight", false);

    if (!q) {
      updateChart(d3Root);
      setTimeout(fitToView, 450);
      return;
    }

    // Auto-expand ancestors of matches
    walkAll(d3Root, function (node) {
      if (node.data && node.data.name && node.data.name.toLowerCase().includes(q)) {
        var p = node.parent;
        while (p) {
          if (p._children) {
            p.children = p._allChildren || p._children;
            p._children = null;
            p._allChildren = null;
          }
          p = p.parent;
        }
      }
    });

    updateChart(d3Root);

    setTimeout(function () {
      d3.selectAll(".node-group").classed("node-highlight", function (d) {
        return d.data.name.toLowerCase().includes(q);
      });
      fitToView();
    }, 450);
  });

  // ── Error display ──

  function showError(message) {
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.textContent = message;
      emptyState.className = "error-state";
    }
    statsBar.hidden = true;
    if (g) g.selectAll("*").remove();
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
      currentViewMode = "default";
      rebuildAndRender();
    }
  }

  function loadPlanCSVText(text) {
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
      var planPeople = addMissingManagers(result.people);
      var planNames = new Set(planPeople.map(function (p) { return p.name; }));

      // People in original but not in plan are "removed"
      var removed = originalPeople.filter(function (p) {
        return !planNames.has(p.name);
      }).map(function (p) {
        return { name: p.name, title: p.title, manager: p.manager, _removed: true };
      });

      currentPeople = planPeople.map(function (p) {
        return { name: p.name, title: p.title, manager: p.manager };
      }).concat(removed);

      selectedPerson = null;
      currentViewMode = "default";
      rebuildAndRender();
    }
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

  planBtn.addEventListener("click", function () {
    planFileInput.click();
  });

  planFileInput.addEventListener("change", function () {
    var file = planFileInput.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      showError("Please upload a CSV file");
      planFileInput.value = "";
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      loadPlanCSVText(e.target.result);
      planFileInput.value = "";
    };

    reader.readAsText(file);
  });

  // Auto-load from ?file= and ?plan= URL parameters
  var params = new URLSearchParams(window.location.search);
  var autoFile = params.get("file");
  var autoPlan = params.get("plan");
  if (autoFile) {
    fetch(autoFile)
      .then(function (r) { return r.text(); })
      .then(function (text) {
        loadCSVText(text);
        if (autoPlan) {
          return fetch(autoPlan)
            .then(function (r) { return r.text(); })
            .then(loadPlanCSVText)
            .catch(function () { showError("Could not load plan: " + autoPlan); });
        }
      })
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
    if (e.key === "Escape") {
      if (!ldapModal.hidden) {
        closeLdapModal();
        return;
      }
      if (selectedPerson) {
        if (panelHasUnsavedChanges()) {
          if (!confirm("You have unsaved changes. Discard them?")) return;
        }
        closePanel();
      }
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
        var updated = { name: p.name, title: newTitle, manager: newManager };
        if (p._removed) updated._removed = true;
        return updated;
      }
      var copy = { name: p.name, title: p.title, manager: p.manager };
      if (p._removed) copy._removed = true;
      return copy;
    });

    var savedName = selectedPerson;
    rebuildAndRender();
    openPanel(savedName);
  });

  saveCsvBtn.addEventListener("click", function () {
    var lines = ["Name,Title,Manager"];

    for (var i = 0; i < currentPeople.length; i++) {
      var p = currentPeople[i];
      if (p._removed) continue;
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
    currentViewMode = "default";
    rebuildAndRender();
  });

  // ── LDAP Import ──

  function openLdapModal() {
    ldapUidInput.value = "";
    ldapDepthInput.value = "";
    ldapStatus.hidden = true;
    ldapStatus.className = "ldap-status";
    ldapImportBtn.disabled = false;
    ldapModal.hidden = false;
    ldapUidInput.focus();
  }

  function closeLdapModal() {
    ldapModal.hidden = true;
  }

  function setLdapStatus(msg, type) {
    ldapStatus.textContent = msg;
    ldapStatus.className = "ldap-status " + type;
    ldapStatus.hidden = false;
  }

  function doLdapImport() {
    var uid = ldapUidInput.value.trim();
    if (!uid) {
      setLdapStatus("Please enter a UID or name.", "error");
      return;
    }

    var depth = ldapDepthInput.value ? parseInt(ldapDepthInput.value, 10) : 999;
    ldapImportBtn.disabled = true;
    setLdapStatus("Fetching org chart from LDAP... This may take a few minutes for large orgs.", "loading");

    fetch("/api/ldap-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: uid, depth: depth })
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) { throw new Error(err.error || "Request failed"); });
        }
        return res.text();
      })
      .then(function (csvText) {
        closeLdapModal();
        loadCSVText(csvText);
      })
      .catch(function (err) {
        setLdapStatus(err.message, "error");
        ldapImportBtn.disabled = false;
      });
  }

  ldapBtn.addEventListener("click", function () {
    if (hasChanges()) {
      if (!confirm("You have unsaved changes. Import new data?")) return;
    }
    openLdapModal();
  });

  ldapImportBtn.addEventListener("click", doLdapImport);
  ldapCancelBtn.addEventListener("click", closeLdapModal);
  ldapModalClose.addEventListener("click", closeLdapModal);

  ldapModal.addEventListener("click", function (e) {
    if (e.target === ldapModal) closeLdapModal();
  });

  ldapUidInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") doLdapImport();
  });

  // ── Initialize ──
  initD3();

})();
