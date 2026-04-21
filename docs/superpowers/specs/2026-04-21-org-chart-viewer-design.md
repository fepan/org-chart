# Org Chart Viewer — Design Spec

## Overview

A single-page vanilla web app that takes a CSV file (columns: Name, Title, Manager) and renders a dynamic, responsive org chart with expand/collapse navigation.

## Tech Stack

- Vanilla HTML, CSS, JavaScript — no frameworks, no build step
- Three files: `index.html`, `style.css`, `app.js`
- Zero dependencies

## File Structure

```
org-chart/
├── index.html   — page structure, upload UI
├── style.css    — all styling and responsive breakpoints
└── app.js       — CSV parsing, tree building, rendering
```

## CSV Format

Expected columns (first row is headers):

```
Name,Title,Manager
Jane Smith,CEO,
Bob Lee,CTO,Jane Smith
Carol Martinez,VP Sales,Jane Smith
Alice Wang,Sr Engineer,Bob Lee
Dan Kim,Engineer,Bob Lee
```

- **Name**: person's full name (used as unique identifier)
- **Title**: job title
- **Manager**: the Name of this person's manager; empty = root node

## Data Flow

1. User uploads CSV via file picker button or drag-and-drop
2. `FileReader` reads file as text
3. Parser: split on newlines, split on commas, trim whitespace, map to {name, title, manager}
4. Tree builder: create a Map of name → node, then link children to parents via manager field
5. Nodes whose manager is empty or doesn't match any name become root nodes
6. Renderer walks the tree recursively, creating nested DOM elements
7. Direct report counts computed from each node's children array length

## Page Layout

### Top Bar
- Left: app title "Org Chart"
- Right: "Upload CSV" button, "Expand All" button, "Collapse All" button
- Fixed at top of page

### Chart Area
- Below the top bar, fills remaining viewport
- Empty state before upload: centered text "Upload a CSV to get started"
- After upload: org chart rendered as a tree

## Node Card Design

### Manager nodes (has direct reports)
- White background, blue left border (2px solid #4299e1)
- Name: bold, 14-15px, dark gray (#2d3748)
- Title: blue (#4299e1), 12px
- Divider line below title
- "X direct reports" in gray (#a0aec0), 11px
- Expand/collapse indicator: `+` when collapsed, `−` when expanded
- Cursor: pointer (clickable)

### Leaf nodes (no direct reports)
- White background, gray border (1px solid #e2e8f0)
- Name: bold, 14-15px, dark gray
- Title: gray (#718096), 12px
- No report count line
- Not clickable

## Tree Rendering

- Nested HTML `<div>` elements with CSS flexbox for horizontal layout
- Connector lines drawn with CSS `::before`/`::after` pseudo-elements
- Vertical line from parent down, horizontal line across to each child
- Children container wraps when too wide

## Expand / Collapse

- Clicking a manager node toggles visibility of its children container
- "Expand All" button: shows all levels
- "Collapse All" button: shows only root nodes
- Default expansion on load varies by screen size (see Responsiveness)

## Responsiveness

### Desktop (>1024px)
- Horizontal tree layout
- Root + 2 levels expanded by default on load

### Tablet (768–1024px)
- Horizontal tree layout
- Root + 1 level expanded by default

### Mobile (<768px)
- Vertical/stacked layout — children appear below parent, indented
- Only root expanded by default
- Node cards go full-width

## Error Handling

- Missing required columns: inline error listing expected columns (Name, Title, Manager)
- No valid data rows: "No valid data found in CSV"
- Malformed rows (wrong column count): silently skipped
- Non-CSV file: show "Please upload a CSV file"

## Accessibility

- Expand/collapse via keyboard (Enter/Space on focused node)
- `aria-expanded` attribute on collapsible nodes
- Focus visible outline on nodes
- Semantic heading for app title
