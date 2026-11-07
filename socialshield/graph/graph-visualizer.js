/**
 * SocialShield — Interactive Subgraph Visualizer
 * Renders an interactive radial SVG graph in the side panel.
 * Rings represent degrees of separation (0 = target, 1 = direct, 2 = 2nd degree, 3 = 3rd degree).
 */

export class GraphVisualizer {
  /**
   * @param {HTMLElement} containerElement
   * @param {object} [options]
   */
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = {
      width: options.width || 320,
      height: options.height || 260,
      maxNodesPerRing: options.maxNodesPerRing || 20,
      onNodeClick: options.onNodeClick || null,
      ...options
    };
    this.svg = null;
  }

  /**
   * Render the subgraph for an analysis result.
   * @param {object} analysisResult - BFS result containing startAccount and accounts
   */
  render(analysisResult) {
    this.container.innerHTML = '';
    if (!analysisResult || !analysisResult.success || !analysisResult.startAccount) {
      this.container.innerHTML = '<div class="ss-empty"><p>No graph to visualize</p></div>';
      return;
    }

    const { startAccount, accounts } = analysisResult;
    const { width, height, maxNodesPerRing } = this.options;
    const cx = width / 2;
    const cy = height / 2;

    // Group accounts by degree
    const rings = { 1: [], 2: [], 3: [] };
    for (const a of accounts) {
      if (rings[a.degree]) rings[a.degree].push(a);
    }

    // Limit nodes rendered per ring for clean display
    const visibleByRing = {
      1: rings[1].slice(0, maxNodesPerRing),
      2: rings[2].slice(0, maxNodesPerRing),
      3: rings[3].slice(0, maxNodesPerRing)
    };

    // Radii for concentric circles
    const radii = {
      0: 0,
      1: Math.min(width, height) * 0.22,
      2: Math.min(width, height) * 0.35,
      3: Math.min(width, height) * 0.45
    };

    // Compute node coordinates
    const nodes = [];
    // Target node at center
    nodes.push({
      id: startAccount.id,
      username: startAccount.username,
      degree: 0,
      x: cx,
      y: cy,
      isTarget: true
    });

    for (const degree of [1, 2, 3]) {
      const ringAccounts = visibleByRing[degree];
      const count = ringAccounts.length;
      const r = radii[degree];
      const angleStep = (2 * Math.PI) / (count || 1);
      // Slight angular offset per ring to prevent radial alignment
      const offset = (degree * Math.PI) / 6;

      ringAccounts.forEach((acc, i) => {
        const angle = i * angleStep + offset;
        nodes.push({
          id: acc.id,
          username: acc.username,
          degree,
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
          evidence: acc.evidence,
          status: acc.status
        });
      });
    }

    // Build SVG elements
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'ss-subgraph-svg');
    svg.style.width = '100%';
    svg.style.height = `${height}px`;
    svg.style.display = 'block';

    // 1. Concentric guide rings
    const guidesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    guidesGroup.setAttribute('class', 'ss-graph-guides');
    for (const d of [1, 2, 3]) {
      if (rings[d].length === 0) continue;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', radii[d]);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', '#e4e6ea');
      circle.setAttribute('stroke-dasharray', '3 3');
      circle.setAttribute('stroke-width', '1');
      guidesGroup.appendChild(circle);
    }
    svg.appendChild(guidesGroup);

    // 2. Edges from center to degree 1, and intermediate edges
    const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgesGroup.setAttribute('class', 'ss-graph-edges');

    // Connect target to degree 1
    const d1Nodes = nodes.filter(n => n.degree === 1);
    for (const d1 of d1Nodes) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', cx);
      line.setAttribute('y1', cy);
      line.setAttribute('x2', d1.x);
      line.setAttribute('y2', d1.y);
      line.setAttribute('stroke', '#d0d4dc');
      line.setAttribute('stroke-width', '1.2');
      edgesGroup.appendChild(line);
    }

    // Connect degree 2 to nearest degree 1
    const d2Nodes = nodes.filter(n => n.degree === 2);
    for (const d2 of d2Nodes) {
      const nearestD1 = this._findNearest(d2, d1Nodes) || { x: cx, y: cy };
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', nearestD1.x);
      line.setAttribute('y1', nearestD1.y);
      line.setAttribute('x2', d2.x);
      line.setAttribute('y2', d2.y);
      line.setAttribute('stroke', '#e4e6ea');
      line.setAttribute('stroke-width', '0.9');
      edgesGroup.appendChild(line);
    }

    // Connect degree 3 to nearest degree 2
    const d3Nodes = nodes.filter(n => n.degree === 3);
    for (const d3 of d3Nodes) {
      const nearestD2 = this._findNearest(d3, d2Nodes) || { x: cx, y: cy };
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', nearestD2.x);
      line.setAttribute('y1', nearestD2.y);
      line.setAttribute('x2', d3.x);
      line.setAttribute('y2', d3.y);
      line.setAttribute('stroke', '#f0f1f3');
      line.setAttribute('stroke-width', '0.7');
      edgesGroup.appendChild(line);
    }
    svg.appendChild(edgesGroup);

    // 3. Nodes
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodesGroup.setAttribute('class', 'ss-graph-nodes');

    const colors = {
      0: '#4f6df5', // Target: Primary blue
      1: '#4f6df5', // Degree 1: Blue
      2: '#e89c30', // Degree 2: Amber
      3: '#e8424e'  // Degree 3: Red
    };

    const nodeSizes = { 0: 8, 1: 5.5, 2: 4.5, 3: 3.5 };

    for (const node of nodes) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'ss-graph-node');
      g.style.cursor = 'pointer';

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', nodeSizes[node.degree]);
      circle.setAttribute('fill', colors[node.degree]);
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', node.degree === 0 ? '2' : '1.5');

      // Native SVG tooltip
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      const tooltipText = node.degree === 0
        ? `Target: @${node.username}`
        : `@${node.username} (${node.degree}° degree)`;
      title.textContent = tooltipText;
      g.appendChild(title);
      g.appendChild(circle);

      // Label for target node
      if (node.degree === 0) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 16);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '9');
        text.setAttribute('font-weight', '600');
        text.setAttribute('fill', '#3a3d42');
        text.textContent = `@${node.username}`;
        g.appendChild(text);
      }

      // Click handler
      if (this.options.onNodeClick) {
        g.addEventListener('click', () => this.options.onNodeClick(node));
      }

      nodesGroup.appendChild(g);
    }
    svg.appendChild(nodesGroup);

    this.container.appendChild(svg);
    this.svg = svg;
  }

  _findNearest(node, candidates) {
    if (!candidates || candidates.length === 0) return null;
    let minD = Infinity;
    let best = null;
    for (const c of candidates) {
      const d = Math.hypot(node.x - c.x, node.y - c.y);
      if (d < minD) {
        minD = d;
        best = c;
      }
    }
    return best;
  }
}

