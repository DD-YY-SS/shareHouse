import { React } from '../shared.js';

const MAP_WIDTH = 384;
const MAP_HEIGHT = 256;
const CELL = 16;
const STORAGE_KEY = 'cm-pixel-office-layout-v2';

const DEFAULT_ROOMMATES = [
  { id: 'minji', name: '민지', status: 'FOCUS', message: '집중 중' },
  { id: 'jiyeon', name: '지연', status: 'AVAILABLE', message: '대화 가능' },
];

const TOOLS = [
  { id: 'select', label: '이동' },
  { id: 'floor', label: '바닥' },
  { id: 'floorDark', label: '어두운 바닥' },
  { id: 'wall', label: '벽' },
  { id: 'rug', label: '러그' },
  { id: 'empty', label: '지우개' },
];

const OBJECT_TYPES = [
  { type: 'desk', name: '생활 협약서 책상', actionType: 'desk', w: 64, h: 32 },
  { type: 'computerDesk', name: '컴퓨터 책상', actionType: 'furniture', w: 64, h: 48 },
  { type: 'sofa', name: '공용 소파', actionType: 'settlement', w: 64, h: 32 },
  { type: 'bed', name: '침대', actionType: 'bed', w: 32, h: 48 },
  { type: 'shelf', name: '책장', actionType: 'furniture', w: 64, h: 32 },
  { type: 'plant', name: '화분', actionType: 'furniture', w: 24, h: 32 },
  { type: 'kitchen', name: '공동 주방 · ㄱ자', actionType: 'settlement', w: 96, h: 64 },
  { type: 'door', name: '문 · 세로', actionType: 'furniture', w: 16, h: 32 },
  { type: 'doorHorizontal', name: '문 · 가로', actionType: 'furniture', w: 32, h: 16 },
  { type: 'tv', name: 'TV', actionType: 'furniture', w: 48, h: 32 },
  { type: 'toilet', name: '변기', actionType: 'furniture', w: 24, h: 32 },
  { type: 'sink', name: '세면대', actionType: 'furniture', w: 32, h: 24 },
  { type: 'shower', name: '샤워실', actionType: 'furniture', w: 48, h: 48 },
  { type: 'dispenser', name: '정수기', actionType: 'furniture', w: 24, h: 48 },
  { type: 'painting', name: '풍경 액자', actionType: 'furniture', w: 48, h: 24 },
  { type: 'clock', name: '벽시계', actionType: 'furniture', w: 24, h: 24 },
  { type: 'boxes', name: '상자 더미', actionType: 'furniture', w: 48, h: 32 },
];

