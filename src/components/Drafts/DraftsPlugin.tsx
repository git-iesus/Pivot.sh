import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  DraftsState,
  DraftTool,
  DraftElement,
  DraftConnector,
  DraftShapeKind,
  DraftAnchorSide,
  DraftTextStyle,
} from '../../types/project';
import { uploadDraftImage, resolveDraftImageUrl } from '../../services/attachmentsService';
import {
  MousePointer2,
  Hand,
  Type,
  StickyNote,
  Shapes,
  Square,
  Triangle,
  Circle,
  MoveUpRight,
  ImagePlus,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Copy,
  BringToFront,
  SendToBack,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowRight,
  ArrowLeft,
  Minus,
  Plus,
  Loader2,
  Sparkles,
} from 'lucide-react';

export interface DraftsExternalCommand {
  seq: number;
  action:
    | 'add-sticky'
    | 'add-rect'
    | 'add-triangle'
    | 'add-ellipse'
    | 'add-text'
    | 'tool-connector'
    | 'upload-image'
    | 'fit-view'
    | 'clear-board';
}

interface DraftsPluginProps {
  draftsState: DraftsState;
  onUpdateDraftsState: (next: DraftsState) => void;
  currentUserId?: string;
  externalCommand?: DraftsExternalCommand | null;
}

export const defaultDraftsState: DraftsState = {
  boardTitle: 'Drafts — Quadro de Ideias',
  elements: [
    {
      id: 'dr_welcome_1',
      type: 'sticky',
      x: 160,
      y: 180,
      width: 170,
      height: 170,
      fillColor: '#fef08a',
      htmlContent: 'Ideia central<br>do projeto',
      textStyle: {
        fontSize: 16,
        bold: true,
        textAlign: 'center',
        textColor: '#0f172a',
      },
      zIndex: 1,
    },
    {
      id: 'dr_welcome_2',
      type: 'sticky',
      x: 420,
      y: 180,
      width: 170,
      height: 170,
      fillColor: '#bae6fd',
      htmlContent: 'Arraste, conecte<br>ou cole prints (Ctrl+V)',
      textStyle: {
        fontSize: 15,
        textAlign: 'center',
        textColor: '#0f172a',
      },
      zIndex: 2,
    },
  ],
  connectors: [
    {
      id: 'dr_conn_welcome',
      fromElementId: 'dr_welcome_1',
      fromAnchor: 'right',
      fromPoint: { x: 330, y: 265 },
      toElementId: 'dr_welcome_2',
      toAnchor: 'left',
      toPoint: { x: 420, y: 265 },
      color: '#334155',
      strokeWidth: 2,
      dashed: false,
      startArrow: false,
      endArrow: true,
    },
  ],
  viewport: { x: 80, y: 40, zoom: 1 },
};

const STICKY_COLORS = [
  { label: 'Amarelo', value: '#fef08a' },
  { label: 'Azul', value: '#bae6fd' },
  { label: 'Verde', value: '#bbf7d0' },
  { label: 'Rosa', value: '#fbcfe8' },
  { label: 'Roxo', value: '#ddd6fe' },
  { label: 'Laranja', value: '#fed7aa' },
];

const SHAPE_FILL_COLORS = [
  '#ffffff',
  '#e2e8f0',
  '#dbeafe',
  '#dcfce7',
  '#fef9c3',
  '#fee2e2',
  '#f3e8ff',
  '#0E2841',
];

const STROKE_AND_TEXT_COLORS = [
  '#0f172a',
  '#0E2841',
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#d97706',
  '#7c3aed',
  '#ffffff',
];

const CONNECTOR_COLORS = ['#334155', '#0E2841', '#2563eb', '#dc2626', '#16a34a', '#d97706'];

function genDraftId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getElementAnchorPoint(
  el: DraftElement,
  anchor: DraftAnchorSide
): { x: number; y: number } {
  if (anchor === 'top') return { x: el.x + el.width / 2, y: el.y };
  if (anchor === 'right') return { x: el.x + el.width, y: el.y + el.height / 2 };
  if (anchor === 'bottom') return { x: el.x + el.width / 2, y: el.y + el.height };
  return { x: el.x, y: el.y + el.height / 2 };
}

function findNearestAnchor(
  elements: DraftElement[],
  point: { x: number; y: number },
  excludeElementId?: string,
  maxDist = 28
): { elementId: string; anchor: DraftAnchorSide; point: { x: number; y: number } } | null {
  const sides: DraftAnchorSide[] = ['top', 'right', 'bottom', 'left'];
  let best: {
    elementId: string;
    anchor: DraftAnchorSide;
    point: { x: number; y: number };
    dist: number;
  } | null = null;

  for (const el of elements) {
    if (el.id === excludeElementId) continue;
    for (const side of sides) {
      const p = getElementAnchorPoint(el, side);
      const dist = Math.hypot(p.x - point.x, p.y - point.y);
      if (dist <= maxDist && (!best || dist < best.dist)) {
        best = { elementId: el.id, anchor: side, point: p, dist };
      }
    }
  }

  return best
    ? { elementId: best.elementId, anchor: best.anchor, point: best.point }
    : null;
}

interface RichTextEditableProps {
  elementId: string;
  htmlContent: string;
  isEditing: boolean;
  className?: string;
  style: React.CSSProperties;
  registerRef: (id: string, node: HTMLDivElement | null) => void;
  onInputChange: (elementId: string, html: string) => void;
  onCommit: (elementId: string, html: string) => void;
}

const RichTextEditable: React.FC<RichTextEditableProps> = ({
  elementId,
  htmlContent,
  isEditing,
  className = '',
  style,
  registerRef,
  onInputChange,
  onCommit,
}) => {
  const localRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = localRef.current;
    if (!node || isEditing) return;
    if (node.innerHTML !== htmlContent) {
      node.innerHTML = htmlContent;
    }
  }, [htmlContent, isEditing]);

  useEffect(() => {
    const node = localRef.current;
    if (!isEditing || !node) return;
    node.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch {
      // ignore selection fallback
    }
  }, [isEditing]);

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        registerRef(elementId, node);
      }}
      className={`drafts-rich-text-content ${className}`}
      style={style}
      contentEditable={isEditing}
      suppressContentEditableWarning
      onInput={(e) => onInputChange(elementId, e.currentTarget.innerHTML)}
      onBlur={(e) => onCommit(elementId, e.currentTarget.innerHTML)}
    />
  );
};

