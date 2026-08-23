import { React } from '../shared.js';

// 좌표는 16px 타일 기준이며, 실제 시트에 맞춰 1px 단위로 조정할 수 있습니다.
const SPRITES = {
  stair_left: { imageUrl:'/assets/crops/stair-left.png', x: 0, y: 0, w: 96, h: 80, sheetW:96, sheetH:80 },
  door_closed_brown: { imageUrl:'/assets/crops/door-closed-brown.png', x: 0, y: 0, w: 32, h: 48, sheetW:32, sheetH:48 },
  door_open_brown: { imageUrl:'/assets/crops/door-open-brown.png', x: 0, y: 0, w: 32, h: 48, sheetW:32, sheetH:48 },
  window_4pane: { imageUrl:'/assets/crops/window-4pane.png', x: 0, y: 0, w: 32, h: 32, sheetW:32, sheetH:32 },
  window_wide: { imageUrl:'/assets/crops/window-wide.png', x: 0, y: 0, w: 48, h: 32, sheetW:48, sheetH:32 },
  bed: { imageUrl:'/assets/room/bed.png', x: 0, y: 0, w: 32, h: 32, sheetW:32, sheetH:32 },
  desk: { imageUrl:'/assets/room/desk.png', x: 0, y: 0, w: 64, h: 16, sheetW:64, sheetH:16 },
  sofa: { imageUrl:'/assets/room/sofa.png', x: 0, y: 0, w: 64, h: 32, sheetW:64, sheetH:32 },
  bookcase: { imageUrl:'/assets/room/bookcase.png', x: 0, y: 0, w: 64, h: 48, sheetW:64, sheetH:48 },
  plant_pot: { imageUrl:'/assets/room/plant.png', x: 0, y: 0, w: 16, h: 32, sheetW:16, sheetH:32 },
  rug: { imageUrl:'/assets/room/rug.png', x: 0, y: 0, w: 48, h: 64, sheetW:48, sheetH:64 },
  kitchen: { imageUrl:'/assets/room/kitchen.png', x: 0, y: 0, w: 144, h: 48, sheetW:144, sheetH:48 },
  bath: { imageUrl:'/assets/room/bath.png', x: 0, y: 0, w: 48, h: 16, sheetW:48, sheetH:16 },
  character_minji: { imageUrl:'/minji-pixel.png', x: 0, y: 0, w: 48, h: 64, sheetW:48, sheetH:64 },
  character_roommate: { imageUrl:'/minji-pixel.png', x: 0, y: 0, w: 48, h: 64, sheetW:48, sheetH:64 },
};

export default function SpriteAsset({ type, className = '', scale = 1, alt = '' }) {
  const s = SPRITES[type] || SPRITES.window_4pane;
  return <span role="img" aria-label={alt || type} className={`sprite-asset ${className}`} style={{ width: `${s.w * scale}px`, height: `${s.h * scale}px`, backgroundImage: `url(${s.imageUrl})`, backgroundPosition: `${s.x * scale}px ${s.y * scale}px`, backgroundSize: `${s.sheetW * scale}px ${s.sheetH * scale}px`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', transformOrigin: 'top left' }} />;
}