export default function RoomLoungeMap({ roommates = DEFAULT_ROOMMATES, onInteract }) {
  const canvasRef = React.useRef(null);
  const stageRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const paintingRef = React.useRef(false);
  const dragRef = React.useRef(null);
  const [editorMode] = React.useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mapEditor') === 'true');
  const [tool, setTool] = React.useState('select');
  const [layout, setLayout] = React.useState(() => readLayout());
  const [notice, setNotice] = React.useState('');

  const people = DEFAULT_ROOMMATES.map((fallback, index) => ({
    ...fallback,
    ...(roommates[index] || {}),
  }));

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    drawLayout(context, layout);
  }, [layout]);

  const showNotice = React.useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 1800);
  }, []);

  const paintAt = React.useCallback((event) => {
    if (tool === 'select') return;
    const point = eventPoint(event, stageRef.current);
    const x = snap(point.x);
    const y = snap(point.y);
    const key = `${x}:${y}`;
    setLayout((current) => ({
      ...current,
      tiles: [...current.tiles.filter((tile) => `${tile.x}:${tile.y}` !== key), { x, y, type: tool }],
    }));
  }, [tool]);

  const handlePointerDown = (event) => {
    if (!editorMode || tool === 'select') return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    paintingRef.current = true;
    paintAt(event);
  };

  const handlePointerMove = (event) => {
    if (!editorMode) return;
    if (paintingRef.current) {
      paintAt(event);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const point = eventPoint(event, stageRef.current);
    setLayout((current) => {
      if (drag.kind === 'agent') {
        return {
          ...current,
          agents: current.agents.map((agent) => agent.id === drag.id
            ? { ...agent, x: clamp(snap(point.x - drag.dx), CELL, MAP_WIDTH - CELL), y: clamp(snap(point.y - drag.dy), CELL, MAP_HEIGHT - CELL) }
            : agent),
        };
      }
      return {
        ...current,
        objects: current.objects.map((object) => object.id === drag.id
          ? { ...object, x: clamp(snap(point.x - drag.dx), 0, MAP_WIDTH - object.w), y: clamp(snap(point.y - drag.dy), 0, MAP_HEIGHT - object.h) }
          : object),
      };
    });
  };

  const stopPointerAction = () => {
    paintingRef.current = false;
    dragRef.current = null;
  };

  const beginDrag = (event, kind, item) => {
    if (!editorMode) return;
    event.preventDefault();
    event.stopPropagation();
    if (tool === 'empty' && kind === 'object') {
      setLayout((current) => ({ ...current, objects: current.objects.filter((object) => object.id !== item.id) }));
      return;
    }
    if (tool !== 'select') return;
    const point = eventPoint(event, stageRef.current);
    dragRef.current = { kind, id: item.id, dx: point.x - item.x, dy: point.y - item.y };
  };

  const addObject = (preset) => {
    const id = `${preset.type}-${Date.now()}`;
    setLayout((current) => ({
      ...current,
      objects: [...current.objects, { ...preset, id, x: 160, y: 112 }],
    }));
    setTool('select');
  };

  const saveLayout = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    showNotice('이 브라우저에 저장했어요.');
  };

  const resetLayout = () => {
    const next = createDefaultLayout();
    setLayout(next);
    localStorage.removeItem(STORAGE_KEY);
    showNotice('기본 맵으로 되돌렸어요.');
  };

  const exportLayout = () => {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'checkmate-lounge-map.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice('JSON 파일을 내보냈어요.');
  };

  const importLayout = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = normalizeLayout(JSON.parse(String(reader.result)));
        setLayout(next);
        showNotice('맵 파일을 불러왔어요.');
      } catch {
        showNotice('올바른 맵 JSON 파일이 아니에요.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return <div className={`pixel-map-shell${editorMode ? ' is-editor' : ''}`}>
    {editorMode && <EditorToolbar
      tool={tool}
      notice={notice}
      onTool={setTool}
      onAddObject={addObject}
      onSave={saveLayout}
      onReset={resetLayout}
      onExport={exportLayout}
      onImport={() => fileRef.current?.click()}
    />}
    <input ref={fileRef} className="pixel-editor-file" type="file" accept="application/json" onChange={importLayout}/>
    <div
      ref={stageRef}
      className={`pixel-office${editorMode ? ` editing tool-${tool}` : ''}`}
      role="application"
      aria-label={editorMode ? '체크메이트 픽셀 라운지 편집기' : '체크메이트 픽셀 라운지'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPointerAction}
      onPointerCancel={stopPointerAction}
      onPointerLeave={stopPointerAction}
    >
      <canvas ref={canvasRef} className="pixel-office-canvas" width={MAP_WIDTH} height={MAP_HEIGHT} aria-hidden="true"/>
      {editorMode && <div className="pixel-editor-grid" aria-hidden="true"/>}
      <div className="pixel-office-hotspots">
        {layout.objects.map((object) => <MapObject
          key={object.id}
          object={object}
          editorMode={editorMode}
          onPointerDown={(event) => beginDrag(event, 'object', object)}
        />)}
      </div>
      <div className="pixel-office-agents">
        {layout.agents.map((agent, index) => <Agent
          key={agent.id}
          agent={agent}
          person={people.find((person) => person.id === agent.id) || people[index] || DEFAULT_ROOMMATES[index]}
          variant={index === 0 ? 'minji' : 'jiyeon'}
          editorMode={editorMode}
          onPointerDown={(event) => beginDrag(event, 'agent', agent)}
          onInteract={onInteract}
        />)}
      </div>
      {editorMode && <div className="pixel-editor-hint">16px GRID · {tool === 'select' ? '가구와 캐릭터를 드래그하세요' : '드래그해서 칠하세요'}</div>}
    </div>
  </div>;
}

function EditorToolbar({ tool, notice, onTool, onAddObject, onSave, onReset, onExport, onImport }) {
  return <section className="pixel-editor-toolbar" aria-label="맵 편집 도구">
    <div className="pixel-editor-heading"><div><strong>라운지 맵 편집기</strong><small>16px 타일을 직접 칠하고 배치하세요.</small></div>{notice && <span>{notice}</span>}</div>
    <div className="pixel-editor-row"><b>도구</b>{TOOLS.map((item) => <button key={item.id} className={tool === item.id ? 'active' : ''} onClick={() => onTool(item.id)}>{item.label}</button>)}</div>
    <div className="pixel-editor-row"><b>가구 추가</b>{OBJECT_TYPES.map((item) => <button key={item.type} onClick={() => onAddObject(item)}>{item.name.replace('생활 협약서 ', '').replace('공동 ', '')}</button>)}</div>
    <div className="pixel-editor-actions"><button className="primary" onClick={onSave}>저장</button><button onClick={onExport}>JSON 내보내기</button><button onClick={onImport}>JSON 불러오기</button><button onClick={onReset}>초기화</button></div>
  </section>;
}

function MapObject({ object, editorMode, onPointerDown }) {
  const style = {
    left: `${object.x / MAP_WIDTH * 100}%`,
    top: `${object.y / MAP_HEIGHT * 100}%`,
    width: `${object.w / MAP_WIDTH * 100}%`,
    height: `${object.h / MAP_HEIGHT * 100}%`,
  };
  return <div
    className={`pixel-hotspot object-${object.type}${editorMode ? ' editable' : ''}`}
    style={style}
    onPointerDown={onPointerDown}
    role={editorMode ? 'button' : undefined}
    aria-label={editorMode ? `${object.name} 이동` : undefined}
  ><span>{editorMode ? `↕ ${object.name}` : ''}</span></div>;
}

function Agent({ agent, person, variant, editorMode, onPointerDown, onInteract }) {
  const state = statusInfo(person?.status);
  const message = person?.message || state.label;
  return <button
    type="button"
    className={`pixel-agent agent-${variant} status-${state.key}${editorMode ? ' editable' : ''}`}
    style={{ left: `${agent.x / MAP_WIDTH * 100}%`, top: `${agent.y / MAP_HEIGHT * 100}%` }}
    onPointerDown={onPointerDown}
    onClick={() => !editorMode && onInteract?.({ type: 'character', ...person, message, statusKey: state.key, statusLabel: state.label, statusIcon: state.icon })}
    aria-label={`${person?.name || variant}: ${message}`}
  >
    <img src={person?.id === 'jiyeon' || variant === 'jiyeon' ? '/jiyeon-cutout.png' : '/minji-avatar.png'} alt="" draggable="false"/>
  </button>;
}

function createDefaultLayout() {
  const tiles = expandTileRuns({
    wall: [[0,0,368],[0,16,0],[96,16,96],[240,16,240],[368,16,368],[0,32,0],[96,32,96],[368,32,368],[0,48,0],[96,48,96],[368,48,368],[0,64,0],[32,64,96],[240,64,240],[368,64,368],[0,80,0],[240,80,240],[368,80,368],[0,96,0],[240,96,240],[368,96,368],[0,112,0],[240,112,368],[0,128,0],[240,128,240],[368,128,368],[0,144,0],[368,144,368],[0,160,0],[368,160,368],[0,176,0],[64,176,64],[240,176,240],[368,176,368],[0,192,0],[64,192,64],[240,192,240],[368,192,368],[0,208,0],[64,208,64],[240,208,240],[368,208,368],[0,224,0],[64,224,64],[240,224,240],[368,224,368],[0,240,0],[64,240,368]],
    floor: [[112,16,224],[112,32,224],[16,48,16],[112,48,224],[16,64,16],[112,64,224],[16,80,224],[16,96,224],[16,112,224],[16,128,224],[16,144,224],[16,160,224],[16,176,48],[80,176,224],[16,192,48],[80,192,224],[16,208,48],[80,208,224],[16,224,48],[80,224,224]],
    floorDark: [[16,16,80],[16,32,80],[240,32,240],[32,48,80],[240,48,240],[256,80,304],[256,96,304],[256,128,352],[240,144,352],[240,160,352],[256,176,352],[256,192,352],[256,208,352],[256,224,352],[16,240,48]],
    rug: [[256,16,352],[256,32,352],[256,48,352],[256,64,352],[320,80,352],[320,96,352]],
    empty: [],
  });
  return {
    version: 1,
    tiles,
    objects: [
      { id: 'plant-1', type: 'plant', name: '거실 화분', actionType: 'furniture', x: 176, y: 208, w: 24, h: 32 },
      { id: 'bed-1', type: 'bed', name: '민지 침대', actionType: 'bed', x: 336, y: 48, w: 32, h: 48 },
      { id: 'bed-2', type: 'bed', name: '지연 침대', actionType: 'bed', x: 336, y: 192, w: 32, h: 48 },
      { id: 'shelf-1', type: 'shelf', name: '책장', actionType: 'furniture', x: 256, y: 80, w: 64, h: 32 },
      { id: 'shelf-2', type: 'shelf', name: '책장', actionType: 'furniture', x: 256, y: 128, w: 64, h: 32 },
      { id: 'sofa-1', type: 'sofa', name: '공용 소파', actionType: 'settlement', x: 80, y: 176, w: 64, h: 32 },
      { id: 'plant-2', type: 'plant', name: '화분', actionType: 'furniture', x: 96, y: 208, w: 24, h: 32 },
      { id: 'kitchen-1', type: 'kitchen', name: '공동 주방', actionType: 'settlement', x: 112, y: 16, w: 96, h: 64 },
      { id: 'tv-1', type: 'tv', name: 'TV', actionType: 'furniture', x: 128, y: 208, w: 48, h: 32 },
      { id: 'door-1', type: 'door', name: '문', actionType: 'furniture', x: 240, y: 32, w: 16, h: 32 },
      { id: 'door-2', type: 'door', name: '문', actionType: 'furniture', x: 240, y: 144, w: 16, h: 32 },
      { id: 'door-3', type: 'door', name: '문', actionType: 'furniture', x: 16, y: 48, w: 16, h: 32 },
      { id: 'toilet-1', type: 'toilet', name: '변기', actionType: 'furniture', x: 64, y: 32, w: 24, h: 32 },
      { id: 'sink-1', type: 'sink', name: '세면대', actionType: 'furniture', x: 16, y: 16, w: 32, h: 24 },
      { id: 'shower-1', type: 'shower', name: '샤워실', actionType: 'furniture', x: 16, y: 208, w: 48, h: 48 },
      { id: 'sofa-2', type: 'sofa', name: '공용 소파', actionType: 'settlement', x: 160, y: 176, w: 64, h: 32 },
      { id: 'clock-1', type: 'clock', name: '벽시계', actionType: 'furniture', x: 336, y: 112, w: 24, h: 24 },
      { id: 'clock-2', type: 'clock', name: '벽시계', actionType: 'furniture', x: 336, y: 0, w: 24, h: 24 },
      { id: 'painting-1', type: 'painting', name: '풍경 액자', actionType: 'furniture', x: 288, y: 0, w: 48, h: 24 },
      { id: 'boxes-1', type: 'boxes', name: '상자 더미', actionType: 'furniture', x: 32, y: 144, w: 48, h: 32 },
      { id: 'dispenser-1', type: 'dispenser', name: '정수기', actionType: 'furniture', x: 208, y: 16, w: 24, h: 48 },
    ],
    agents: [{ id: 'minji', x: 352, y: 80 }, { id: 'jiyeon', x: 352, y: 224 }],
  };
}

function expandTileRuns(groups) {
  return Object.entries(groups).flatMap(([type, runs]) => runs.flatMap(([start, y, end]) => {
    const tiles = [];
    for (let x = start; x <= end; x += CELL) tiles.push({ x, y, type });
    return tiles;
  }));
}

function normalizeLayout(input) {
  const fallback = createDefaultLayout();
  if (!input || !Array.isArray(input.tiles) || !Array.isArray(input.objects) || !Array.isArray(input.agents)) return fallback;
  return {
    version: 1,
    tiles: input.tiles.filter(validTile).map((tile) => ({ x: clamp(snap(tile.x), 0, MAP_WIDTH - CELL), y: clamp(snap(tile.y), 0, MAP_HEIGHT - CELL), type: tile.type })),
    objects: input.objects.filter((item) => item && typeof item.id === 'string').map((item) => {
      const object = { ...item, x: Number(item.x) || 0, y: Number(item.y) || 0, w: Number(item.w) || 32, h: Number(item.h) || 32 };
      if (object.type === 'kitchen') {
        object.w = 96;
        object.h = 64;
        object.y = Math.min(object.y, MAP_HEIGHT - object.h);
      }
      return object;
    }),
    agents: input.agents.filter((item) => item && typeof item.id === 'string').map((item) => ({ id: item.id, x: Number(item.x) || CELL, y: Number(item.y) || CELL })),
  };
}

function readLayout() {
  if (typeof window === 'undefined') return createDefaultLayout();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeLayout(JSON.parse(stored)) : createDefaultLayout();
  } catch {
    return createDefaultLayout();
  }
}