export const DraftsPlugin: React.FC<DraftsPluginProps> = ({
  draftsState,
  onUpdateDraftsState,
  currentUserId,
  externalCommand,
}) => {
  const [activeTool, setActiveTool] = useState<DraftTool>('select');
  const [activeShapeKind, setActiveShapeKind] = useState<DraftShapeKind>('rectangle');
  const [showShapesPopover, setShowShapesPopover] = useState(false);
  const [showStickyColorPopover, setShowStickyColorPopover] = useState(false);
  const [activeStickyColor, setActiveStickyColor] = useState('#fef08a');

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [showColorMenu, setShowColorMenu] = useState(false);

  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  // Histórico local de Desfazer / Refazer exclusivo do quadro Drafts
  const [undoStack, setUndoStack] = useState<
    Array<{ elements: DraftElement[]; connectors: DraftConnector[] }>
  >([]);
  const [redoStack, setRedoStack] = useState<
    Array<{ elements: DraftElement[]; connectors: DraftConnector[] }>
  >([]);

  // Cache de URLs resolvidas para imagens armazenadas no Supabase Storage ou IndexedDB
  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string>>({});

  // Pré-visualização de linha ao desenhar conector
  const [connectorDraft, setConnectorDraft] = useState<{
    fromElementId?: string;
    fromAnchor?: DraftAnchorSide;
    fromPoint: { x: number; y: number };
    toPoint: { x: number; y: number };
    snapTarget?: { elementId: string; anchor: DraftAnchorSide; point: { x: number; y: number } } | null;
  } | null>(null);

  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const editableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const editingElementIdRef = useRef<string | null>(null);
  const editInitialSnapshotRef = useRef<{
    elementId: string;
    htmlContent: string;
    snapshot: { elements: DraftElement[]; connectors: DraftConnector[] };
  } | null>(null);
  const stateRef = useRef(draftsState);
  const onUpdateDraftsStateRef = useRef(onUpdateDraftsState);

  useEffect(() => {
    stateRef.current = draftsState;
  }, [draftsState]);

  useEffect(() => {
    editingElementIdRef.current = editingElementId;
  }, [editingElementId]);

  useEffect(() => {
    onUpdateDraftsStateRef.current = onUpdateDraftsState;
  }, [onUpdateDraftsState]);

  useEffect(() => {
    const editableNodesMap = editableRefs.current;
    return () => {
      const elId = editingElementIdRef.current;
      if (!elId) return;
      const domHtml = editableNodesMap[elId]?.innerHTML;
      if (domHtml === undefined) return;
      const currentEl = stateRef.current.elements.find((item) => item.id === elId);
      if (currentEl && domHtml !== (currentEl.htmlContent || '')) {
        const nextState: DraftsState = {
          ...stateRef.current,
          elements: stateRef.current.elements.map((item) =>
            item.id === elId ? { ...item, htmlContent: domHtml } : item
          ),
        };
        stateRef.current = nextState;
        onUpdateDraftsStateRef.current(nextState);
      }
    };
  }, []);

  // Refs de interação contínua
  const interactionRef = useRef<{
    kind: 'none' | 'pan' | 'drag' | 'resize' | 'connect' | 'reconnect';
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    elementId?: string;
    resizeHandle?: 'nw' | 'ne' | 'sw' | 'se';
    startRect?: { x: number; y: number; width: number; height: number };
    connectorId?: string;
    connectorEnd?: 'from' | 'to';
    initialSnapshot?: { elements: DraftElement[]; connectors: DraftConnector[] };
    hasMutated: boolean;
  }>({
    kind: 'none',
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
    hasMutated: false,
  });

  const { elements, connectors, viewport, boardTitle } = draftsState;

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedElementId) || null,
    [elements, selectedElementId]
  );

  const selectedConnector = useMemo(
    () => connectors.find((c) => c.id === selectedConnectorId) || null,
    [connectors, selectedConnectorId]
  );

  const elementMap = useMemo(() => {
    const map = new Map<string, DraftElement>();
    elements.forEach((el) => map.set(el.id, el));
    return map;
  }, [elements]);

  const showTempNotice = useCallback((msg: string) => {
    setBoardNotice(msg);
    setTimeout(() => {
      setBoardNotice((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  const commitDraftsState = useCallback(
    (next: DraftsState) => {
      stateRef.current = next;
      onUpdateDraftsState(next);
    },
    [onUpdateDraftsState]
  );

  const pushBoardSnapshot = useCallback(
    (nextElements: DraftElement[], nextConnectors: DraftConnector[], recordHistory = true) => {
      if (recordHistory) {
        setUndoStack((prev) => [
          ...prev.slice(-39),
          { elements: stateRef.current.elements, connectors: stateRef.current.connectors },
        ]);
        setRedoStack([]);
      }
      commitDraftsState({
        ...stateRef.current,
        elements: nextElements,
        connectors: nextConnectors,
      });
    },
    [commitDraftsState]
  );

  const flushActiveTextEdit = useCallback(
    (targetElementId?: string, explicitHtml?: string) => {
      const elId = targetElementId || editingElementIdRef.current;
      if (!elId) return;

      const finalHtml =
        explicitHtml !== undefined ? explicitHtml : editableRefs.current[elId]?.innerHTML;

      if (finalHtml !== undefined) {
        const currentEl = stateRef.current.elements.find((item) => item.id === elId);
        if (currentEl && finalHtml !== (currentEl.htmlContent || '')) {
          commitDraftsState({
            ...stateRef.current,
            elements: stateRef.current.elements.map((item) =>
              item.id === elId ? { ...item, htmlContent: finalHtml } : item
            ),
          });
        }
      }

      const initSnap = editInitialSnapshotRef.current;
      if (initSnap && initSnap.elementId === elId) {
        if (finalHtml !== undefined && finalHtml !== initSnap.htmlContent) {
          setUndoStack((prev) => [...prev.slice(-39), initSnap.snapshot]);
          setRedoStack([]);
        }
        editInitialSnapshotRef.current = null;
      }

      if (editingElementIdRef.current === elId) {
        editingElementIdRef.current = null;
        setEditingElementId((prev) => (prev === elId ? null : prev));
      }
    },
    [commitDraftsState]
  );

  const startEditingElement = useCallback(
    (elementId: string) => {
      if (editingElementIdRef.current && editingElementIdRef.current !== elementId) {
        flushActiveTextEdit();
      }
      const targetEl = stateRef.current.elements.find((item) => item.id === elementId);
      editInitialSnapshotRef.current = {
        elementId,
        htmlContent: targetEl?.htmlContent || '',
        snapshot: {
          elements: stateRef.current.elements,
          connectors: stateRef.current.connectors,
        },
      };
      editingElementIdRef.current = elementId;
      setEditingElementId(elementId);
    },
    [flushActiveTextEdit]
  );

  const handleRichTextInput = useCallback(
    (elementId: string, html: string) => {
      const currentEl = stateRef.current.elements.find((item) => item.id === elementId);
      if (currentEl && html !== (currentEl.htmlContent || '')) {
        commitDraftsState({
          ...stateRef.current,
          elements: stateRef.current.elements.map((item) =>
            item.id === elementId ? { ...item, htmlContent: html } : item
          ),
        });
      }
    },
    [commitDraftsState]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prevSnap = undoStack[undoStack.length - 1];
    setRedoStack((r) => [
      ...r,
      { elements: stateRef.current.elements, connectors: stateRef.current.connectors },
    ]);
    setUndoStack((u) => u.slice(0, -1));
    editInitialSnapshotRef.current = null;
    editingElementIdRef.current = null;
    setEditingElementId(null);
    commitDraftsState({
      ...stateRef.current,
      elements: prevSnap.elements,
      connectors: prevSnap.connectors,
    });
  }, [undoStack, commitDraftsState]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextSnap = redoStack[redoStack.length - 1];
    setUndoStack((u) => [
      ...u,
      { elements: stateRef.current.elements, connectors: stateRef.current.connectors },
    ]);
    setRedoStack((r) => r.slice(0, -1));
    editInitialSnapshotRef.current = null;
    editingElementIdRef.current = null;
    setEditingElementId(null);
    commitDraftsState({
      ...stateRef.current,
      elements: nextSnap.elements,
      connectors: nextSnap.connectors,
    });
  }, [redoStack, commitDraftsState]);

  // Resolver URLs de imagens persistidas no Supabase Storage / IndexedDB ao montar ou recarregar estado
  useEffect(() => {
    let cancelled = false;
    const imageElements = elements.filter(
      (el) => el.type === 'image' && el.imageStoragePath && !resolvedImageUrls[el.id]
    );
    if (imageElements.length === 0) return;

    imageElements.forEach(async (el) => {
      try {
        const url = await resolveDraftImageUrl(el.imageStorageProvider, el.imageStoragePath);
        if (!cancelled && url) {
          setResolvedImageUrls((prev) => (prev[el.id] ? prev : { ...prev, [el.id]: url }));
        }
      } catch {
        // ignore broken image fallback
      }
    });

    return () => {
      cancelled = true;
    };
  }, [elements, resolvedImageUrls]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasViewportRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const vp = stateRef.current.viewport;
      return {
        x: (clientX - rect.left - vp.x) / vp.zoom,
        y: (clientY - rect.top - vp.y) / vp.zoom,
      };
    },
    []
  );

  const getViewportCenterWorld = useCallback(() => {
    const rect = canvasViewportRef.current?.getBoundingClientRect();
    const vp = stateRef.current.viewport;
    if (!rect) return { x: 260, y: 200 };
    return {
      x: (rect.width / 2 - vp.x) / vp.zoom,
      y: (rect.height / 2 - vp.y) / vp.zoom,
    };
  }, []);

  const getMaxZIndex = useCallback(() => {
    return stateRef.current.elements.reduce((max, el) => Math.max(max, el.zIndex || 1), 0);
  }, []);

  // Criação de elementos
  const createElementAt = useCallback(
    (
      kind: 'sticky' | 'rect' | 'triangle' | 'ellipse' | 'text',
      worldPos?: { x: number; y: number },
      customStickyColor?: string
    ) => {
      flushActiveTextEdit();
      const center = worldPos || getViewportCenterWorld();
      const nextZ = getMaxZIndex() + 1;
      let newEl: DraftElement;

      if (kind === 'sticky') {
        const w = 170;
        const h = 170;
        newEl = {
          id: genDraftId('dr_st'),
          type: 'sticky',
          x: Math.round(center.x - w / 2),
          y: Math.round(center.y - h / 2),
          width: w,
          height: h,
          fillColor: customStickyColor || activeStickyColor,
          htmlContent: 'Nova nota...',
          textStyle: { fontSize: 15, textAlign: 'center', textColor: '#0f172a' },
          zIndex: nextZ,
        };
      } else if (kind === 'text') {
        const w = 220;
        const h = 48;
        newEl = {
          id: genDraftId('dr_tx'),
          type: 'text',
          x: Math.round(center.x - w / 2),
          y: Math.round(center.y - h / 2),
          width: w,
          height: h,
          fillColor: 'transparent',
          htmlContent: 'Digite seu texto',
          textStyle: { fontSize: 18, textAlign: 'left', textColor: '#0f172a' },
          zIndex: nextZ,
        };
      } else {
        const shapeKind: DraftShapeKind =
          kind === 'triangle' ? 'triangle' : kind === 'ellipse' ? 'ellipse' : 'rectangle';
        const w = 160;
        const h = shapeKind === 'ellipse' ? 120 : 120;
        newEl = {
          id: genDraftId('dr_sh'),
          type: 'shape',
          shapeKind,
          x: Math.round(center.x - w / 2),
          y: Math.round(center.y - h / 2),
          width: w,
          height: h,
          fillColor: '#ffffff',
          strokeColor: '#0E2841',
          strokeWidth: 2,
          htmlContent: '',
          textStyle: { fontSize: 14, textAlign: 'center', textColor: '#0f172a' },
          zIndex: nextZ,
        };
      }

      pushBoardSnapshot([...stateRef.current.elements, newEl], stateRef.current.connectors);
      setSelectedElementId(newEl.id);
      setSelectedConnectorId(null);
      setActiveTool('select');
      setShowShapesPopover(false);
      setShowStickyColorPopover(false);
      setShowColorMenu(false);

      if (kind === 'text') {
        startEditingElement(newEl.id);
      } else {
        editingElementIdRef.current = null;
        setEditingElementId(null);
      }
    },
    [
      activeStickyColor,
      flushActiveTextEdit,
      getMaxZIndex,
      getViewportCenterWorld,
      pushBoardSnapshot,
      startEditingElement,
    ]
  );

  // Inserção de imagem (via Upload, Drag & Drop ou Ctrl+V)
  const insertImageFile = useCallback(
    async (file: File, worldPos?: { x: number; y: number }) => {
      if (!file.type.startsWith('image/')) {
        showTempNotice('O arquivo selecionado não é uma imagem suportada.');
        return;
      }

      setIsUploadingImage(true);
      try {
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const img = new Image();
          const tmpUrl = URL.createObjectURL(file);
          img.onload = () => {
            URL.revokeObjectURL(tmpUrl);
            const natW = img.naturalWidth || 320;
            const natH = img.naturalHeight || 220;
            const scale = natW > 360 ? 360 / natW : 1;
            resolve({
              w: Math.max(80, Math.round(natW * scale)),
              h: Math.max(60, Math.round(natH * scale)),
            });
          };
          img.onerror = () => {
            URL.revokeObjectURL(tmpUrl);
            resolve({ w: 280, h: 200 });
          };
          img.src = tmpUrl;
        });

        const uploaded = await uploadDraftImage(currentUserId, file);
        const id = genDraftId('dr_im');
        const center = worldPos || getViewportCenterWorld();
        const newEl: DraftElement = {
          id,
          type: 'image',
          x: Math.round(center.x - dims.w / 2),
          y: Math.round(center.y - dims.h / 2),
          width: dims.w,
          height: dims.h,
          fillColor: 'transparent',
          imageStorageProvider: uploaded.storageProvider,
          imageStoragePath: uploaded.storagePath,
          imageName: file.name || 'Imagem colada',
          zIndex: getMaxZIndex() + 1,
        };

        flushActiveTextEdit();
        setResolvedImageUrls((prev) => ({ ...prev, [id]: uploaded.objectUrl }));
        pushBoardSnapshot([...stateRef.current.elements, newEl], stateRef.current.connectors);
        setSelectedElementId(id);
        setSelectedConnectorId(null);
        setActiveTool('select');
      } catch (err: any) {
        showTempNotice(err?.message || 'Erro ao inserir imagem no quadro.');
      } finally {
        setIsUploadingImage(false);
      }
    },
    [
      currentUserId,
      flushActiveTextEdit,
      getMaxZIndex,
      getViewportCenterWorld,
      pushBoardSnapshot,
      showTempNotice,
    ]
  );

  // Exclusão / Duplicação / Camadas
  const handleDeleteSelected = useCallback(() => {
    if (selectedElementId) {
      const nextEls = stateRef.current.elements.filter((el) => el.id !== selectedElementId);
      const nextConns = stateRef.current.connectors.filter(
        (c) => c.fromElementId !== selectedElementId && c.toElementId !== selectedElementId
      );
      editInitialSnapshotRef.current = null;
      editingElementIdRef.current = null;
      setEditingElementId(null);
      pushBoardSnapshot(nextEls, nextConns);
      setSelectedElementId(null);
      setShowColorMenu(false);
      return;
    }
    if (selectedConnectorId) {
      const nextConns = stateRef.current.connectors.filter((c) => c.id !== selectedConnectorId);
      pushBoardSnapshot(stateRef.current.elements, nextConns);
      setSelectedConnectorId(null);
    }
  }, [selectedElementId, selectedConnectorId, pushBoardSnapshot]);

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedElementId) return;
    flushActiveTextEdit();
    const source = stateRef.current.elements.find((e) => e.id === selectedElementId);
    if (!source) return;
    const dupId = genDraftId('dr_dup');
    const copy: DraftElement = {
      ...source,
      id: dupId,
      x: source.x + 28,
      y: source.y + 28,
      zIndex: getMaxZIndex() + 1,
    };
    if (source.type === 'image' && resolvedImageUrls[source.id]) {
      setResolvedImageUrls((prev) => ({ ...prev, [dupId]: prev[source.id] }));
    }
    pushBoardSnapshot([...stateRef.current.elements, copy], stateRef.current.connectors);
    setSelectedElementId(dupId);
  }, [selectedElementId, flushActiveTextEdit, getMaxZIndex, resolvedImageUrls, pushBoardSnapshot]);

  // Atualiza largura da área do quadro branco sem ler refs durante o render
  useEffect(() => {
    const el = canvasViewportRef.current;
    const syncWidth = () => {
      const nextW = el ? el.clientWidth : window.innerWidth;
      if (nextW > 0) setViewportWidth(nextW);
    };
    syncWidth();

    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(syncWidth);
      ro.observe(el);
    }
    window.addEventListener('resize', syncWidth);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', syncWidth);
    };
  }, []);

  // Atualização segura por ID explícito (evita que onBlur sobrescreva outro elemento)
  const updateElementById = useCallback(
    (elementId: string, updater: (el: DraftElement) => DraftElement, recordHistory = true) => {
      const nextEls = stateRef.current.elements.map((el) =>
        el.id === elementId ? updater(el) : el
      );
      pushBoardSnapshot(nextEls, stateRef.current.connectors, recordHistory);
    },
    [pushBoardSnapshot]
  );

  // Atualização de estilo/propriedades do elemento selecionado
  const updateSelectedElement = useCallback(
    (updater: (el: DraftElement) => DraftElement, recordHistory = true) => {
      if (!selectedElementId) return;
      updateElementById(selectedElementId, updater, recordHistory);
    },
    [selectedElementId, updateElementById]
  );

  const registerEditableRef = useCallback((id: string, node: HTMLDivElement | null) => {
    editableRefs.current[id] = node;
  }, []);

  const updateSelectedConnector = useCallback(
    (updater: (c: DraftConnector) => DraftConnector) => {
      if (!selectedConnectorId) return;
      const nextConns = stateRef.current.connectors.map((c) =>
        c.id === selectedConnectorId ? updater(c) : c
      );
      pushBoardSnapshot(stateRef.current.elements, nextConns);
    },
    [selectedConnectorId, pushBoardSnapshot]
  );

  // Formatação de Texto Rico (suporta seleção dentro do contentEditable via execCommand E bloco inteiro)
  const applyRichTextFormat = (format: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    if (!selectedElement) return;
    if (editingElementId === selectedElement.id) {
      const cmdMap = {
        bold: 'bold',
        italic: 'italic',
        underline: 'underline',
        strikethrough: 'strikeThrough',
      } as const;
      document.execCommand(cmdMap[format], false);
      const domEl = editableRefs.current[selectedElement.id];
      if (domEl) {
        const html = domEl.innerHTML;
        updateElementById(selectedElement.id, (el) => ({ ...el, htmlContent: html }), false);
      }
      return;
    }

    updateElementById(selectedElement.id, (el) => {
      const style: DraftTextStyle = el.textStyle || { fontSize: 15 };
      return {
        ...el,
        textStyle: {
          ...style,
          [format]: !style[format],
        },
      };
    });
  };

  // Controle de Zoom & Enquadramento
  const applyZoomAtPoint = useCallback(
    (nextZoomRaw: number, clientX?: number, clientY?: number) => {
      const nextZoom = Math.min(3, Math.max(0.15, Number(nextZoomRaw.toFixed(2))));
      const vp = stateRef.current.viewport;
      const rect = canvasViewportRef.current?.getBoundingClientRect();
      if (!rect) {
        commitDraftsState({
          ...stateRef.current,
          viewport: { ...vp, zoom: nextZoom },
        });
        return;
      }

      const focusX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
      const focusY = clientY !== undefined ? clientY - rect.top : rect.height / 2;
      const worldX = (focusX - vp.x) / vp.zoom;
      const worldY = (focusY - vp.y) / vp.zoom;

      commitDraftsState({
        ...stateRef.current,
        viewport: {
          zoom: nextZoom,
          x: Math.round(focusX - worldX * nextZoom),
          y: Math.round(focusY - worldY * nextZoom),
        },
      });
    },
    [commitDraftsState]
  );

  const handleFitView = useCallback(() => {
    const rect = canvasViewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const els = stateRef.current.elements;
    if (els.length === 0) {
      commitDraftsState({
        ...stateRef.current,
        viewport: { x: 80, y: 60, zoom: 1 },
      });
      return;
    }
    const minX = Math.min(...els.map((e) => e.x));
    const minY = Math.min(...els.map((e) => e.y));
    const maxX = Math.max(...els.map((e) => e.x + e.width));
    const maxY = Math.max(...els.map((e) => e.y + e.height));
    const contentW = Math.max(200, maxX - minX);
    const contentH = Math.max(200, maxY - minY);
    const padding = 100;
    const zoomX = (rect.width - padding * 2) / contentW;
    const zoomY = (rect.height - padding * 2) / contentH;
    const zoom = Math.min(1.2, Math.max(0.25, Number(Math.min(zoomX, zoomY).toFixed(2))));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    commitDraftsState({
      ...stateRef.current,
      viewport: {
        zoom,
        x: Math.round(rect.width / 2 - cx * zoom),
        y: Math.round(rect.height / 2 - cy * zoom),
      },
    });
  }, [commitDraftsState]);

  // Comandos externos disparados pela guia Drafts no Ribbon
  const lastSeqRef = useRef<number>(0);
  useEffect(() => {
    if (!externalCommand || externalCommand.seq === lastSeqRef.current) return;
    lastSeqRef.current = externalCommand.seq;
    const act = externalCommand.action;
    if (act === 'add-sticky') createElementAt('sticky');
    else if (act === 'add-rect') createElementAt('rect');
    else if (act === 'add-triangle') createElementAt('triangle');
    else if (act === 'add-ellipse') createElementAt('ellipse');
    else if (act === 'add-text') createElementAt('text');
    else if (act === 'tool-connector') {
      setActiveTool('connector');
      setSelectedElementId(null);
      setSelectedConnectorId(null);
    } else if (act === 'upload-image') {
      imageInputRef.current?.click();
    } else if (act === 'fit-view') {
      handleFitView();
    } else if (act === 'clear-board') {
      if (
        stateRef.current.elements.length === 0 &&
        stateRef.current.connectors.length === 0
      ) {
        return;
      }
      if (window.confirm('Deseja limpar todos os elementos do quadro Drafts? (Você pode desfazer com Ctrl+Z)')) {
        editInitialSnapshotRef.current = null;
        editingElementIdRef.current = null;
        setEditingElementId(null);
        pushBoardSnapshot([], []);
        setSelectedElementId(null);
        setSelectedConnectorId(null);
      }
    }
  }, [externalCommand, createElementAt, handleFitView, pushBoardSnapshot]);

  // Atalhos de teclado e Ctrl+V / Cmd+V de imagens dentro do Drafts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const activeTag = document.activeElement?.tagName;
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && !isEditable) {
          e.preventDefault();
          setSpacePressed(true);
        }
      }

      const activeTag = document.activeElement?.tagName;
      const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || isEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isTyping) {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !isTyping) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !isTyping) {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }

      if (isTyping) {
        if (e.key === 'Escape') {
          flushActiveTextEdit();
          (document.activeElement as HTMLElement | null)?.blur?.();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId || selectedConnectorId) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      if (e.key === 'Escape') {
        flushActiveTextEdit();
        setSelectedElementId(null);
        setSelectedConnectorId(null);
        setShowShapesPopover(false);
        setShowStickyColorPopover(false);
        setShowColorMenu(false);
        setActiveTool('select');
        return;
      }

      const lower = e.key.toLowerCase();
      if (!e.ctrlKey && !e.metaKey) {
        if (lower === 'v') setActiveTool('select');
        else if (lower === 'h') setActiveTool('pan');
        else if (lower === 't') setActiveTool('text');
        else if (lower === 'n') setActiveTool('sticky');
        else if (lower === 's') setActiveTool(activeShapeKind === 'triangle' ? 'triangle' : activeShapeKind === 'ellipse' ? 'ellipse' : 'rect');
        else if (lower === 'l') setActiveTool('connector');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || isEditable) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const ext = item.type.split('/')[1] || 'png';
            const namedFile =
              blob.name && blob.name !== 'image.png'
                ? blob
                : new File([blob], `colagem_${Date.now()}.${ext}`, { type: item.type });
            insertImageFile(namedFile);
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('paste', handlePaste);
    };
  }, [
    activeShapeKind,
    flushActiveTextEdit,
    handleUndo,
    handleRedo,
    handleDuplicateSelected,
    handleDeleteSelected,
    insertImageFile,
    selectedElementId,
    selectedConnectorId,
  ]);

  // Listeners globais de arraste / redimensionamento / pan / conector
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const ctx = interactionRef.current;
      if (ctx.kind === 'none') return;

      const dxScreen = e.clientX - ctx.startClientX;
      const dyScreen = e.clientY - ctx.startClientY;
      const vp = stateRef.current.viewport;
      const dxWorld = dxScreen / vp.zoom;
      const dyWorld = dyScreen / vp.zoom;

      if (ctx.kind === 'pan') {
        commitDraftsState({
          ...stateRef.current,
          viewport: {
            ...vp,
            x: Math.round(ctx.startPanX + dxScreen),
            y: Math.round(ctx.startPanY + dyScreen),
          },
        });
        return;
      }

      if (ctx.kind === 'drag' && ctx.elementId && ctx.startRect) {
        if (Math.abs(dxScreen) > 2 || Math.abs(dyScreen) > 2) ctx.hasMutated = true;
        const nextX = Math.round(ctx.startRect.x + dxWorld);
        const nextY = Math.round(ctx.startRect.y + dyWorld);
        commitDraftsState({
          ...stateRef.current,
          elements: stateRef.current.elements.map((el) =>
            el.id === ctx.elementId ? { ...el, x: nextX, y: nextY } : el
          ),
        });
        return;
      }

      if (ctx.kind === 'resize' && ctx.elementId && ctx.startRect && ctx.resizeHandle) {
        ctx.hasMutated = true;
        const { x, y, width, height } = ctx.startRect;
        const minW = 48;
        const minH = 36;
        let nx = x;
        let ny = y;
        let nw = width;
        let nh = height;
        const h = ctx.resizeHandle;

        if (h === 'se') {
          nw = Math.max(minW, width + dxWorld);
          nh = Math.max(minH, height + dyWorld);
        } else if (h === 'sw') {
          nw = Math.max(minW, width - dxWorld);
          nx = x + (width - nw);
          nh = Math.max(minH, height + dyWorld);
        } else if (h === 'ne') {
          nw = Math.max(minW, width + dxWorld);
          nh = Math.max(minH, height - dyWorld);
          ny = y + (height - nh);
        } else if (h === 'nw') {
          nw = Math.max(minW, width - dxWorld);
          nx = x + (width - nw);
          nh = Math.max(minH, height - dyWorld);
          ny = y + (height - nh);
        }

        // Opcional: Shift mantém proporção original durante resize
        if (e.shiftKey && width > 0 && height > 0) {
          const aspect = width / height;
          nh = Math.max(minH, nw / aspect);
          if (h === 'nw' || h === 'ne') {
            ny = y + (height - nh);
          }
        }

        commitDraftsState({
          ...stateRef.current,
          elements: stateRef.current.elements.map((el) =>
            el.id === ctx.elementId
              ? {
                  ...el,
                  x: Math.round(nx),
                  y: Math.round(ny),
                  width: Math.round(nw),
                  height: Math.round(nh),
                }
              : el
          ),
        });
        return;
      }

      if (ctx.kind === 'connect') {
        const wPt = screenToWorld(e.clientX, e.clientY);
        setConnectorDraft((prev) => {
          if (!prev) return null;
          const snap = findNearestAnchor(stateRef.current.elements, wPt, prev.fromElementId, 30);
          return {
            ...prev,
            toPoint: snap ? snap.point : wPt,
            snapTarget: snap,
          };
        });
        return;
      }

      if (ctx.kind === 'reconnect' && ctx.connectorId && ctx.connectorEnd) {
        ctx.hasMutated = true;
        const wPt = screenToWorld(e.clientX, e.clientY);
        const targetConn = stateRef.current.connectors.find((c) => c.id === ctx.connectorId);
        const otherElId =
          ctx.connectorEnd === 'from' ? targetConn?.toElementId : targetConn?.fromElementId;
        const snap = findNearestAnchor(stateRef.current.elements, wPt, otherElId, 28);

        commitDraftsState({
          ...stateRef.current,
          connectors: stateRef.current.connectors.map((c) => {
            if (c.id !== ctx.connectorId) return c;
            if (ctx.connectorEnd === 'from') {
              return {
                ...c,
                fromElementId: snap?.elementId,
                fromAnchor: snap?.anchor,
                fromPoint: snap ? snap.point : wPt,
              };
            }
            return {
              ...c,
              toElementId: snap?.elementId,
              toAnchor: snap?.anchor,
              toPoint: snap ? snap.point : wPt,
            };
          }),
        });
      }
    };

    const handleMouseUp = () => {
      const ctx = interactionRef.current;
      if (ctx.kind === 'none') return;

      if (ctx.kind === 'pan') {
        setIsPanning(false);
      }

      if ((ctx.kind === 'drag' || ctx.kind === 'resize' || ctx.kind === 'reconnect') && ctx.hasMutated && ctx.initialSnapshot) {
        setUndoStack((prev) => [...prev.slice(-39), ctx.initialSnapshot!]);
        setRedoStack([]);
      }

      if (ctx.kind === 'connect') {
        setConnectorDraft((draft) => {
          if (draft) {
            const dist = Math.hypot(
              draft.toPoint.x - draft.fromPoint.x,
              draft.toPoint.y - draft.fromPoint.y
            );
            if (dist > 14 || draft.snapTarget) {
              const newConn: DraftConnector = {
                id: genDraftId('dr_cn'),
                fromElementId: draft.fromElementId,
                fromAnchor: draft.fromAnchor,
                fromPoint: draft.fromPoint,
                toElementId: draft.snapTarget?.elementId,
                toAnchor: draft.snapTarget?.anchor,
                toPoint: draft.snapTarget ? draft.snapTarget.point : draft.toPoint,
                color: '#334155',
                strokeWidth: 2,
                dashed: false,
                startArrow: false,
                endArrow: true,
              };
              pushBoardSnapshot(stateRef.current.elements, [...stateRef.current.connectors, newConn]);
              setSelectedConnectorId(newConn.id);
              setSelectedElementId(null);
              setActiveTool('select');
            }
          }
          return null;
        });
      }

      interactionRef.current = {
        kind: 'none',
        startClientX: 0,
        startClientY: 0,
        startPanX: 0,
        startPanY: 0,
        hasMutated: false,
      };
      setIsInteracting(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [commitDraftsState, pushBoardSnapshot, screenToWorld]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.draftCanvasBg) {
      return;
    }

    setShowShapesPopover(false);
    setShowStickyColorPopover(false);
    setShowColorMenu(false);

    // Finaliza e salva edição de texto aberta antes de desmarcar, mover ou criar outro item
    flushActiveTextEdit();

    // Pan com botão do meio, tecla Espaço, ou ferramenta Pan
    if (e.button === 1 || spacePressed || activeTool === 'pan') {
      e.preventDefault();
      interactionRef.current = {
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: viewport.x,
        startPanY: viewport.y,
        hasMutated: false,
      };
      setIsPanning(true);
      setIsInteracting(true);
      return;
    }

    if (e.button !== 0) return;

    const worldPt = screenToWorld(e.clientX, e.clientY);

    if (activeTool === 'connector') {
      const startSnap = findNearestAnchor(elements, worldPt, undefined, 28);
      interactionRef.current = {
        kind: 'connect',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: viewport.x,
        startPanY: viewport.y,
        hasMutated: false,
      };
      setIsInteracting(true);
      setConnectorDraft({
        fromElementId: startSnap?.elementId,
        fromAnchor: startSnap?.anchor,
        fromPoint: startSnap ? startSnap.point : worldPt,
        toPoint: worldPt,
        snapTarget: null,
      });
      return;
    }

    if (
      activeTool === 'sticky' ||
      activeTool === 'rect' ||
      activeTool === 'triangle' ||
      activeTool === 'ellipse' ||
      activeTool === 'text'
    ) {
      createElementAt(activeTool, worldPt);
      return;
    }

    setSelectedElementId(null);
    setSelectedConnectorId(null);
  };

  const handleElementMouseDown = (e: React.MouseEvent, el: DraftElement) => {
    e.stopPropagation();

    if (spacePressed || activeTool === 'pan') {
      interactionRef.current = {
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: viewport.x,
        startPanY: viewport.y,
        hasMutated: false,
      };
      setIsPanning(true);
      setIsInteracting(true);
      return;
    }

    if (activeTool === 'connector') {
      const wPt = screenToWorld(e.clientX, e.clientY);
      const snap = findNearestAnchor([el], wPt, undefined, 200);
      interactionRef.current = {
        kind: 'connect',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: viewport.x,
        startPanY: viewport.y,
        hasMutated: false,
      };
      setIsInteracting(true);
      setConnectorDraft({
        fromElementId: el.id,
        fromAnchor: snap?.anchor || 'right',
        fromPoint: snap ? snap.point : getElementAnchorPoint(el, 'right'),
        toPoint: wPt,
        snapTarget: null,
      });
      return;
    }

    if (editingElementId === el.id) {
      return; // Permite seleção normal do cursor dentro do editor rico
    }

    flushActiveTextEdit();
    setSelectedElementId(el.id);
    setSelectedConnectorId(null);
    setShowColorMenu(false);

    interactionRef.current = {
      kind: 'drag',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: viewport.x,
      startPanY: viewport.y,
      elementId: el.id,
      startRect: { x: el.x, y: el.y, width: el.width, height: el.height },
      initialSnapshot: { elements: stateRef.current.elements, connectors: stateRef.current.connectors },
      hasMutated: false,
    };
    setIsInteracting(true);
  };

  const handleStartAnchorConnect = (
    e: React.MouseEvent,
    el: DraftElement,
    side: DraftAnchorSide
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const anchorPt = getElementAnchorPoint(el, side);
    interactionRef.current = {
      kind: 'connect',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: viewport.x,
      startPanY: viewport.y,
      hasMutated: false,
    };
    setIsInteracting(true);
    setConnectorDraft({
      fromElementId: el.id,
      fromAnchor: side,
      fromPoint: anchorPt,
      toPoint: anchorPt,
      snapTarget: null,
    });
  };

  const handleStartResize = (
    e: React.MouseEvent,
    el: DraftElement,
    handle: 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    interactionRef.current = {
      kind: 'resize',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: viewport.x,
      startPanY: viewport.y,
      elementId: el.id,
      resizeHandle: handle,
      startRect: { x: el.x, y: el.y, width: el.width, height: el.height },
      initialSnapshot: { elements: stateRef.current.elements, connectors: stateRef.current.connectors },
      hasMutated: false,
    };
    setIsInteracting(true);
  };

  const getResolvedConnectorCoords = useCallback(
    (c: DraftConnector) => {
      let from = c.fromPoint;
      let to = c.toPoint;
      if (c.fromElementId && c.fromAnchor) {
        const el = elementMap.get(c.fromElementId);
        if (el) from = getElementAnchorPoint(el, c.fromAnchor);
      }
      if (c.toElementId && c.toAnchor) {
        const el = elementMap.get(c.toElementId);
        if (el) to = getElementAnchorPoint(el, c.toAnchor);
      }
      return { from, to };
    },
    [elementMap]
  );

  // Cálculo da posição do Menu Contextual Flutuante acima do item selecionado (Estilo Miro)
  const floatingToolbarStyle = useMemo<React.CSSProperties | null>(() => {
    if (isInteracting) return null;
    const maxW = viewportWidth;

    if (selectedElement) {
      const centerX = (selectedElement.x + selectedElement.width / 2) * viewport.zoom + viewport.x;
      const topY = selectedElement.y * viewport.zoom + viewport.y;
      const clampedX = Math.max(240, Math.min(maxW - 240, centerX));
      const safeTop = Math.max(66, topY - 54);
      return {
        left: `${clampedX}px`,
        top: `${safeTop}px`,
        transform: 'translateX(-50%)',
      };
    }

    if (selectedConnector) {
      const { from, to } = getResolvedConnectorCoords(selectedConnector);
      const midX = ((from.x + to.x) / 2) * viewport.zoom + viewport.x;
      const minY = Math.min(from.y, to.y) * viewport.zoom + viewport.y;
      const clampedX = Math.max(200, Math.min(maxW - 200, midX));
      const safeTop = Math.max(66, minY - 54);
      return {
        left: `${clampedX}px`,
        top: `${safeTop}px`,
        transform: 'translateX(-50%)',
      };
    }

    return null;
  }, [
    isInteracting,
    viewportWidth,
    selectedElement,
    selectedConnector,
    viewport,
    getResolvedConnectorCoords,
  ]);

  // Grid de fundo alinhado ao zoom e pan
  const gridStep = 24 * viewport.zoom;
  const gridMajorStep = 120 * viewport.zoom;
  const canvasBackgroundStyle: React.CSSProperties = {
    backgroundColor: '#f8fafc',
    backgroundImage:
      viewport.zoom >= 0.45
        ? `linear-gradient(to right, rgba(148, 163, 184, 0.14) 1px, transparent 1px),
           linear-gradient(to bottom, rgba(148, 163, 184, 0.14) 1px, transparent 1px),
           linear-gradient(to right, rgba(100, 116, 139, 0.16) 1px, transparent 1px),
           linear-gradient(to bottom, rgba(100, 116, 139, 0.16) 1px, transparent 1px)`
        : `linear-gradient(to right, rgba(100, 116, 139, 0.15) 1px, transparent 1px),
           linear-gradient(to bottom, rgba(100, 116, 139, 0.15) 1px, transparent 1px)`,
    backgroundSize:
      viewport.zoom >= 0.45
        ? `${gridStep}px ${gridStep}px, ${gridStep}px ${gridStep}px, ${gridMajorStep}px ${gridMajorStep}px, ${gridMajorStep}px ${gridMajorStep}px`
        : `${gridMajorStep}px ${gridMajorStep}px`,
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
  };

  const sortedElements = useMemo(
    () => [...elements].sort((a, b) => (a.zIndex || 1) - (b.zIndex || 1)),
    [elements]
  );

  const cursorClass = isPanning
    ? 'cursor-grabbing'
    : spacePressed || activeTool === 'pan'
      ? 'cursor-grab'
      : activeTool === 'select'
        ? 'cursor-default'
        : 'cursor-crosshair';

  return (
    <div className="drafts-workspace">
      {/* Input oculto de upload de imagens */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) {
            Array.from(e.target.files).forEach((f, idx) => {
              const center = getViewportCenterWorld();
              insertImageFile(f, { x: center.x + idx * 32, y: center.y + idx * 32 });
            });
            e.target.value = '';
          }
        }}
      />

      {/* Pílula Superior Esquerda: Identidade e Título Editável do Quadro */}
      <div className="drafts-top-pill">
        <span className="drafts-brand-badge">
          <Sparkles size={13} />
          Drafts
        </span>
        <input
          type="text"
          className="drafts-title-input"
          value={boardTitle}
          onChange={(e) =>
            commitDraftsState({
              ...stateRef.current,
              boardTitle: e.target.value,
            })
          }
          title="Clique para renomear este quadro Drafts"
        />
        <span className="drafts-stats-pill">
          {elements.length} {elements.length === 1 ? 'item' : 'itens'}
        </span>
      </div>

      {/* Pílula Superior Direita: Dica rápida de colagem e zoom */}
      <div className="drafts-top-hint-pill">
        {isUploadingImage ? (
          <span className="drafts-uploading-status">
            <Loader2 size={13} className="spin-icon" /> Enviando imagem...
          </span>
        ) : (
          <span>Ctrl+V cola imagem • Duplo clique edita texto • Espaço+Arrastar move tela</span>
        )}
      </div>

      {boardNotice && <div className="drafts-notice-pill">{boardNotice}</div>}

      {/* Barra de Ferramentas Principal Fixa à Esquerda (Estilo Miro) */}
      <div className="drafts-left-dock">
        <div className="drafts-left-toolbar">
          <button
            type="button"
            className={`drafts-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
            onClick={() => {
              setActiveTool('select');
              setShowShapesPopover(false);
              setShowStickyColorPopover(false);
            }}
            title="Selecionar e Mover (V)"
          >
            <MousePointer2 size={18} />
          </button>

          <button
            type="button"
            className={`drafts-tool-btn ${activeTool === 'pan' ? 'active' : ''}`}
            onClick={() => {
              setActiveTool('pan');
              setShowShapesPopover(false);
              setShowStickyColorPopover(false);
            }}
            title="Mover Quadro / Mão (H ou segure Espaço)"
          >
            <Hand size={18} />
          </button>

          <div className="drafts-toolbar-sep" />

          <button
            type="button"
            className={`drafts-tool-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => {
              setActiveTool('text');
              setShowShapesPopover(false);
              setShowStickyColorPopover(false);
            }}
            title="Caixa de Texto (T) — Clique no quadro para escrever"
          >
            <Type size={18} />
          </button>

          <div className="drafts-tool-popover-anchor">
            <button
              type="button"
              className={`drafts-tool-btn ${activeTool === 'sticky' ? 'active' : ''}`}
              onClick={() => {
                setActiveTool('sticky');
                setShowStickyColorPopover((v) => !v);
                setShowShapesPopover(false);
              }}
              title="Nota Adesiva / Post-it (N) — Clique no quadro para colar"
            >
              <StickyNote size={18} />
              <span
                className="drafts-sticky-dot-indicator"
                style={{ backgroundColor: activeStickyColor }}
              />
            </button>

            {showStickyColorPopover && (
              <div className="drafts-side-popover">
                <div className="drafts-popover-title">Cor da Nota Adesiva</div>
                <div className="drafts-swatch-row">
                  {STICKY_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`drafts-swatch-btn ${activeStickyColor === c.value ? 'selected' : ''}`}
                      style={{ backgroundColor: c.value }}
                      title={`Criar nota ${c.label}`}
                      onClick={() => {
                        setActiveStickyColor(c.value);
                        createElementAt('sticky', undefined, c.value);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="drafts-tool-popover-anchor">
            <button
              type="button"
              className={`drafts-tool-btn ${
                activeTool === 'rect' || activeTool === 'triangle' || activeTool === 'ellipse'
                  ? 'active'
                  : ''
              }`}
              onClick={() => {
                setShowShapesPopover((v) => !v);
                setShowStickyColorPopover(false);
              }}
              title="Formas Geométricas (S)"
            >
              <Shapes size={18} />
            </button>

            {showShapesPopover && (
              <div className="drafts-side-popover shapes-popover">
                <div className="drafts-popover-title">Formas</div>
                <div className="drafts-shapes-grid">
                  <button
                    type="button"
                    className={`drafts-shape-pick-btn ${activeTool === 'rect' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveShapeKind('rectangle');
                      setActiveTool('rect');
                      createElementAt('rect');
                    }}
                    title="Retângulo / Quadrado"
                  >
                    <Square size={18} />
                    <span>Retângulo</span>
                  </button>
                  <button
                    type="button"
                    className={`drafts-shape-pick-btn ${activeTool === 'triangle' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveShapeKind('triangle');
                      setActiveTool('triangle');
                      createElementAt('triangle');
                    }}
                    title="Triângulo"
                  >
                    <Triangle size={18} />
                    <span>Triângulo</span>
                  </button>
                  <button
                    type="button"
                    className={`drafts-shape-pick-btn ${activeTool === 'ellipse' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveShapeKind('ellipse');
                      setActiveTool('ellipse');
                      createElementAt('ellipse');
                    }}
                    title="Elipse / Círculo"
                  >
                    <Circle size={18} />
                    <span>Elipse</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className={`drafts-tool-btn ${activeTool === 'connector' ? 'active' : ''}`}
            onClick={() => {
              setActiveTool('connector');
              setShowShapesPopover(false);
              setShowStickyColorPopover(false);
            }}
            title="Linha / Conector (L) — Arraste de um elemento a outro"
          >
            <MoveUpRight size={18} />
          </button>

          <button
            type="button"
            className="drafts-tool-btn"
            onClick={() => imageInputRef.current?.click()}
            title="Inserir Imagem do computador (ou use Ctrl+V para colar)"
          >
            <ImagePlus size={18} />
          </button>
        </div>

        {/* Pílula Inferior Esquerda: Desfazer & Refazer (igual ao print do Miro) */}
        <div className="drafts-history-pill">
          <button
            type="button"
            className="drafts-tool-btn"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            title="Desfazer no Drafts (Ctrl+Z)"
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            className="drafts-tool-btn"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            title="Refazer no Drafts (Ctrl+Y)"
          >
            <Redo2 size={17} />
          </button>
        </div>
      </div>

      {/* Menu Flutuante Contextual acima do elemento/conector selecionado (Estilo Miro) */}
      {floatingToolbarStyle && selectedElement && (
        <div
          className="drafts-floating-menu"
          style={floatingToolbarStyle}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {selectedElement.type !== 'image' && (
            <>
              <div className="drafts-fm-group">
                <button
                  type="button"
                  className="drafts-fm-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    updateSelectedElement((el) => ({
                      ...el,
                      textStyle: {
                        ...(el.textStyle || { fontSize: 15 }),
                        fontSize: Math.max(10, (el.textStyle?.fontSize || 15) - 2),
                      },
                    }))
                  }
                  title="Diminuir fonte"
                >
                  <Minus size={13} />
                </button>
                <span className="drafts-fm-font-val">
                  {selectedElement.textStyle?.fontSize || 15}
                </span>
                <button
                  type="button"
                  className="drafts-fm-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    updateSelectedElement((el) => ({
                      ...el,
                      textStyle: {
                        ...(el.textStyle || { fontSize: 15 }),
                        fontSize: Math.min(72, (el.textStyle?.fontSize || 15) + 2),
                      },
                    }))
                  }
                  title="Aumentar fonte"
                >
                  <Plus size={13} />
                </button>
              </div>

              <div className="drafts-fm-sep" />

              <div className="drafts-fm-group">
                <button
                  type="button"
                  className={`drafts-fm-btn ${selectedElement.textStyle?.bold ? 'active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyRichTextFormat('bold')}
                  title="Negrito"
                >
                  <Bold size={14} />
                </button>
                <button
                  type="button"
                  className={`drafts-fm-btn ${selectedElement.textStyle?.italic ? 'active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyRichTextFormat('italic')}
                  title="Itálico"
                >
                  <Italic size={14} />
                </button>
                <button
                  type="button"
                  className={`drafts-fm-btn ${selectedElement.textStyle?.underline ? 'active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyRichTextFormat('underline')}
                  title="Sublinhado"
                >
                  <Underline size={14} />
                </button>
                <button
                  type="button"
                  className={`drafts-fm-btn ${selectedElement.textStyle?.strikethrough ? 'active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyRichTextFormat('strikethrough')}
                  title="Riscado"
                >
                  <Strikethrough size={14} />
                </button>
              </div>

              <div className="drafts-fm-sep" />

              <div className="drafts-fm-group">
                <button
                  type="button"
                  className={`drafts-fm-btn ${
                    (selectedElement.textStyle?.textAlign || 'center') === 'left' ? 'active' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    updateSelectedElement((el) => ({
                      ...el,
                      textStyle: { ...(el.textStyle || { fontSize: 15 }), textAlign: 'left' },
                    }))
                  }
                  title="Alinhar à esquerda"
                >
                  <AlignLeft size={14} />
                </button>
                <button
                  type="button"
                  className={`drafts-fm-btn ${
                    (selectedElement.textStyle?.textAlign || 'center') === 'center' ? 'active' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    updateSelectedElement((el) => ({
                      ...el,
                      textStyle: { ...(el.textStyle || { fontSize: 15 }), textAlign: 'center' },
                    }))
                  }
                  title="Centralizar"
                >
                  <AlignCenter size={14} />
                </button>
                <button
                  type="button"
                  className={`drafts-fm-btn ${
                    selectedElement.textStyle?.textAlign === 'right' ? 'active' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    updateSelectedElement((el) => ({
                      ...el,
                      textStyle: { ...(el.textStyle || { fontSize: 15 }), textAlign: 'right' },
                    }))
                  }
                  title="Alinhar à direita"
                >
                  <AlignRight size={14} />
                </button>
              </div>

              <div className="drafts-fm-sep" />

              <div className="drafts-fm-color-anchor">
                <button
                  type="button"
                  className="drafts-fm-color-trigger"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowColorMenu((v) => !v)}
                  title={
                    selectedElement.type === 'text'
                      ? 'Cor do texto'
                      : 'Cores de preenchimento e texto'
                  }
                >
                  <span
                    className="drafts-fm-color-dot"
                    style={{
                      backgroundColor:
                        selectedElement.type === 'text'
                          ? selectedElement.textStyle?.textColor || '#0f172a'
                          : selectedElement.fillColor,
                    }}
                  />
                </button>

                {showColorMenu && (
                  <div className="drafts-fm-color-popover">
                    {selectedElement.type === 'sticky' && (
                      <>
                        <div className="drafts-popover-title">Cor da Nota</div>
                        <div className="drafts-swatch-row">
                          {STICKY_COLORS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              className={`drafts-swatch-btn ${
                                selectedElement.fillColor === c.value ? 'selected' : ''
                              }`}
                              style={{ backgroundColor: c.value }}
                              onClick={() =>
                                updateSelectedElement((el) => ({ ...el, fillColor: c.value }))
                              }
                            />
                          ))}
                        </div>
                      </>
                    )}

                    {selectedElement.type === 'shape' && (
                      <>
                        <div className="drafts-popover-title">Preenchimento</div>
                        <div className="drafts-swatch-row">
                          {SHAPE_FILL_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`drafts-swatch-btn ${
                                selectedElement.fillColor === color ? 'selected' : ''
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() =>
                                updateSelectedElement((el) => ({
                                  ...el,
                                  fillColor: color,
                                  textStyle: {
                                    ...(el.textStyle || { fontSize: 14 }),
                                    textColor:
                                      color === '#0E2841'
                                        ? '#ffffff'
                                        : el.textStyle?.textColor === '#ffffff'
                                          ? '#0f172a'
                                          : el.textStyle?.textColor || '#0f172a',
                                  },
                                }))
                              }
                            />
                          ))}
                        </div>
                        <div className="drafts-popover-title" style={{ marginTop: 6 }}>
                          Cor da Borda
                        </div>
                        <div className="drafts-swatch-row">
                          {STROKE_AND_TEXT_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`drafts-swatch-btn ${
                                selectedElement.strokeColor === color ? 'selected' : ''
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() =>
                                updateSelectedElement((el) => ({ ...el, strokeColor: color }))
                              }
                            />
                          ))}
                        </div>
                      </>
                    )}

                    {selectedElement.type === 'text' && (
                      <>
                        <div className="drafts-popover-title">Cor do Texto</div>
                        <div className="drafts-swatch-row">
                          {STROKE_AND_TEXT_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`drafts-swatch-btn ${
                                selectedElement.textStyle?.textColor === color ? 'selected' : ''
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() =>
                                updateSelectedElement((el) => ({
                                  ...el,
                                  textStyle: {
                                    ...(el.textStyle || { fontSize: 18 }),
                                    textColor: color,
                                  },
                                }))
                              }
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="drafts-fm-sep" />
            </>
          )}

          {/* Controles comuns: Camadas, Duplicar e Excluir */}
          <div className="drafts-fm-group">
            <button
              type="button"
              className="drafts-fm-btn"
              onClick={() =>
                updateSelectedElement((el) => ({ ...el, zIndex: getMaxZIndex() + 1 }))
              }
              title="Trazer para frente"
            >
              <BringToFront size={14} />
            </button>
            <button
              type="button"
              className="drafts-fm-btn"
              onClick={() => updateSelectedElement((el) => ({ ...el, zIndex: 0 }))}
              title="Enviar para trás"
            >
              <SendToBack size={14} />
            </button>
            <button
              type="button"
              className="drafts-fm-btn"
              onClick={handleDuplicateSelected}
              title="Duplicar (Ctrl+D)"
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              className="drafts-fm-btn danger"
              onClick={handleDeleteSelected}
              title="Excluir (Delete)"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Menu Flutuante para Linha / Conector selecionado */}
      {floatingToolbarStyle && selectedConnector && (
        <div
          className="drafts-floating-menu"
          style={floatingToolbarStyle}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="drafts-fm-group">
            {CONNECTOR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`drafts-swatch-btn small ${selectedConnector.color === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => updateSelectedConnector((conn) => ({ ...conn, color: c }))}
                title="Cor do conector"
              />
            ))}
          </div>

          <div className="drafts-fm-sep" />

          <div className="drafts-fm-group">
            <button
              type="button"
              className={`drafts-fm-btn ${selectedConnector.dashed ? 'active' : ''}`}
              onClick={() =>
                updateSelectedConnector((conn) => ({ ...conn, dashed: !conn.dashed }))
              }
              title="Alternar linha tracejada"
            >
              <span>---</span>
            </button>
            <button
              type="button"
              className={`drafts-fm-btn ${selectedConnector.startArrow ? 'active' : ''}`}
              onClick={() =>
                updateSelectedConnector((conn) => ({ ...conn, startArrow: !conn.startArrow }))
              }
              title="Seta no início"
            >
              <ArrowLeft size={14} />
            </button>
            <button
              type="button"
              className={`drafts-fm-btn ${selectedConnector.endArrow ? 'active' : ''}`}
              onClick={() =>
                updateSelectedConnector((conn) => ({ ...conn, endArrow: !conn.endArrow }))
              }
              title="Seta no fim"
            >
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="drafts-fm-sep" />

          <button
            type="button"
            className="drafts-fm-btn danger"
            onClick={handleDeleteSelected}
            title="Excluir conector (Delete)"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Área Expansível do Quadro Branco */}
      <div
        ref={canvasViewportRef}
        data-draft-canvas-bg="true"
        className={`drafts-canvas-viewport ${cursorClass}`}
        style={canvasBackgroundStyle}
        onMouseDown={handleCanvasMouseDown}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= 4) {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
              const factor = e.deltaY < 0 ? 1.1 : 0.9;
              applyZoomAtPoint(viewport.zoom * factor, e.clientX, e.clientY);
            } else {
              commitDraftsState({
                ...stateRef.current,
                viewport: {
                  ...viewport,
                  x: Math.round(viewport.x - e.deltaX),
                  y: Math.round(viewport.y - e.deltaY),
                },
              });
            }
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            const wPt = screenToWorld(e.clientX, e.clientY);
            Array.from(e.dataTransfer.files).forEach((f, idx) => {
              if (f.type.startsWith('image/')) {
                insertImageFile(f, { x: wPt.x + idx * 24, y: wPt.y + idx * 24 });
              }
            });
          }
        }}
      >
        {/* Camada Mundo Transformada por Pan & Zoom */}
        <div
          className="drafts-world-layer"
          data-draft-canvas-bg="true"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          }}
        >
          {/* Camada SVG de Linhas e Conectores */}
          <svg className="drafts-connectors-svg" width="8000" height="8000" viewBox="-4000 -4000 8000 8000">
            <defs>
              {CONNECTOR_COLORS.map((color) => {
                const key = color.replace('#', '');
                return (
                  <marker
                    key={key}
                    id={`draft-arrow-${key}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
                  </marker>
                );
              })}
            </defs>

            {connectors.map((conn) => {
              const { from, to } = getResolvedConnectorCoords(conn);
              const isSelected = selectedConnectorId === conn.id;
              const markerKey = (conn.color || '#334155').replace('#', '');
              const markerId = `url(#draft-arrow-${CONNECTOR_COLORS.includes(conn.color) ? markerKey : '334155'})`;

              return (
                <g key={conn.id}>
                  {/* Linha visível */}
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={isSelected ? '#2563eb' : conn.color || '#334155'}
                    strokeWidth={(conn.strokeWidth || 2) + (isSelected ? 1 : 0)}
                    strokeDasharray={conn.dashed ? '7 5' : undefined}
                    markerStart={conn.startArrow ? markerId : undefined}
                    markerEnd={conn.endArrow ? markerId : undefined}
                    strokeLinecap="round"
                  />
                  {/* Área de clique ampla transparente */}
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="transparent"
                    strokeWidth={16}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      flushActiveTextEdit();
                      setSelectedConnectorId(conn.id);
                      setSelectedElementId(null);
                    }}
                  />

                  {/* Alças de extremidade quando o conector está selecionado */}
                  {isSelected && (
                    <>
                      <circle
                        cx={from.x}
                        cy={from.y}
                        r={6}
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth={2}
                        style={{ cursor: 'grab', pointerEvents: 'all' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          interactionRef.current = {
                            kind: 'reconnect',
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                            startPanX: viewport.x,
                            startPanY: viewport.y,
                            connectorId: conn.id,
                            connectorEnd: 'from',
                            initialSnapshot: {
                              elements: stateRef.current.elements,
                              connectors: stateRef.current.connectors,
                            },
                            hasMutated: false,
                          };
                          setIsInteracting(true);
                        }}
                      />
                      <circle
                        cx={to.x}
                        cy={to.y}
                        r={6}
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth={2}
                        style={{ cursor: 'grab', pointerEvents: 'all' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          interactionRef.current = {
                            kind: 'reconnect',
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                            startPanX: viewport.x,
                            startPanY: viewport.y,
                            connectorId: conn.id,
                            connectorEnd: 'to',
                            initialSnapshot: {
                              elements: stateRef.current.elements,
                              connectors: stateRef.current.connectors,
                            },
                            hasMutated: false,
                          };
                          setIsInteracting(true);
                        }}
                      />
                    </>
                  )}
                </g>
              );
            })}

            {/* Conector temporário durante arraste */}
            {connectorDraft && (
              <>
                <line
                  x1={connectorDraft.fromPoint.x}
                  y1={connectorDraft.fromPoint.y}
                  x2={connectorDraft.toPoint.x}
                  y2={connectorDraft.toPoint.y}
                  stroke="#2563eb"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  markerEnd="url(#draft-arrow-2563eb)"
                />
                {connectorDraft.snapTarget && (
                  <circle
                    cx={connectorDraft.snapTarget.point.x}
                    cy={connectorDraft.snapTarget.point.y}
                    r={7}
                    fill="rgba(37, 99, 235, 0.25)"
                    stroke="#2563eb"
                    strokeWidth={2}
                  />
                )}
              </>
            )}
          </svg>

          {/* Elementos do Quadro (Post-its, Formas, Textos e Imagens) */}
          {sortedElements.map((el) => {
            const isSelected = selectedElementId === el.id;
            const isEditing = editingElementId === el.id;
            const tStyle = el.textStyle || { fontSize: 15, textAlign: 'center', textColor: '#0f172a' };

            const textDecorations: string[] = [];
            if (tStyle.underline) textDecorations.push('underline');
            if (tStyle.strikethrough) textDecorations.push('line-through');

            const textCss: React.CSSProperties = {
              fontSize: `${tStyle.fontSize || 15}px`,
              fontWeight: tStyle.bold ? 700 : 400,
              fontStyle: tStyle.italic ? 'italic' : 'normal',
              textDecoration: textDecorations.length > 0 ? textDecorations.join(' ') : 'none',
              textAlign: tStyle.textAlign || 'center',
              color: tStyle.textColor || '#0f172a',
            };

            return (
              <div
                key={el.id}
                className={`drafts-element drafts-el-${el.type} ${isSelected ? 'selected' : ''} ${
                  isEditing ? 'editing' : ''
                }`}
                style={{
                  left: `${el.x}px`,
                  top: `${el.y}px`,
                  width: `${el.width}px`,
                  height: `${el.height}px`,
                  zIndex: el.zIndex || 1,
                }}
                onMouseDown={(e) => handleElementMouseDown(e, el)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (el.type !== 'image') {
                    setSelectedElementId(el.id);
                    setSelectedConnectorId(null);
                    startEditingElement(el.id);
                  }
                }}
              >
                {/* Renderização específica do tipo de elemento */}
                {el.type === 'sticky' && (
                  <div className="drafts-sticky-surface" style={{ backgroundColor: el.fillColor }}>
                    <RichTextEditable
                      elementId={el.id}
                      htmlContent={el.htmlContent || ''}
                      isEditing={isEditing}
                      style={textCss}
                      registerRef={registerEditableRef}
                      onInputChange={handleRichTextInput}
                      onCommit={flushActiveTextEdit}
                    />
                  </div>
                )}

                {el.type === 'text' && (
                  <div className="drafts-text-surface">
                    <RichTextEditable
                      elementId={el.id}
                      htmlContent={el.htmlContent || ''}
                      isEditing={isEditing}
                      className="text-mode"
                      style={textCss}
                      registerRef={registerEditableRef}
                      onInputChange={handleRichTextInput}
                      onCommit={flushActiveTextEdit}
                    />
                  </div>
                )}

                {el.type === 'shape' && (
                  <div className="drafts-shape-surface">
                    <svg
                      className="drafts-shape-svg"
                      viewBox={`0 0 ${Math.max(10, el.width)} ${Math.max(10, el.height)}`}
                      preserveAspectRatio="none"
                    >
                      {el.shapeKind === 'triangle' ? (
                        <polygon
                          points={`${el.width / 2},3 ${el.width - 3},${el.height - 3} 3,${el.height - 3}`}
                          fill={el.fillColor || '#ffffff'}
                          stroke={el.strokeColor || '#0E2841'}
                          strokeWidth={el.strokeWidth || 2}
                          strokeLinejoin="round"
                        />
                      ) : el.shapeKind === 'ellipse' ? (
                        <ellipse
                          cx={el.width / 2}
                          cy={el.height / 2}
                          rx={Math.max(2, el.width / 2 - 2)}
                          ry={Math.max(2, el.height / 2 - 2)}
                          fill={el.fillColor || '#ffffff'}
                          stroke={el.strokeColor || '#0E2841'}
                          strokeWidth={el.strokeWidth || 2}
                        />
                      ) : (
                        <rect
                          x={2}
                          y={2}
                          width={Math.max(4, el.width - 4)}
                          height={Math.max(4, el.height - 4)}
                          rx={8}
                          fill={el.fillColor || '#ffffff'}
                          stroke={el.strokeColor || '#0E2841'}
                          strokeWidth={el.strokeWidth || 2}
                        />
                      )}
                    </svg>
                    <div className="drafts-shape-text-overlay">
                      <RichTextEditable
                        elementId={el.id}
                        htmlContent={el.htmlContent || ''}
                        isEditing={isEditing}
                        style={textCss}
                        registerRef={registerEditableRef}
                        onInputChange={handleRichTextInput}
                        onCommit={flushActiveTextEdit}
                      />
                    </div>
                  </div>
                )}

                {el.type === 'image' && (
                  <div className="drafts-image-surface">
                    {resolvedImageUrls[el.id] || el.imageUrl ? (
                      <img
                        src={resolvedImageUrls[el.id] || el.imageUrl}
                        alt={el.imageName || 'Imagem no Drafts'}
                        className="drafts-image-tag"
                        draggable={false}
                      />
                    ) : (
                      <div className="drafts-image-loading">
                        <Loader2 size={18} className="spin-icon" />
                        <span>Carregando...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Caixa de Contorno (Bounding Box) + Alças de Redimensionamento + 4 Pontos de Ancoragem (Estilo Miro) */}
                {isSelected && (
                  <div className="drafts-bbox">
                    <div
                      className="drafts-resize-handle nw"
                      onMouseDown={(e) => handleStartResize(e, el, 'nw')}
                      title="Redimensionar"
                    />
                    <div
                      className="drafts-resize-handle ne"
                      onMouseDown={(e) => handleStartResize(e, el, 'ne')}
                      title="Redimensionar"
                    />
                    <div
                      className="drafts-resize-handle sw"
                      onMouseDown={(e) => handleStartResize(e, el, 'sw')}
                      title="Redimensionar"
                    />
                    <div
                      className="drafts-resize-handle se"
                      onMouseDown={(e) => handleStartResize(e, el, 'se')}
                      title="Redimensionar (Segure Shift para manter proporção)"
                    />

                    {/* 4 Pontos Azuis de Conexão estilo Miro */}
                    <button
                      type="button"
                      className="drafts-anchor-dot top"
                      onMouseDown={(e) => handleStartAnchorConnect(e, el, 'top')}
                      title="Arraste para conectar a outro elemento"
                    />
                    <button
                      type="button"
                      className="drafts-anchor-dot right"
                      onMouseDown={(e) => handleStartAnchorConnect(e, el, 'right')}
                      title="Arraste para conectar a outro elemento"
                    />
                    <button
                      type="button"
                      className="drafts-anchor-dot bottom"
                      onMouseDown={(e) => handleStartAnchorConnect(e, el, 'bottom')}
                      title="Arraste para conectar a outro elemento"
                    />
                    <button
                      type="button"
                      className="drafts-anchor-dot left"
                      onMouseDown={(e) => handleStartAnchorConnect(e, el, 'left')}
                      title="Arraste para conectar a outro elemento"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pílula Inferior Direita: Controles de Zoom & Enquadramento (Estilo Miro) */}
      <div className="drafts-zoom-pill">
        <button
          type="button"
          className="drafts-zoom-btn"
          onClick={handleFitView}
          title="Enquadrar todos os elementos na tela"
        >
          <Maximize2 size={14} />
        </button>
        <div className="drafts-fm-sep" />
        <button
          type="button"
          className="drafts-zoom-btn"
          onClick={() => applyZoomAtPoint(viewport.zoom - 0.15)}
          title="Diminuir zoom (-)"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="drafts-zoom-percent-btn"
          onClick={() => applyZoomAtPoint(1)}
          title="Redefinir zoom para 100%"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          type="button"
          className="drafts-zoom-btn"
          onClick={() => applyZoomAtPoint(viewport.zoom + 0.15)}
          title="Aumentar zoom (+)"
        >
          <Plus size={14} />
        </button>
        <div className="drafts-fm-sep" />
        <button
          type="button"
          className="drafts-zoom-btn"
          onClick={() => applyZoomAtPoint(viewport.zoom + 0.25)}
          title="Zoom rápido +"
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="drafts-zoom-btn"
          onClick={() => applyZoomAtPoint(viewport.zoom - 0.25)}
          title="Zoom rápido -"
        >
          <ZoomOut size={14} />
        </button>
      </div>
    </div>
  );
};
