import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeMarker,
  type FinalConnectionState,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LayoutGrid, Plus } from "lucide-react";
import { FlowInspector, type FlowSelection } from "@/components/tools/mermaid-draw/FlowInspector";
import { FlowNodeView, type FlowNodeType } from "@/components/tools/mermaid-draw/FlowNodeView";
import {
  FLOW_COLORS,
  freeSpot,
  nextNodeId,
  nodeSize,
  placeNodes,
  SHAPE_MENU,
  shapeLabel,
  type Direction,
  type FlowEdge,
  type Flowchart,
  type FlowNode,
  type Point,
  type Shape,
} from "@/utils/mermaid-flowchart";

const NODE_TYPES = { flow: FlowNodeView };

const DIRECTIONS: { id: Direction; label: string }[] = [
  { id: "TD", label: "Top to bottom" },
  { id: "BT", label: "Bottom to top" },
  { id: "LR", label: "Left to right" },
  { id: "RL", label: "Right to left" },
];

type Side = "top" | "right" | "bottom" | "left";

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** The sides that a link leaves and enters, from the centers of the two nodes. */
function linkSides(from: Point, to: Point): [Side, Side] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return ["right", "top"];
  const side: Side = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? "bottom" : "top") : dx > 0 ? "right" : "left";
  return [side, OPPOSITE[side]];
}

const newEdge = (from: string, to: string): FlowEdge => ({ from, to, label: "", line: "solid", head: "arrow", both: false, length: 0 });

export interface FlowCanvasProps {
  chart: Flowchart;
  /** True when the text has an error, so the canvas shows an older flowchart. */
  stale: boolean;
  theme: "light" | "dark";
  positions: Record<string, Point>;
  onPositions: (positions: Record<string, Point>) => void;
  /** Writes the changed flowchart to the text. Returns false when the text cannot change now. */
  onChange: (chart: Flowchart) => boolean;
  /** Lays out all nodes again. */
  onRelayout: () => void;
}