function validTile(tile) {
  return tile && Number.isFinite(Number(tile.x)) && Number.isFinite(Number(tile.y)) && ['floor', 'floorDark', 'wall', 'rug', 'empty'].includes(tile.type);
}

function replaceTile(tiles, x, y, type) {
  const index = tiles.findIndex((tile) => tile.x === x && tile.y === y);
  if (index >= 0) tiles[index] = { x, y, type };
}

function drawLayout(context, layout) {
  context.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  context.fillStyle = '#080b12';
  context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  const tileMap = new Map(layout.tiles.map((tile) => [`${tile.x}:${tile.y}`, tile.type]));
  layout.tiles.filter((tile) => tile.type === 'floor' || tile.type === 'floorDark').forEach((tile) => drawFloorTile(context, tile, tileMap));
  layout.tiles.filter((tile) => tile.type === 'rug').forEach((tile) => drawRugTile(context, tile, tileMap));
  layout.tiles.filter((tile) => tile.type === 'wall').forEach((tile) => drawWallTile(context, tile, tileMap));
  [...layout.objects].sort((a, b) => (a.y + a.h) - (b.y + b.h)).forEach((object) => drawObject(context, object));
}

function drawFloorTile(context, tile, tileMap) {
  const { x, y, type } = tile;
  context.fillStyle = type === 'floorDark' ? '#7d5237' : '#a87345';
  context.fillRect(x, y, CELL, CELL);

  // Wood boards continue through adjacent cells. Only plank seams remain.
  context.fillStyle = type === 'floorDark' ? '#63402e' : '#8d5c39';
  if (sameTile(tileMap, x, y, 0, 1, type)) context.fillRect(x, y + CELL - 1, CELL, 1);
  const row = y / CELL;
  const column = x / CELL;
  if ((column + (row % 2 ? 1 : 0)) % 4 === 3 && sameTile(tileMap, x, y, 1, 0, type)) context.fillRect(x + CELL - 1, y, 1, CELL);
  // A threshold is drawn only where another material begins.
  context.fillStyle = '#513429';
  if (!isFloor(tileMap.get(`${x - CELL}:${y}`))) context.fillRect(x, y, 1, CELL);
  if (!isFloor(tileMap.get(`${x + CELL}:${y}`))) context.fillRect(x + CELL - 1, y, 1, CELL);
  if (!isFloor(tileMap.get(`${x}:${y - CELL}`))) context.fillRect(x, y, CELL, 1);
  if (!isFloor(tileMap.get(`${x}:${y + CELL}`))) context.fillRect(x, y + CELL - 1, CELL, 1);
}

