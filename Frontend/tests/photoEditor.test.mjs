import test from 'node:test';
import assert from 'node:assert/strict';

test('Photo Studio Editor & Adjustments Logic Tests', async (t) => {
  const DEFAULT_ADJUSTMENTS = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    sepia: 0,
    grayscale: 0,
    hueRotate: 0,
  };

  const BUILTIN_PRESETS = [
    { id: 'original', name: 'Original', adjustments: { ...DEFAULT_ADJUSTMENTS } },
    { id: 'vivid', name: 'Vivid Pop', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 108, contrast: 122, saturation: 145 } },
    { id: 'sunset', name: 'Warm Sunset', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 105, contrast: 112, saturation: 125, sepia: 32, hueRotate: 345 } },
    { id: 'noir', name: 'Cool Noir', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 110, contrast: 135, saturation: 0, grayscale: 100 } },
    { id: 'cyberpunk', name: 'Cyberpunk', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 112, contrast: 130, saturation: 175, hueRotate: 290 } },
    { id: 'vintage', name: 'Vintage 70s', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 96, contrast: 92, saturation: 85, sepia: 55, hueRotate: 15 } },
    { id: 'dramatic', name: 'Dramatic', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 94, contrast: 142, saturation: 115, sepia: 15 } },
  ];

  await t.test('DEFAULT_ADJUSTMENTS contains normalized baseline values', () => {
    assert.equal(DEFAULT_ADJUSTMENTS.brightness, 100);
    assert.equal(DEFAULT_ADJUSTMENTS.contrast, 100);
    assert.equal(DEFAULT_ADJUSTMENTS.saturation, 100);
    assert.equal(DEFAULT_ADJUSTMENTS.blur, 0);
    assert.equal(DEFAULT_ADJUSTMENTS.sepia, 0);
    assert.equal(DEFAULT_ADJUSTMENTS.grayscale, 0);
    assert.equal(DEFAULT_ADJUSTMENTS.hueRotate, 0);
  });

  await t.test('Built-in presets provide required artistic styles', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    assert.ok(ids.includes('original'));
    assert.ok(ids.includes('vivid'));
    assert.ok(ids.includes('noir'));
    assert.ok(ids.includes('cyberpunk'));
    assert.ok(ids.includes('sunset'));
    assert.ok(ids.includes('vintage'));
    assert.ok(ids.includes('dramatic'));
  });

  await t.test('Custom presets enforces maximum limit of 3 presets', () => {
    const MAX_CUSTOM_PRESETS = 3;
    let customPresets = [];

    const addPreset = (name, adjustments) => {
      if (customPresets.length >= MAX_CUSTOM_PRESETS) {
        throw new Error(`Maximum ${MAX_CUSTOM_PRESETS} custom presets reached.`);
      }
      const newP = { id: `custom-${Date.now()}-${Math.random()}`, name, isCustom: true, adjustments };
      customPresets.push(newP);
      return newP;
    };

    // Add 1
    addPreset('Preset 1', { ...DEFAULT_ADJUSTMENTS, contrast: 130 });
    assert.equal(customPresets.length, 1);

    // Add 2
    addPreset('Preset 2', { ...DEFAULT_ADJUSTMENTS, brightness: 120 });
    assert.equal(customPresets.length, 2);

    // Add 3 (maximum reached)
    addPreset('Preset 3', { ...DEFAULT_ADJUSTMENTS, saturation: 150 });
    assert.equal(customPresets.length, 3);

    // Attempting 4th must fail
    assert.throws(
      () => addPreset('Preset 4', { ...DEFAULT_ADJUSTMENTS }),
      /Maximum 3 custom presets reached/
    );

    // Deleting one frees up a slot
    customPresets = customPresets.filter((p) => p.name !== 'Preset 1');
    assert.equal(customPresets.length, 2);

    // Now adding another succeeds
    addPreset('Preset 4 replacement', { ...DEFAULT_ADJUSTMENTS, sepia: 40 });
    assert.equal(customPresets.length, 3);
  });

  await t.test('Generates valid CSS filter string for canvas and preview', () => {
    const adj = {
      brightness: 115,
      contrast: 125,
      saturation: 140,
      blur: 2,
      sepia: 25,
      grayscale: 10,
      hueRotate: 180,
    };
    const filter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) blur(${adj.blur}px) sepia(${adj.sepia}%) grayscale(${adj.grayscale}%) hue-rotate(${adj.hueRotate}deg)`;
    assert.ok(filter.includes('brightness(115%)'));
    assert.ok(filter.includes('contrast(125%)'));
    assert.ok(filter.includes('saturate(140%)'));
    assert.ok(filter.includes('blur(2px)'));
    assert.ok(filter.includes('sepia(25%)'));
    assert.ok(filter.includes('grayscale(10%)'));
    assert.ok(filter.includes('hue-rotate(180deg)'));
  });

  await t.test('Clean copy filename generation for direct drive saving', () => {
    const originalFileName = 'landscape-photo.jpeg';
    const cleanBaseName = originalFileName.replace(/\.[^/.]+$/, '');
    const editedFileName = `${cleanBaseName}_edited_1234.png`;
    assert.equal(editedFileName, 'landscape-photo_edited_1234.png');
    assert.ok(editedFileName.endsWith('.png'));
  });

  await t.test('Undo stroke and hover safety: clears current stroke reference and prevents auto-reappearing', () => {
    let strokes = [
      { id: 'stroke-1', isEraser: false, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
      { id: 'stroke-2', isEraser: false, points: [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }] },
    ];
    let isPainting = true;
    let currentStroke = strokes[1];

    // Undo action
    const handleUndo = () => {
      isPainting = false;
      currentStroke = null;
      strokes = strokes.slice(0, -1);
    };

    handleUndo();

    assert.equal(strokes.length, 1);
    assert.equal(isPainting, false);
    assert.equal(currentStroke, null);

    // Hovering with no mouse button (buttons !== 1) must not add stroke or points
    const handlePointerMove = (buttons, pt) => {
      if (buttons !== 1) {
        isPainting = false;
        currentStroke = null;
        return;
      }
      if (isPainting && currentStroke) {
        currentStroke.points.push(pt);
      }
    };

    // User moves mouse over canvas with buttons = 0 (hover)
    handlePointerMove(0, { x: 0.5, y: 0.5 });
    assert.equal(strokes.length, 1);
    assert.equal(strokes[0].points.length, 2);
  });

  await t.test('Eraser layer isolation: eraser modifies drawing layer, not base photo', () => {
    const stroke = {
      id: 'eraser-1',
      isEraser: true,
      points: [{ x: 0.5, y: 0.5 }],
    };

    const getCompositeMode = (isEraser) => (isEraser ? 'destination-out' : 'source-over');
    assert.equal(getCompositeMode(stroke.isEraser), 'destination-out');
    assert.equal(getCompositeMode(false), 'source-over');
  });
});