/** The Draw mode canvas: drag nodes, draw links between handles, and edit the selection. */
export function FlowCanvas({ chart, stale, theme, positions, onPositions, onChange, onRelayout }: FlowCanvasProps) {
  const colors = FLOW_COLORS[theme];
  const [selection, setSelection] = useState<FlowSelection>(null);
  const [shape, setShape] = useState<Shape>("rect");
  const [nodes, setNodes] = useState<FlowNodeType[]>([]);
  const flow = useRef<ReactFlowInstance<FlowNodeType, Edge> | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  /** A new node to bring into view after it renders. */
  const pendingFocus = useRef<string | null>(null);

  const placed = useMemo(() => placeNodes(chart, positions), [chart, positions]);

  // Keep the places of new nodes, so they do not move when other nodes come
  useEffect(() => {
    if (Object.keys(placed).some((id) => !positions[id])) onPositions({ ...positions, ...placed });
  }, [placed, positions, onPositions]);

  useEffect(() => {
    setNodes((current) => {
      const measured = new Map(current.map((node) => [node.id, node.measured]));
      return chart.nodes.map((node) => ({ id: node.id, type: "flow", position: placed[node.id], measured: measured.get(node.id), data: { node, colors } }));
    });
  }, [chart, placed, colors]);

  useEffect(() => {
    const id = pendingFocus.current;
    const instance = flow.current;
    const node = nodes.find((item) => item.id === id);
    if (!node || !instance || !wrapper.current) return;
    pendingFocus.current = null;
    const box = wrapper.current.getBoundingClientRect();
    const size = nodeSize(node.data.node);
    const corner = instance.flowToScreenPosition(node.position);
    const end = instance.flowToScreenPosition({ x: node.position.x + size.width, y: node.position.y + size.height });
    if (corner.x >= box.left && corner.y >= box.top && end.x <= box.right && end.y <= box.bottom) return;
    // Pan to the node and keep the zoom
    const zoom = instance.getZoom();
    void instance.fitView({ nodes: [{ id: node.id }], minZoom: zoom, maxZoom: zoom, duration: 200 });
  }, [nodes]);

  const shownNodes = useMemo(
    () =>
      nodes.map((node) => {
        const selected = selection?.kind === "node" && selection.id === node.id;
        return Boolean(node.selected) === selected ? node : { ...node, selected };
      }),
    [nodes, selection],
  );

  const edges = useMemo<Edge[]>(() => {
    const centers = new Map(
      nodes.map((node) => {
        const size = node.measured?.width ? { width: node.measured.width, height: node.measured.height ?? 0 } : nodeSize(node.data.node);
        return [node.id, { x: node.position.x + size.width / 2, y: node.position.y + size.height / 2 }];
      }),
    );
    return chart.edges.flatMap((edge, index) => {
      const from = centers.get(edge.from);
      const to = centers.get(edge.to);
      if (!from || !to) return [];
      const [sourceHandle, targetHandle] = linkSides(from, to);
      const marker = (): EdgeMarker | string | undefined => {
        // Marker sizes grow with the stroke width, so a thick link gets a smaller marker
        const size = edge.line === "thick" ? 8 : 18;
        if (edge.head === "arrow") return { type: MarkerType.ArrowClosed, color: colors.line, width: size, height: size };
        if (edge.head === "none") return undefined;
        return `flow-${edge.head}-${theme}`;
      };
      return [
        {
          id: `e-${index}`,
          source: edge.from,
          target: edge.to,
          sourceHandle,
          targetHandle,
          label: edge.label || undefined,
          selected: selection?.kind === "edge" && selection.index === index,
          markerEnd: marker(),
          markerStart: edge.both ? marker() : undefined,
          style: {
            stroke: colors.line,
            strokeWidth: edge.line === "thick" ? 3.5 : 1.5,
            strokeDasharray: edge.line === "dotted" ? "4 4" : undefined,
          },
          labelStyle: { fill: colors.text, fontSize: 12 },
          labelBgStyle: { fill: colors.label },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 3,
          interactionWidth: 16,
        },
      ];
    });
  }, [nodes, chart.edges, colors, theme, selection]);

  const update = (next: Partial<Flowchart>) => onChange({ ...chart, ...next });

  const changeNode = (id: string, change: Partial<FlowNode>) => update({ nodes: chart.nodes.map((node) => (node.id === id ? { ...node, ...change } : node)) });

  const changeEdge = (index: number, change: Partial<FlowEdge>) =>
    update({ edges: chart.edges.map((edge, at) => (at === index ? { ...edge, ...change } : edge)) });

  const remove = (nodeIds: string[], edgeIndexes: number[]) => {
    const gone = new Set(nodeIds);
    const edgesGone = new Set(edgeIndexes);
    const ok = update({
      nodes: chart.nodes.filter((node) => !gone.has(node.id)),
      edges: chart.edges.filter((edge, index) => !edgesGone.has(index) && !gone.has(edge.from) && !gone.has(edge.to)),
    });
    if (ok) setSelection(null);
  };

  /**
   * Adds a node at a point, or at the middle of the view, in free space. With `from`, it also adds
   * a link from that node.
   */
  const addNode = (at?: Point, from?: string) => {
    const id = nextNodeId(chart);
    const node: FlowNode = { id, label: "New node", shape };
    const size = nodeSize(node);
    let point = at;
    if (!point && flow.current && wrapper.current) {
      const box = wrapper.current.getBoundingClientRect();
      point = flow.current.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    }
    if (point && Number.isFinite(point.x)) {
      const corner = { x: Math.round(point.x - size.width / 2), y: Math.round(point.y - size.height / 2) };
      onPositions({ ...positions, [id]: freeSpot(chart, placed, corner, size) });
    }
    const edges = from ? [...chart.edges, newEdge(from, id)] : chart.edges;
    if (update({ nodes: [...chart.nodes, node], edges })) {
      setSelection({ kind: "node", id });
      pendingFocus.current = id;
    }
  };

  const addAfter = (fromId: string) => {
    const from = chart.nodes.find((node) => node.id === fromId);
    if (!from) return;
    const id = nextNodeId(chart);
    if (update({ nodes: [...chart.nodes, { id, label: "New node", shape: "rect" }], edges: [...chart.edges, newEdge(fromId, id)] })) {
      setSelection({ kind: "node", id });
      pendingFocus.current = id;
    }
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    update({ edges: [...chart.edges, newEdge(connection.source, connection.target)] });
  };

  /**
   * A link that ends on a node away from its handles still links to that node. A link that ends on
   * the empty canvas adds a node there.
   */
  const onConnectEnd = (event: globalThis.MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return;
    const { clientX, clientY } = "changedTouches" in event ? event.changedTouches[0] : event;
    const target = document.elementFromPoint(clientX, clientY);
    const nodeId = target?.closest(".react-flow__node")?.getAttribute("data-id");
    // A click on a handle ends on its own node. That is not a link.
    if (nodeId === state.fromNode.id) return;
    if (nodeId) {
      update({ edges: [...chart.edges, newEdge(state.fromNode.id, nodeId)] });
    } else if (target?.closest(".react-flow__pane") && flow.current) {
      addNode(flow.current.screenToFlowPosition({ x: clientX, y: clientY }), state.fromNode.id);
    }
  };

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNodeType>[]) =>
      setNodes((current) =>
        applyNodeChanges(
          changes.filter((change) => change.type !== "remove"),
          current,
        ),
      ),
    [],
  );

  const onNodeDragStop = (_event: unknown, _node: FlowNodeType, dragged: FlowNodeType[]) => {
    const next = { ...placed };
    for (const node of dragged) next[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
    onPositions(next);
  };

  const onPaneClick = (event: MouseEvent) => {
    setSelection(null);
    // A double click on the empty canvas adds a node there
    if (event.detail === 2 && flow.current) addNode(flow.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const direction = chart.direction === "TB" ? "TD" : chart.direction;

  return (
    <div className="flow-draw">
      <div className="flow-tools" role="toolbar" aria-label="Canvas tools">
        <select aria-label="New node shape" className="db-select" value={shape} onChange={(event) => setShape(event.target.value as Shape)}>
          {SHAPE_MENU.map((item) => (
            <option key={item} value={item}>
              {shapeLabel(item)}
            </option>
          ))}
        </select>
        <button type="button" className="toolbar-text-button" onClick={() => addNode()}>
          <Plus size={14} aria-hidden="true" />
          Add node
        </button>
        <select aria-label="Direction" className="db-select" value={direction} onChange={(event) => update({ direction: event.target.value as Direction })}>
          {DIRECTIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button type="button" className="toolbar-text-button" onClick={onRelayout} disabled={chart.nodes.length === 0}>
          <LayoutGrid size={14} aria-hidden="true" />
          Auto-layout
        </button>
        <span className="flow-tools-hint">Drag from a dot on a node to link it</span>
      </div>
      <div ref={wrapper} className="db-canvas flow-canvas" style={{ background: colors.background, opacity: stale ? 0.6 : undefined }}>
        <svg className="flow-markers" aria-hidden="true">
          <defs>
            {(["light", "dark"] as const).map((name) => (
              <g key={name}>
                <marker id={`flow-circle-${name}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                  <circle cx="5" cy="5" r="4" fill={FLOW_COLORS[name].line} />
                </marker>
                <marker id={`flow-cross-${name}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
                  <path d="M1,1 L9,9 M9,1 L1,9" stroke={FLOW_COLORS[name].line} strokeWidth="2" />
                </marker>
              </g>
            ))}
          </defs>
        </svg>
        <ReactFlow<FlowNodeType, Edge>
          nodes={shownNodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          colorMode={theme}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={["Backspace", "Delete"]}
          zoomOnDoubleClick={false}
          minZoom={0.02}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.25 }}
          proOptions={{ hideAttribution: true }}
          onInit={(instance) => {
            flow.current = instance;
          }}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_event, node) => setSelection({ kind: "node", id: node.id })}
          onEdgeClick={(_event, edge) => setSelection({ kind: "edge", index: Number(edge.id.slice(2)) })}
          onPaneClick={onPaneClick}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          connectionRadius={30}
          onDelete={({ nodes: deleted, edges: deletedEdges }) =>
            remove(
              deleted.map((node) => node.id),
              deletedEdges.map((edge) => Number(edge.id.slice(2))),
            )
          }
        >
          <Background color={colors.grid} gap={20} />
          <Controls showInteractive={false} />
          {selection && (
            <Panel position="top-right">
              <FlowInspector
                chart={chart}
                selection={selection}
                onNode={changeNode}
                onEdge={changeEdge}
                onAddAfter={addAfter}
                onDelete={(item) => (item.kind === "node" ? remove([item.id], []) : remove([], [item.index]))}
                onClose={() => setSelection(null)}
              />
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}
