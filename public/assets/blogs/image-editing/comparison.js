(() => {
 document.querySelectorAll('.image-comparison').forEach(root => {
  const left = root.querySelector('[data-side="left"] .comparison-canvas'), right = root.querySelector('[data-side="right"] .comparison-canvas');
  const panes = [...root.querySelectorAll('.image-pane')], lenses = [...root.querySelectorAll('.lens')];
  const buttons = [...root.querySelectorAll('.edit-step')], toggle = root.querySelector('.changed-pixels'), maskToggle = root.querySelector('.show-mask'), error = root.querySelector('.comparison-error');
  const cache = new Map();
  const nativeView = root.dataset.nativeView === 'true';
  const dimensions = root.querySelector('.image-dimensions');
  let sourceImages, nativeInfo, lensRevision = 0;
  let original, selected, maskData, width, height, changed = false, showMask = false, pinned = false, ready = false, revision = 0;
  let point = { x: .5, y: .5 };
  async function image(index) {
   const img = buttons[index].querySelector('img');
   return asset(img.getAttribute('src'));
  }
  function asset(src) {
   if (src.includes('-tiles/') && cache.size > 96) {
    const oldestTile = [...cache.keys()].find(key => key.includes('-tiles/'));
    if (oldestTile) cache.delete(oldestTile);
   }
   if (!cache.has(src)) cache.set(src, (async () => {
    const img = new Image(); img.src = src;
    await img.decode(); return img;
   })().catch(e => { cache.delete(src); throw e; }));
   return cache.get(src);
  }
  function sample(img, mask = false) {
   const canvas = document.createElement('canvas');
   canvas.width = width; canvas.height = height;
   const ctx = canvas.getContext('2d', { willReadFrequently: true });
   ctx.imageSmoothingEnabled = !mask; ctx.imageSmoothingQuality = 'high';
   ctx.drawImage(img, 0, 0, width, height);
   return ctx.getImageData(0, 0, width, height);
  }
  async function select(index) {
   const current = ++revision; ready = false; hide();
   buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
   if (maskToggle) {
    maskToggle.disabled = index === 0;
    if (index === 0) { showMask = false; maskToggle.setAttribute('aria-pressed', 'false'); maskToggle.setAttribute('aria-label', 'Show mask'); maskToggle.title = 'Show mask'; toggle.disabled = false; }
   }
   try {
    const maskSrc = buttons[index].dataset.mask;
    const [first, next, grid, mask] = await Promise.all([image(0), image(index), asset(root.dataset.gridImage), maskSrc ? asset(maskSrc) : null]);
    if (current !== revision) return;
    width = grid.naturalWidth; height = grid.naturalHeight;
    panes.forEach(pane => { pane.style.aspectRatio = width + ' / ' + height; });
    left.width = right.width = width; left.height = right.height = height;
    sourceImages = [first, next];
    nativeInfo = [0, index].map((i, side) => buttons[i].dataset.nativeImage
     ? JSON.parse(buttons[i].dataset.nativeImage)
     : { width: sourceImages[side].naturalWidth, height: sourceImages[side].naturalHeight });
    if (dimensions) dimensions.textContent = 'Original ' + nativeInfo[0].width.toLocaleString() + ' × ' + nativeInfo[0].height.toLocaleString() + ' · ' + buttons[index].title.replace(/^\d+: /, '') + ' ' + nativeInfo[1].width.toLocaleString() + ' × ' + nativeInfo[1].height.toLocaleString();
    original = sample(first); selected = sample(next); maskData = mask ? sample(mask, true) : null;
    right.setAttribute('aria-label', buttons[index].getAttribute('aria-label'));
    ready = true; error.hidden = true; render();
   } catch {
    if (current === revision) { error.textContent = 'Unable to load the images. Please reload.'; error.hidden = false; }
   }
  }
  function render() {
   if (!ready) return;
   left.getContext('2d').putImageData(original, 0, 0);
   if (showMask && maskData) {
    right.getContext('2d').putImageData(maskData, 0, 0);
   } else if (!changed) {
    right.getContext('2d').putImageData(selected, 0, 0);
   } else {
    const result = new ImageData(new Uint8ClampedArray(selected.data), width, height);
    for (let i = 0; i < result.data.length; i += 4) {
     const delta = Math.max(Math.abs(original.data[i] - selected.data[i]), Math.abs(original.data[i + 1] - selected.data[i + 1]), Math.abs(original.data[i + 2] - selected.data[i + 2]));
     if (delta > 12) {
      result.data[i] = result.data[i] * .3 + 240 * .7;
      result.data[i + 1] = result.data[i + 1] * .3 + 32 * .7;
      result.data[i + 2] = result.data[i + 2] * .3 + 184 * .7;
     }
    }
    right.getContext('2d').putImageData(result, 0, 0);
   }
   if (pinned) magnify();
  }
  function hide() { lensRevision++; lenses.forEach(lens => { lens.hidden = true; }); }
  async function nativeCrop(side, location, size) {
   const info = nativeInfo[side];
   // A common region measured in ORIGINAL source pixels, independent of the
   // downsampled overview. The low-resolution edit is enlarged into this same
   // region, while the 10k image is inspected at two source pixels per CSS pixel.
   const crop = size * 2 * info.width / nativeInfo[0].width;
   const x = location.x * info.width - crop / 2, y = location.y * info.height - crop / 2;
   const canvas = document.createElement('canvas'); canvas.width = canvas.height = 220;
   const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 220, 220); ctx.imageSmoothingEnabled = false;
   if (!info.tiles) {
    ctx.drawImage(sourceImages[side], x, y, crop, crop, 0, 0, 220, 220);
    return canvas;
   }
   const tileSize = info.tileSize;
   const jobs = [];
   for (let row = Math.max(0, Math.floor(y / tileSize)); row <= Math.min(Math.ceil(info.height / tileSize) - 1, Math.floor((y + crop) / tileSize)); row++) {
    for (let col = Math.max(0, Math.floor(x / tileSize)); col <= Math.min(Math.ceil(info.width / tileSize) - 1, Math.floor((x + crop) / tileSize)); col++) {
     jobs.push(asset(info.tiles + col + '-' + row + '.png').then(tile => {
      ctx.drawImage(tile, (col * tileSize - x) / crop * 220, (row * tileSize - y) / crop * 220, tile.width / crop * 220, tile.height / crop * 220);
     }));
    }
   }
   await Promise.all(jobs);
   return canvas;
  }
  async function magnifyNative() {
   const ticket = ++lensRevision, location = { ...point };
   const sizes = lenses.map((lens, i) => {
    lens.hidden = false;
    const size = lens.getBoundingClientRect().width;
    lens.style.left = Math.max(0, Math.min(panes[i].clientWidth - size, location.x * panes[i].clientWidth - size / 2)) + 'px';
    lens.style.top = Math.max(0, Math.min(panes[i].clientHeight - size, location.y * panes[i].clientHeight - size / 2)) + 'px';
    return size;
   });
   try {
    const crops = await Promise.all([nativeCrop(0, location, sizes[0]), nativeCrop(1, location, sizes[1])]);
    if (ticket !== lensRevision || !ready || showMask) return;
    if (changed) {
     const a = crops[0].getContext('2d').getImageData(0, 0, 220, 220);
     const ctx = crops[1].getContext('2d'), b = ctx.getImageData(0, 0, 220, 220);
     for (let i = 0; i < a.data.length; i += 4) {
      if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > 12) {
       b.data[i] = b.data[i] * .3 + 240 * .7; b.data[i + 1] = b.data[i + 1] * .3 + 32 * .7; b.data[i + 2] = b.data[i + 2] * .3 + 184 * .7;
      }
     }
     ctx.putImageData(b, 0, 0);
    }
    crops.forEach((crop, i) => lenses[i].getContext('2d').drawImage(crop, 0, 0));
   } catch {
    if (ticket === lensRevision) { error.textContent = 'Unable to load image detail. Please reload.'; error.hidden = false; }
   }
  }
  function magnify() {
   if (!ready) return;
   if (nativeView && !showMask) { magnifyNative(); return; }
   lenses.forEach((lens, i) => {
    lens.hidden = false;
    const size = lens.getBoundingClientRect().width;
    lens.style.left = Math.max(0, Math.min(panes[i].clientWidth - size, point.x * panes[i].clientWidth - size / 2)) + 'px';
    lens.style.top = Math.max(0, Math.min(panes[i].clientHeight - size, point.y * panes[i].clientHeight - size / 2)) + 'px';
    const crop = size / (nativeView ? 2 : 4) / panes[i].clientWidth * width, ctx = lens.getContext('2d');
    ctx.fillStyle = '#111310'; ctx.fillRect(0, 0, 220, 220); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(i ? right : left, point.x * width - crop / 2, point.y * height - crop / 2, crop, crop, 0, 0, 220, 220);
   });
  }
  function locate(event, pane) {
   const rect = pane.getBoundingClientRect();
   point = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }
  panes.forEach(pane => {
   pane.addEventListener('pointermove', event => { if (!pinned) { locate(event, pane); magnify(); } });
   pane.addEventListener('pointerleave', () => { if (!pinned) hide(); });
   pane.addEventListener('click', event => { pinned = !pinned; locate(event, pane); magnify(); });
   pane.addEventListener('keydown', event => {
    if (event.key === 'Escape') { pinned = false; hide(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); pinned = true;
    point.x = Math.max(0, Math.min(1, point.x + (event.key === 'ArrowRight' ? .01 : event.key === 'ArrowLeft' ? -.01 : 0)));
    point.y = Math.max(0, Math.min(1, point.y + (event.key === 'ArrowDown' ? .01 : event.key === 'ArrowUp' ? -.01 : 0)));
    magnify();
   });
  });
  buttons.forEach((button, i) => button.addEventListener('click', () => select(i)));
  toggle.addEventListener('click', () => {
   changed = !changed; toggle.setAttribute('aria-pressed', String(changed));
   toggle.setAttribute('aria-label', changed ? 'Show photographs' : 'Show changed pixels');
   toggle.title = changed ? 'Show photographs' : 'Show changed pixels'; render();
  });
  maskToggle?.addEventListener('click', () => {
   showMask = !showMask; maskToggle.setAttribute('aria-pressed', String(showMask));
   maskToggle.setAttribute('aria-label', showMask ? 'Show composite' : 'Show mask');
   maskToggle.title = showMask ? 'Show composite' : 'Show mask'; toggle.disabled = showMask; render();
  });
  window.addEventListener('resize', () => { if (pinned) magnify(); });
  select(buttons.length - 1);
 });
})();
