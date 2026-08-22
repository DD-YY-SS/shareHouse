(function () {
  const script = document.currentScript;
  const baseUrl = script?.dataset.baseUrl || new URL(script?.src || window.location.href).origin;
  const operatorId = script?.dataset.operatorId || 'operator-a';
  const roomId = script?.dataset.roomId || '101';
  const mountId = script?.dataset.mount || 'checkmate-widget';
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const frame = document.createElement('iframe');
  frame.title = 'CheckMate 안심 매칭';
  frame.src = `${baseUrl}/?operator_id=${encodeURIComponent(operatorId)}&room_id=${encodeURIComponent(roomId)}`;
  frame.style.cssText = 'width:100%;min-height:720px;border:0;border-radius:20px;background:#fbfcfd;';
  frame.loading = 'lazy';
  mount.appendChild(frame);
})();