function drawRugTile(context, tile, tileMap) {
  const { x, y } = tile;
  context.fillStyle = '#743b52';
  context.fillRect(x, y, CELL, CELL);
  context.fillStyle = '#96566d';
  if (((x + y) / CELL) % 2 === 0) context.fillRect(x + 6, y + 6, 3, 3);

  // Connected rug cells share one outer border instead of separate boxes.
  context.fillStyle = '#d8a96b';
  if (!sameTile(tileMap, x, y, 0, -1, 'rug')) context.fillRect(x, y, CELL, 2);
  if (!sameTile(tileMap, x, y, 0, 1, 'rug')) context.fillRect(x, y + CELL - 2, CELL, 2);
  if (!sameTile(tileMap, x, y, -1, 0, 'rug')) context.fillRect(x, y, 2, CELL);
  if (!sameTile(tileMap, x, y, 1, 0, 'rug')) context.fillRect(x + CELL - 2, y, 2, CELL);
}

function drawWallTile(context, tile, tileMap) {
  const { x, y } = tile;
  const down = sameTile(tileMap, x, y, 0, 1, 'wall');
  const left = sameTile(tileMap, x, y, -1, 0, 'wall');
  const right = sameTile(tileMap, x, y, 1, 0, 'wall');

  context.fillStyle = '#3a2521';
  context.fillRect(x, y, CELL, CELL);

  // Keep walls dark and continuous; only exposed outer edges receive a darker cap.
  if (!down) { context.fillStyle = '#160e0d'; context.fillRect(x, y + CELL - 4, CELL, 4); }
  if (!left) { context.fillStyle = '#211512'; context.fillRect(x, y, 3, CELL); }
  if (!right) { context.fillStyle = '#211512'; context.fillRect(x + CELL - 3, y, 3, CELL); }
}

function sameTile(tileMap, x, y, dx, dy, type) {
  return tileMap.get(`${x + dx * CELL}:${y + dy * CELL}`) === type;
}

function isFloor(type) {
  return type === 'floor' || type === 'floorDark';
}

function drawObject(context, object) {
  const { x, y, w, h, type } = object;
  if (type === 'computerDesk') {
    // Compact pixel workstation: desk, drawers, monitor, keyboard and mouse.
    pixelRect(context, x, y + 16, w, h - 19, '#2d1c18', '#895333');
    context.fillStyle = '#a9693d'; context.fillRect(x + 3, y + 18, w - 6, 5);
    context.fillStyle = '#4f3023'; context.fillRect(x + 7, y + h - 15, 13, 10);
    context.fillRect(x + w - 20, y + h - 15, 13, 10);
    context.fillStyle = '#c68448'; context.fillRect(x + 10, y + h - 12, 5, 2);
    context.fillRect(x + w - 17, y + h - 12, 5, 2);
    context.fillStyle = '#171a20'; context.fillRect(x + 18, y + 3, 27, 17);
    context.fillStyle = '#789da3'; context.fillRect(x + 21, y + 6, 21, 10);
    context.fillStyle = '#bfced0'; context.fillRect(x + 29, y + 20, 5, 3);
    context.fillStyle = '#20272a'; context.fillRect(x + 24, y + 24, 22, 5);
    context.fillStyle = '#d9bd76'; context.fillRect(x + 27, y + 26, 13, 2);
    context.fillStyle = '#1d2023'; context.fillRect(x + 49, y + 25, 5, 5);
    context.fillStyle = '#c99552'; context.fillRect(x + 50, y + 26, 3, 2);
  } else if (type === 'desk') {
    pixelRect(context, x, y + 5, w, h - 8, '#3a271f', '#875638');
    context.fillStyle = '#151a21'; context.fillRect(x + 12, y, 24, 15);
    context.fillStyle = '#7cc2ca'; context.fillRect(x + 15, y + 3, 18, 8);
    context.fillStyle = '#e5c17b'; context.fillRect(x + w - 17, y + 6, 8, 8);
  } else if (type === 'sofa') {
    pixelRect(context, x, y, w, h, '#352522', '#526d68');
    context.fillStyle = '#75948b'; context.fillRect(x + 6, y + 5, w - 12, 10);
    context.fillStyle = '#2d4542'; context.fillRect(x + 7, y + h - 8, w - 14, 4);
  } else if (type === 'bed') {
    pixelRect(context, x, y, w, h, '#362723', '#8ca5ad');
    context.fillStyle = '#d9e6df'; context.fillRect(x + 4, y + 4, w - 8, 12);
    context.fillStyle = '#557a86'; context.fillRect(x + 4, y + 18, w - 8, h - 22);
  } else if (type === 'shelf') {
    pixelRect(context, x, y, w, h, '#2b1c18', '#61402c');
    const colors = ['#c98262', '#d4b66e', '#72968d', '#9c6c91'];
    for (let px = x + 6, index = 0; px < x + w - 5; px += 6, index += 1) {
      context.fillStyle = colors[index % colors.length]; context.fillRect(px, y + 6, 4, 18);
    }
  } else if (type === 'plant') {
    context.fillStyle = '#2d4d35'; context.fillRect(x + 8, y + 3, 7, 18);
    context.fillRect(x + 2, y + 6, 8, 6); context.fillRect(x + 13, y, 8, 7);
    context.fillStyle = '#9a5d3d'; context.fillRect(x + 5, y + h - 11, w - 10, 9);
  } else if (type === 'kitchen') {
    // L-shaped kitchen: long back counter + short left counter.
    const counter = 16;
    pixelRect(context, x, y, w, counter, '#27302f', '#596966');
    pixelRect(context, x, y, counter, h, '#27302f', '#596966');
    context.fillStyle = '#9bb1ac'; context.fillRect(x + 5, y + 4, w - 10, 5);
    context.fillRect(x + 4, y + 5, 6, h - 10);

    // Dishwashing sink and faucet on the long counter.
    context.fillStyle = '#1d2827'; context.fillRect(x + 31, y + 3, 25, 10);
    context.fillStyle = '#a9c6c0'; context.fillRect(x + 35, y + 5, 17, 5);
    context.fillStyle = '#d4b66e'; context.fillRect(x + 55, y + 1, 2, 7);
    context.fillRect(x + 55, y + 1, 7, 2);

    // Hob, frying pan and pot.
    context.fillStyle = '#1d2827'; context.fillRect(x + 68, y + 3, 21, 9);
    context.fillStyle = '#ba6d42'; context.fillRect(x + 73, y + 5, 8, 4);
    context.fillStyle = '#151a1a'; context.fillRect(x + 20, y + 26, 14, 11);
    context.fillStyle = '#7f9792'; context.fillRect(x + 23, y + 28, 8, 6);
    context.fillStyle = '#151a1a'; context.fillRect(x + 34, y + 29, 12, 3);

    // Lower cabinets and handles along both legs.
    context.fillStyle = '#344441';
    context.fillRect(x + 19, y + 19, w - 22, h - 22);
    context.fillRect(x + 19, y + 19, 20, h - 22);
    context.fillStyle = '#91aaa2';
    for (let px = x + 25; px < x + w - 12; px += 20) context.fillRect(px, y + h - 14, 4, 2);
    for (let py = y + 28; py < y + h - 10; py += 13) context.fillRect(x + 28, py, 3, 2);
  } else if (type === 'door' || type === 'doorHorizontal') {
    context.fillStyle = '#241713'; context.fillRect(x, y, w, h);
    context.fillStyle = '#70442d'; context.fillRect(x + 3, y + 3, w - 6, h - 6);
    context.fillStyle = '#a56c43'; context.fillRect(x + 5, y + 5, Math.max(2, w - 10), Math.max(2, h - 10));
    context.fillStyle = '#e4be68';
    context.fillRect(type === 'door' ? x + w - 6 : x + w - 8, type === 'door' ? y + h / 2 : y + h - 6, 2, 2);
  } else if (type === 'tv') {
    context.fillStyle = '#17171b'; context.fillRect(x + 2, y + 2, w - 4, h - 10);
    context.fillStyle = '#3a6170'; context.fillRect(x + 6, y + 6, w - 12, h - 18);
    context.fillStyle = '#74aeb5'; context.fillRect(x + 8, y + 8, w - 20, 3);
    context.fillStyle = '#272126'; context.fillRect(x + w / 2 - 2, y + h - 8, 4, 5);
    context.fillRect(x + w / 2 - 10, y + h - 4, 20, 3);
  } else if (type === 'toilet') {
    context.fillStyle = '#aec9c8'; context.fillRect(x + 4, y + 1, w - 8, 10);
    context.fillStyle = '#e6f1ed'; context.fillRect(x + 2, y + 9, w - 4, h - 12);
    context.fillStyle = '#789b9a'; context.fillRect(x + 6, y + 13, w - 12, h - 20);
    context.fillStyle = '#cadbd6'; context.fillRect(x + 8, y + h - 5, w - 16, 4);
  } else if (type === 'sink') {
    pixelRect(context, x, y, w, h, '#587777', '#dce9e5');
    context.fillStyle = '#6c9597'; context.fillRect(x + 7, y + 7, w - 14, h - 13);
    context.fillStyle = '#d8b969'; context.fillRect(x + w / 2 - 1, y + 3, 3, 6);
  } else if (type === 'shower') {
    context.fillStyle = '#45666f'; context.fillRect(x, y, w, h);
    context.fillStyle = '#9cd3d8'; context.fillRect(x + 3, y + 3, w - 6, h - 6);
    context.fillStyle = '#dff5f2'; context.fillRect(x + 6, y + 6, w - 12, h - 12);
    context.fillStyle = '#7fb7c0'; context.fillRect(x + w / 2 - 1, y + 3, 2, h - 6);
    context.fillRect(x + 3, y + h / 2 - 1, w - 6, 2);
    context.fillStyle = '#315b62'; context.fillRect(x + w - 9, y + h / 2, 3, 3);
  } else if (type === 'dispenser') {
    pixelRect(context, x, y, w, h, '#283035', '#b9c8c8');
    context.fillStyle = '#79939a'; context.fillRect(x + 4, y + 5, w - 8, 12);
    context.fillStyle = '#27333a'; context.fillRect(x + 7, y + 8, w - 14, 6);
    context.fillStyle = '#dce9df'; context.fillRect(x + 6, y + 22, w - 12, 12);
    context.fillStyle = '#5c7a80'; context.fillRect(x + 8, y + 25, w - 16, 5);
    context.fillStyle = '#bb6c50'; context.fillRect(x + 8, y + 36, 4, 4);
    context.fillStyle = '#6d9e9b'; context.fillRect(x + 15, y + 36, 4, 4);
  } else if (type === 'painting') {
    pixelRect(context, x, y, w, h, '#5a3828', '#d2aa62');
    context.fillStyle = '#729aa0'; context.fillRect(x + 5, y + 5, w - 10, h - 10);
    context.fillStyle = '#d8e6c7'; context.fillRect(x + 9, y + 8, 12, 6);
    context.fillStyle = '#86a36d'; context.fillRect(x + 23, y + 7, 8, 7);
    context.fillStyle = '#d8bf79'; context.fillRect(x + 5, y + h - 10, w - 10, 5);
  } else if (type === 'clock') {
    context.fillStyle = '#2a2f32'; context.fillRect(x + 4, y + 4, w - 8, h - 8);
    context.fillStyle = '#bec9c2'; context.fillRect(x + 6, y + 6, w - 12, h - 12);
    context.fillStyle = '#25282a'; context.fillRect(x + 11, y + 9, 2, 6); context.fillRect(x + 11, y + 12, 5, 2);
    context.fillStyle = '#e1e8d7'; context.fillRect(x + 9, y + 8, 2, 2); context.fillRect(x + 15, y + 15, 2, 2);
  } else if (type === 'boxes') {
    context.fillStyle = '#6a4228'; context.fillRect(x, y + 9, w - 8, h - 9);
    context.fillStyle = '#9b6739'; context.fillRect(x + 3, y + 12, 18, 14);
    context.fillStyle = '#b07842'; context.fillRect(x + 23, y + 4, 21, 20);
    context.fillStyle = '#d09a58'; context.fillRect(x + 5, y + 14, 14, 2); context.fillRect(x + 26, y + 7, 15, 2);
    context.fillStyle = '#543120'; context.fillRect(x + 23, y + 4, 3, 20); context.fillRect(x + 36, y + 4, 3, 20);
  }
}

function pixelRect(context, x, y, w, h, border, fill) {
  context.fillStyle = border;
  context.fillRect(x, y, w, h);
  context.fillStyle = fill;
  context.fillRect(x + 3, y + 3, Math.max(0, w - 6), Math.max(0, h - 6));
  context.fillStyle = '#0005';
  context.fillRect(x + 4, y + h - 6, Math.max(0, w - 8), 3);
}

function eventPoint(event, stage) {
  const rect = stage.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * MAP_WIDTH, y: (event.clientY - rect.top) / rect.height * MAP_HEIGHT };
}

function snap(value) { return Math.round(Number(value) / CELL) * CELL; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function statusInfo(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'AWAY') return { key: 'away', label: '외출 중', icon: '🏃' };
  if (value === 'SLEEP' || value === 'SLEEPING') return { key: 'sleeping', label: '수면 중', icon: '💤' };
  if (value === 'FOCUS' || value === 'DND' || value === 'DO_NOT_DISTURB') return { key: 'do-not-disturb', label: '방해금지', icon: '⛔' };
  return { key: 'online', label: '대화 가능', icon: '🟢' };
}
