const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFileName,
  callIfAvailable,
  colorToHex,
  compactBox,
  compactRadius,
  estimateTokens,
  mapCrossAxisAlign,
  mapMainAxisAlign,
  mapWithLimit,
  omitDefaults,
  paintToCss,
  safeValue,
  serializeSelectionDiffForAi,
  serializeSelectionForAi,
  serializeSelectionSummaryForAi,
  serializeSelection
} = require("../dist/exporter.cjs");

test("serializes selected nodes and descendants with structure and styles", async () => {
  const selection = [
    {
      id: "1:2",
      name: "Card",
      type: "FRAME",
      visible: true,
      x: 10,
      y: 20,
      width: 300,
      height: 120,
      absoluteBoundingBox: { x: 100, y: 200, width: 300, height: 120 },
      absoluteRenderBounds: { x: 96, y: 196, width: 308, height: 128 },
      relativeTransform: [[1, 0, 10], [0, 1, 20]],
      componentProperties: {
        "State": {
          type: "VARIANT",
          value: "Default"
        }
      },
      overrides: [
        {
          id: "1:3",
          overriddenFields: ["characters"]
        }
      ],
      variantProperties: {
        State: "Default"
      },
      reactions: [
        {
          trigger: { type: "ON_CLICK" },
          actions: [{ type: "BACK" }]
        }
      ],
      layoutGrids: [
        {
          pattern: "COLUMNS",
          visible: true,
          count: 4
        }
      ],
      layoutMode: "VERTICAL",
      minWidth: 200,
      maxWidth: 400,
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      effects: [{ type: "DROP_SHADOW", radius: 12, visible: true }],
      getMainComponentAsync: async () => ({
        id: "9:9",
        key: "component-key",
        name: "Card Component",
        type: "COMPONENT",
        remote: false,
        description: "Card source",
        componentPropertyDefinitions: {
          State: {
            type: "VARIANT",
            defaultValue: "Default",
            variantOptions: ["Default", "Hover"]
          }
        },
        variantProperties: {
          State: "Default"
        },
        parent: {
          id: "9:8",
          key: "component-set-key",
          name: "Card Set",
          type: "COMPONENT_SET",
          remote: false,
          variantGroupProperties: {
            State: {
              values: ["Default", "Hover"]
            }
          }
        }
      }),
      children: [
        {
          id: "1:3",
          name: "Title",
          type: "TEXT",
          characters: "Hello",
          fontSize: 16,
          textStyleId: "S:123",
          fills: Symbol("mixed"),
          children: []
        }
      ]
    }
  ];

  const result = await serializeSelection(selection, {
    fileKey: "abc",
    page: { id: "0:1", name: "Page 1" }
  });

  assert.equal(result.selectionCount, 1);
  assert.equal(result.fileKey, "abc");
  assert.equal(result.nodes[0].name, "Card");
  assert.equal(result.nodes[0].type, "FRAME");
  assert.equal(result.nodes[0].parentId, null);
  assert.equal(result.nodes[0].depth, 0);
  assert.deepEqual(result.nodes[0].path, ["Card"]);
  assert.deepEqual(result.nodes[0].absoluteBoundingBox, { x: 100, y: 200, width: 300, height: 120 });
  assert.deepEqual(result.nodes[0].relativeTransform, [[1, 0, 10], [0, 1, 20]]);
  assert.equal(result.nodes[0].componentProperties.State.value, "Default");
  assert.equal(result.nodes[0].componentSource.name, "Card Component");
  assert.equal(result.nodes[0].componentSource.key, "component-key");
  assert.equal(result.nodes[0].componentSource.componentSet.name, "Card Set");
  assert.deepEqual(result.nodes[0].overrides[0].overriddenFields, ["characters"]);
  assert.equal(result.nodes[0].variantProperties.State, "Default");
  assert.equal(result.nodes[0].reactions[0].trigger.type, "ON_CLICK");
  assert.equal(result.nodes[0].layoutGrids[0].pattern, "COLUMNS");
  assert.equal(result.nodes[0].minWidth, 200);
  assert.equal(result.nodes[0].styles.fills[0].type, "SOLID");
  assert.equal(result.nodes[0].styles.effects[0].radius, 12);
  assert.equal(result.nodes[0].children[0].name, "Title");
  assert.equal(result.nodes[0].children[0].parentId, "1:2");
  assert.equal(result.nodes[0].children[0].depth, 1);
  assert.deepEqual(result.nodes[0].children[0].path, ["Card", "Title"]);
  assert.equal(result.nodes[0].children[0].styles.characters, "Hello");
  assert.equal(result.nodes[0].children[0].styles.fills, "Symbol(mixed)");
});

test("includes document-level style and variable resources when provided", async () => {
  const result = await serializeSelection([], {
    resourceMode: "fullResources",
    documentResources: {
      styles: {
        paints: [
          {
            id: "S:1",
            key: "paint-key",
            name: "Color/Primary",
            paints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }]
          }
        ],
        texts: [],
        effects: [],
        grids: []
      },
      variables: [
        {
          id: "VariableID:1",
          key: "var-key",
          name: "Color/Primary",
          resolvedType: "COLOR",
          variableCollectionId: "CollectionID:1",
          valuesByMode: {
            "mode-id": { r: 1, g: 0, b: 0, a: 1 }
          }
        }
      ],
      variableCollections: [
        {
          id: "CollectionID:1",
          key: "collection-key",
          name: "Theme",
          modes: [{ modeId: "mode-id", name: "Light" }],
          defaultModeId: "mode-id"
        }
      ]
    }
  });

  assert.equal(result.documentResources.styles.paints[0].name, "Color/Primary");
  assert.equal(result.documentResources.variables[0].name, "Color/Primary");
  assert.equal(result.documentResources.variableCollections[0].name, "Theme");
});

test("keeps component source identity when optional component fields throw", async () => {
  const component = {
    id: "9:9",
    key: "component-key",
    name: "Variant Component",
    type: "COMPONENT",
    remote: false
  };
  Object.defineProperty(component, "componentPropertyDefinitions", {
    get() {
      throw new Error("unsupported component property definitions");
    }
  });

  const result = await serializeSelection([
    {
      id: "1:1",
      name: "Instance",
      type: "INSTANCE",
      getMainComponentAsync: async () => component,
      children: []
    }
  ]);

  assert.equal(result.nodes[0].componentSource.key, "component-key");
  assert.equal(result.nodes[0].componentSource.name, "Variant Component");
  assert.equal(
    result.nodes[0].componentSource.componentPropertyDefinitions.error,
    "unsupported component property definitions"
  );
});

test("resolves variable aliases when resolver is available", async () => {
  let variableCalls = 0;
  let collectionCalls = 0;
  const result = await serializeSelection([
    {
      id: "1:1",
      name: "Variable Card",
      type: "FRAME",
      boundVariables: {
        fills: [
          {
            type: "VARIABLE_ALIAS",
            id: "VariableID:123"
          }
        ]
      },
      fills: [],
      children: []
    }
  ], {
    resolveVariable: async (id) => {
      variableCalls += 1;
      return {
        id,
        key: "variable-key",
        name: "Color/Text Primary",
        collectionId: "collection-id",
        resolvedType: "COLOR",
        valuesByMode: {
          "mode-id": { r: 1, g: 0, b: 0, a: 1 }
        }
      };
    },
    resolveVariableCollection: async (id) => {
      collectionCalls += 1;
      return {
        id,
        key: "collection-key",
        name: "Theme",
        modes: [{ modeId: "mode-id", name: "Light" }],
        defaultModeId: "mode-id"
      };
    }
  });

  const variables = result.nodes[0].styles.resolvedVariables;

  assert.deepEqual(variables["VariableID:123"], { id: "VariableID:123" });
  assert.equal(result.documentResources.variables[0].name, "Color/Text Primary");
  assert.equal(result.documentResources.variables[0].collection.name, "Theme");
  assert.equal(result.documentResources.variables[0].collection.modes[0].name, "Light");
  assert.equal(variableCalls, 1);
  assert.equal(collectionCalls, 1);
});

test("deduplicates concurrent variable resolver calls", async () => {
  let variableCalls = 0;
  const result = await serializeSelection([
    {
      id: "1:1",
      name: "Root",
      type: "FRAME",
      children: [
        {
          id: "1:2",
          name: "A",
          type: "RECTANGLE",
          boundVariables: {
            fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:shared" }]
          },
          fills: [],
          children: []
        },
        {
          id: "1:3",
          name: "B",
          type: "RECTANGLE",
          boundVariables: {
            fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:shared" }]
          },
          fills: [],
          children: []
        }
      ]
    }
  ], {
    resolveVariable: async (id) => {
      variableCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        id,
        name: "Shared",
        collectionId: "collection-id"
      };
    },
    resolveVariableCollection: async (id) => ({
      id,
      name: "Theme"
    })
  });

  assert.equal(variableCalls, 1);
  assert.equal(result.documentResources.variables.length, 1);
  assert.equal(result.documentResources.variables[0].id, "VariableID:shared");
});

test("filters document resources to referenced styles and variables by default", async () => {
  const result = await serializeSelection([
    {
      id: "1:1",
      name: "Card",
      type: "FRAME",
      fillStyleId: "S:used-paint",
      boundVariables: {
        fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:used" }]
      },
      fills: [],
      children: []
    }
  ], {
    documentResources: {
      styles: {
        paints: [
          { id: "S:used-paint", name: "Used Paint" },
          { id: "S:unused-paint", name: "Unused Paint" }
        ],
        texts: [{ id: "S:unused-text", name: "Unused Text" }],
        effects: [],
        grids: []
      },
      variables: [
        {
          id: "VariableID:used",
          name: "Used Variable",
          collectionId: "CollectionID:used"
        },
        {
          id: "VariableID:unused",
          name: "Unused Variable",
          collectionId: "CollectionID:unused"
        }
      ],
      variableCollections: [
        { id: "CollectionID:used", name: "Used Collection" },
        { id: "CollectionID:unused", name: "Unused Collection" }
      ]
    }
  });

  assert.deepEqual(result.documentResources.styles.paints.map((style) => style.name), ["Used Paint"]);
  assert.deepEqual(result.documentResources.styles.texts, []);
  assert.deepEqual(result.documentResources.variables.map((variable) => variable.name), ["Used Variable"]);
  assert.deepEqual(
    result.documentResources.variableCollections.map((collection) => collection.name),
    ["Used Collection"]
  );
});

test("keeps all document resources when fullResources export mode is requested", async () => {
  const result = await serializeSelection([], {
    resourceMode: "fullResources",
    documentResources: {
      styles: {
        paints: [{ id: "S:paint", name: "Paint" }],
        texts: [{ id: "S:text", name: "Text" }],
        effects: [],
        grids: []
      },
      variables: [{ id: "VariableID:unused", name: "Unused Variable" }],
      variableCollections: [{ id: "CollectionID:unused", name: "Unused Collection" }]
    }
  });

  assert.equal(result.documentResources.styles.paints.length, 1);
  assert.equal(result.documentResources.styles.texts.length, 1);
  assert.equal(result.documentResources.variables.length, 1);
  assert.equal(result.documentResources.variableCollections.length, 1);
});

test("sanitizes export file names", () => {
  const filename = buildFileName([
    {
      name: "  A/B:C*D?E\"F<G>H|  "
    }
  ]);

  assert.equal(filename, "A-B-C-D-E-F-G-H-figma-export.json");
});

test("mapWithLimit preserves order and caps concurrency", async () => {
  let active = 0;
  let maxActive = 0;
  const values = await mapWithLimit([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(values, [10, 20, 30, 40, 50]);
  assert.equal(maxActive, 2);
});

test("safeValue marks circular references without throwing", () => {
  const value = { name: "root" };
  value.self = value;

  assert.deepEqual(safeValue(value), {
    name: "root",
    self: "[Circular]"
  });
});

test("callIfAvailable returns empty array for missing methods and error object for failures", async () => {
  assert.deepEqual(await callIfAvailable({}, "missing"), []);
  assert.deepEqual(await callIfAvailable({
    fail: async () => {
      throw new Error("boom");
    }
  }, "fail"), {
    error: "boom"
  });
});

test("serializes AI optimized schema with metadata and reduced fields", async () => {
  const result = await serializeSelectionForAi([
    {
      id: "1:1",
      name: "Card",
      type: "FRAME",
      visible: true,
      locked: true,
      removed: false,
      absoluteBoundingBox: { x: 100, y: 100, width: 320, height: 200 },
      relativeTransform: [[1, 0, 0], [0, 1, 0]],
      exportSettings: [{ format: "PNG" }],
      opacity: 1,
      rotation: 0,
      x: 10,
      y: 20,
      width: 320,
      height: 200,
      layoutMode: "VERTICAL",
      layoutWrap: "NO_WRAP",
      layoutSizingHorizontal: "FIXED",
      layoutSizingVertical: "HUG",
      primaryAxisAlignItems: "CENTER",
      counterAxisAlignItems: "MIN",
      itemSpacing: 12,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      clipsContent: false,
      fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 1 }, opacity: 1, visible: true }],
      children: []
    }
  ], {
    page: { id: "0:1", name: "Page 1" }
  });

  assert.equal(result.schemaVersion, "2.1.0");
  assert.equal(result.mode, "ai-optimized");
  assert.equal(result.metadata.selectionCount, 1);
  assert.equal(result.metadata.nodeCount, 1);
  assert.equal(result.metadata.maxDepth, 0);
  assert.equal(result.metadata.page.name, "Page 1");
  assert.equal(typeof result.metadata.estimatedTokens, "number");
  assert.deepEqual(Object.keys(result.designTokens), ["colors", "typography", "spacing"]);
  assert.deepEqual(result.componentDefinitions, {});

  const node = result.nodes[0];
  assert.equal(node.id, "1:1");
  assert.equal(node.name, "Card");
  assert.equal(node.type, "FRAME");
  assert.equal(node.locked, undefined);
  assert.equal(node.removed, undefined);
  assert.equal(node.absoluteBoundingBox, undefined);
  assert.equal(node.relativeTransform, undefined);
  assert.equal(node.exportSettings, undefined);
  assert.equal(node.figma.visible, undefined);
  assert.equal(node.figma.opacity, undefined);
  assert.equal(node.css.display, "flex");
  assert.equal(node.css.flexDirection, "column");
  assert.equal(node.css.justifyContent, "center");
  assert.equal(node.css.alignItems, "flex-start");
  assert.equal(node.css.gap, "12px");
  assert.equal(node.css.padding, "16px");
  assert.equal(node.css.width, "320px");
  assert.equal(node.css.height, "auto");
  assert.equal(node.css.background, "#3366ff");
});

test("AI optimized output keeps non-default visual figma fields", async () => {
  const result = await serializeSelectionForAi([
    {
      id: "1:1",
      name: "Hidden",
      type: "FRAME",
      visible: false,
      opacity: 0.5,
      rotation: 45,
      blendMode: "MULTIPLY",
      width: 100,
      height: 50,
      fills: [],
      children: []
    }
  ]);

  assert.equal(result.nodes[0].figma.visible, false);
  assert.equal(result.nodes[0].figma.opacity, 0.5);
  assert.equal(result.nodes[0].figma.rotation, 45);
  assert.equal(result.nodes[0].figma.blendMode, "MULTIPLY");
});

test("AI optimized output does not abort when componentProperties getter throws", async () => {
  const node = {
    id: "1:1",
    name: "Problem Instance",
    type: "INSTANCE",
    width: 100,
    height: 50,
    fills: [],
    children: []
  };
  Object.defineProperty(node, "componentProperties", {
    get() {
      throw new Error("in get_componentProperties: unavailable for this node");
    }
  });

  const result = await serializeSelectionForAi([node]);

  assert.equal(
    result.nodes[0].figma.componentProperties.error,
    "in get_componentProperties: unavailable for this node"
  );
});

test("AI CSS helpers convert color, spacing, radius and alignment", () => {
  assert.equal(colorToHex({ r: 0.2, g: 0.4, b: 1 }), "#3366ff");
  assert.equal(colorToHex({ r: 1, g: 0, b: 0 }, 0.5), "rgba(255, 0, 0, 0.5)");
  assert.equal(paintToCss({ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true }), "#000000");
  assert.equal(compactBox(16, 16, 16, 16, "px"), "16px");
  assert.equal(compactBox(8, 16, 8, 16, "px"), "8px 16px");
  assert.equal(compactRadius({ cornerRadius: 4 }), "4px");
  assert.equal(compactRadius({ topLeftRadius: 4, topRightRadius: 8, bottomRightRadius: 4, bottomLeftRadius: 8 }), "4px 8px");
  assert.equal(mapMainAxisAlign("SPACE_BETWEEN"), "space-between");
  assert.equal(mapMainAxisAlign("MAX"), "flex-end");
  assert.equal(mapCrossAxisAlign("MIN"), "flex-start");
});

test("AI optimized output maps text styles to CSS text object", async () => {
  const result = await serializeSelectionForAi([
    {
      id: "1:1",
      name: "Title",
      type: "TEXT",
      width: 80,
      height: 20,
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true }],
      characters: "Hello",
      fontName: { family: "Inter", style: "Bold" },
      fontSize: 24,
      fontWeight: 700,
      lineHeight: { unit: "PIXELS", value: 32 },
      letterSpacing: { unit: "PIXELS", value: 0.5 },
      textAlignHorizontal: "CENTER",
      textAlignVertical: "CENTER",
      children: []
    }
  ]);

  const node = result.nodes[0];
  assert.deepEqual(node.text, { characters: "Hello" });
  assert.equal(node.css.color, "#000000");
  assert.equal(node.css.fontFamily, "Inter");
  assert.equal(node.css.fontSize, "24px");
  assert.equal(node.css.fontWeight, 700);
  assert.equal(node.css.lineHeight, "32px");
  assert.equal(node.css.letterSpacing, "0.5px");
  assert.equal(node.css.textAlign, "center");
  assert.equal(node.css.alignSelf, undefined);
});

test("AI optimized output preserves positioning only when needed", async () => {
  const result = await serializeSelectionForAi([
    {
      id: "1:1",
      name: "Auto Parent",
      type: "FRAME",
      width: 300,
      height: 100,
      layoutMode: "HORIZONTAL",
      fills: [],
      children: [
        {
          id: "1:2",
          name: "Auto Child",
          type: "FRAME",
          x: 20,
          y: 30,
          width: 100,
          height: 40,
          fills: [],
          children: []
        },
        {
          id: "1:3",
          name: "Absolute Child",
          type: "FRAME",
          x: 120,
          y: 30,
          width: 100,
          height: 40,
          layoutPositioning: "ABSOLUTE",
          fills: [],
          children: []
        }
      ]
    },
    {
      id: "2:1",
      name: "Free Parent",
      type: "FRAME",
      width: 300,
      height: 100,
      fills: [],
      children: [
        {
          id: "2:2",
          name: "Free Child",
          type: "FRAME",
          x: 12,
          y: 18,
          width: 50,
          height: 40,
          fills: [],
          children: []
        }
      ]
    }
  ]);

  assert.deepEqual(result.nodes[0].children[0].positioning, { mode: "autoLayoutChild" });
  assert.deepEqual(result.nodes[0].children[1].positioning, { mode: "absolute", x: 120, y: 30 });
  assert.deepEqual(result.nodes[1].children[0].positioning, { mode: "freeform", x: 12, y: 18 });
});

test("AI optimized output deduplicates component definitions", async () => {
  const component = {
    id: "9:1",
    key: "component-key",
    name: "Button",
    type: "COMPONENT",
    remote: false,
    variantProperties: { Size: "md" },
    parent: {
      id: "9:0",
      key: "set-key",
      name: "Button Set",
      type: "COMPONENT_SET"
    }
  };
  const makeInstance = (id, name) => ({
    id,
    name,
    type: "INSTANCE",
    width: 100,
    height: 40,
    componentProperties: { Size: { type: "VARIANT", value: "md" } },
    fills: [],
    getMainComponentAsync: async () => component,
    children: []
  });

  const result = await serializeSelectionForAi([
    makeInstance("1:1", "Button 1"),
    makeInstance("1:2", "Button 2")
  ]);

  assert.deepEqual(Object.keys(result.componentDefinitions), ["component-key"]);
  assert.equal(result.componentDefinitions["component-key"].name, "Button");
  assert.equal(result.nodes[0].componentId, "component-key");
  assert.equal(result.nodes[1].componentId, "component-key");
  assert.equal(result.nodes[0].componentSource, undefined);
});

test("AI optimized output aggregates design tokens", async () => {
  const result = await serializeSelectionForAi([
    {
      id: "1:1",
      name: "A",
      type: "TEXT",
      width: 100,
      height: 20,
      fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 1 }, opacity: 1, visible: true }],
      fontName: { family: "Inter", style: "Bold" },
      fontSize: 16,
      fontWeight: 700,
      characters: "A",
      children: []
    },
    {
      id: "1:2",
      name: "B",
      type: "FRAME",
      width: 100,
      height: 20,
      itemSpacing: 8,
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
      fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 1 }, opacity: 1, visible: true }],
      children: []
    }
  ]);

  assert.equal(result.designTokens.colors.color_1, "#3366ff");
  assert.deepEqual(result.designTokens.typography.typography_1, {
    fontFamily: "Inter",
    fontSize: "16px",
    fontWeight: 700
  });
  assert.equal(result.designTokens.spacing.spacing_1, "8px");
});

test("AI optimized output uses Figma variable names for color tokens", async () => {
  const result = await serializeSelectionForAi([
    {
      id: "1:1",
      name: "Token Card",
      type: "FRAME",
      width: 100,
      height: 20,
      fills: [
        {
          type: "SOLID",
          color: { r: 0.2, g: 0.4, b: 1 },
          opacity: 1,
          visible: true,
          boundVariables: {
            color: {
              type: "VARIABLE_ALIAS",
              id: "VariableID:primary"
            }
          }
        }
      ],
      boundVariables: {
        fills: [
          {
            type: "VARIABLE_ALIAS",
            id: "VariableID:primary"
          }
        ]
      },
      children: []
    }
  ], {
    documentResources: {
      variables: [
        {
          id: "VariableID:primary",
          name: "Primary/500",
          valuesByMode: {
            "mode-id": { r: 0.2, g: 0.4, b: 1, a: 1 }
          }
        }
      ],
      variableCollections: [],
      styles: {
        paints: [],
        texts: [],
        effects: [],
        grids: []
      }
    }
  });

  assert.equal(result.designTokens.colors["Primary/500"], "#3366ff");
  assert.equal(result.nodes[0].css.background, "var(--primary-500, #3366ff)");
});

test("AI CSS maps effects, gradients, clipping, and tightened sizing", async () => {
  const result = await serializeSelectionForAi([
    {
      id: "1:1",
      name: "Visual",
      type: "FRAME",
      width: 200,
      height: 100,
      layoutSizingHorizontal: "FIXED",
      layoutSizingVertical: "FIXED",
      clipsContent: true,
      fills: [
        {
          type: "GRADIENT_LINEAR",
          visible: true,
          gradientHandlePositions: [
            { x: 0, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 0 }
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }
          ]
        }
      ],
      effects: [
        {
          type: "DROP_SHADOW",
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 0, y: 4 },
          radius: 12,
          spread: 1
        },
        {
          type: "LAYER_BLUR",
          visible: true,
          radius: 3
        },
        {
          type: "BACKGROUND_BLUR",
          visible: true,
          radius: 6
        }
      ],
      children: []
    },
    {
      id: "2:1",
      name: "Implicit Size",
      type: "FRAME",
      width: 123,
      height: 45,
      fills: [],
      children: []
    }
  ]);

  assert.equal(result.nodes[0].css.background, "linear-gradient(180deg, #ff0000 0%, #0000ff 100%)");
  assert.equal(result.nodes[0].css.boxShadow, "0px 4px 12px 1px rgba(0, 0, 0, 0.25)");
  assert.equal(result.nodes[0].css.filter, "blur(3px)");
  assert.equal(result.nodes[0].css.backdropFilter, "blur(6px)");
  assert.equal(result.nodes[0].css.overflow, "hidden");
  assert.equal(result.nodes[0].css.width, "200px");
  assert.equal(result.nodes[0].css.height, "100px");
  assert.equal(result.nodes[1].css.width, undefined);
  assert.equal(result.nodes[1].css.height, undefined);
  assert.equal(result.nodes[0].positioning, undefined);
});

test("AI CSS maps advanced gradients, layered fills, opacity, rotation, text decoration and stroke alignment", async () => {
  const result = await serializeSelectionForAi([
    {
      id: "1:1",
      name: "Layered Button",
      type: "FRAME",
      width: 120,
      height: 48,
      layoutSizingHorizontal: "FIXED",
      layoutSizingVertical: "FIXED",
      opacity: 0.5,
      rotation: 45,
      cornerRadius: 8,
      fills: [
        { type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 }, opacity: 1 },
        {
          type: "GRADIENT_RADIAL",
          visible: true,
          gradientHandlePositions: [
            { x: 0.5, y: 0.5 },
            { x: 1, y: 0.5 },
            { x: 0.5, y: 1 }
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } }
          ]
        }
      ],
      strokes: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 }, opacity: 1 }],
      strokeWeight: 2,
      strokeAlign: "INSIDE",
      children: []
    },
    {
      id: "2:1",
      name: "Title",
      type: "TEXT",
      fills: [{ type: "SOLID", visible: true, color: { r: 0.2, g: 0.4, b: 1 }, opacity: 1 }],
      characters: "Heading",
      fontSize: 32,
      textDecoration: "UNDERLINE",
      children: []
    },
    {
      id: "3:1",
      name: "Diamond",
      type: "FRAME",
      fills: [
        {
          type: "GRADIENT_DIAMOND",
          visible: true,
          gradientHandlePositions: [
            { x: 0.25, y: 0.75 },
            { x: 1, y: 0.75 },
            { x: 0.25, y: 1 }
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 1, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 1, b: 1, a: 1 } }
          ]
        }
      ],
      children: []
    },
    {
      id: "4:1",
      name: "Angular",
      type: "FRAME",
      fills: [
        {
          type: "GRADIENT_ANGULAR",
          visible: true,
          gradientHandlePositions: [
            { x: 0.5, y: 0.5 },
            { x: 0.5, y: 0 },
            { x: 1, y: 0.5 }
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }
          ]
        }
      ],
      children: []
    }
  ]);

  assert.equal(result.nodes[0].css.background, "radial-gradient(ellipse at 50% 50%, #ff0000 0%, rgba(0, 0, 255, 0.5) 100%), #ffffff");
  assert.equal(result.nodes[0].css.opacity, 0.5);
  assert.equal(result.nodes[0].css.transform, "rotate(45deg)");
  assert.equal(result.nodes[0].css.boxSizing, "border-box");
  assert.equal(result.nodes[0].hints.htmlTag, "button");
  assert.equal(result.nodes[1].css.color, "#3366ff");
  assert.equal(result.nodes[1].css.textDecoration, "underline");
  assert.equal(result.nodes[1].hints.htmlTag, "h1");
  assert.equal(result.nodes[2].css.background, "radial-gradient(closest-side at 25% 75%, #ffff00 0%, #00ffff 100%)");
  assert.deepEqual(result.nodes[2].hints.paintLimitations, ["diamond-gradient-approximated"]);
  assert.equal(result.nodes[3].css.background, "conic-gradient(from 0deg at 50% 50%, #ff0000 0%, #0000ff 100%)");
});

test("AI output maps interactions, summary, diff, and wrapped auto layout grid hints", async () => {
  const selection = [
    {
      id: "1:1",
      name: "Cards",
      type: "FRAME",
      layoutMode: "HORIZONTAL",
      layoutWrap: "WRAP",
      itemSpacing: 12,
      reactions: [
        {
          trigger: { type: "ON_CLICK" },
          action: {
            type: "NODE",
            destinationId: "2:1",
            navigation: "NAVIGATE"
          }
        }
      ],
      children: [
        {
          id: "1:2",
          name: "Card A",
          type: "FRAME",
          visible: true,
          width: 180,
          layoutSizingHorizontal: "FIXED",
          children: []
        },
        {
          id: "1:3",
          name: "Card B",
          type: "FRAME",
          visible: true,
          width: 160,
          layoutSizingHorizontal: "FIXED",
          children: []
        }
      ]
    }
  ];

  const detail = await serializeSelectionForAi(selection);
  assert.equal(detail.nodes[0].css.display, "grid");
  assert.equal(detail.nodes[0].css.gridTemplateColumns, "repeat(auto-fit, minmax(160px, 1fr))");
  assert.equal(detail.nodes[0].hints.layoutIntent, "wrap");
  assert.deepEqual(detail.nodes[0].interactions, [
    {
      trigger: "click",
      action: "navigate",
      destination: { id: "2:1" },
      rawActionType: "NODE",
      navigation: "NAVIGATE"
    }
  ]);

  const summary = await serializeSelectionSummaryForAi(selection);
  assert.equal(summary.schemaVersion, "2.1.0");
  assert.equal(summary.mode, "ai-summary");
  assert.equal(summary.nodes[0].childCount, 2);
  assert.equal(summary.nodes[0].css, undefined);

  const diff = await serializeSelectionDiffForAi(selection, {
    previousHashes: { "1:1": "old-hash" }
  });
  assert.equal(diff.schemaVersion, "2.1.0");
  assert.equal(diff.mode, "ai-diff");
  assert.equal(diff.changed.length > 0, true);
  assert.equal(Array.isArray(diff.removed), true);
  assert.equal(typeof diff.unchangedCount, "number");
});

test("AI summary avoids full detail style reads", async () => {
  let fillsReadCount = 0;
  const node = {
    id: "1:1",
    name: "Summary Only",
    type: "FRAME",
    children: []
  };
  Object.defineProperty(node, "fills", {
    get() {
      fillsReadCount += 1;
      return [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 }, opacity: 1 }];
    }
  });

  const summary = await serializeSelectionSummaryForAi([node]);

  assert.equal(summary.mode, "ai-summary");
  assert.equal(summary.nodes[0].name, "Summary Only");
  assert.equal(summary.nodes[0].css, undefined);
  assert.equal(fillsReadCount, 0);
});

test("AI diff hashes nodes without cascading child changes to ancestors", async () => {
  const original = [
    {
      id: "1:1",
      name: "Parent",
      type: "FRAME",
      children: [
        {
          id: "1:2",
          name: "Leaf",
          type: "TEXT",
          characters: "Before",
          children: []
        }
      ]
    }
  ];
  const baseline = await serializeSelectionDiffForAi(original);
  const changed = [
    {
      id: "1:1",
      name: "Parent",
      type: "FRAME",
      children: [
        {
          id: "1:2",
          name: "Leaf",
          type: "TEXT",
          characters: "After",
          children: []
        }
      ]
    }
  ];

  const diff = await serializeSelectionDiffForAi(changed, {
    previousHashes: baseline.currentHashes
  });

  assert.deepEqual(diff.changed.map((node) => node.id), ["1:2"]);
  assert.equal(diff.unchangedCount, 1);
});

test("AI typography tokens use stable keys independent of node field order", async () => {
  const result = await serializeSelectionForAi([
    {
      id: "1:1",
      name: "A",
      type: "TEXT",
      width: 10,
      height: 10,
      fills: [],
      characters: "A",
      fontName: { family: "Inter", style: "Bold" },
      fontSize: 16,
      fontWeight: 700,
      children: []
    },
    {
      id: "1:2",
      name: "B",
      type: "TEXT",
      width: 10,
      height: 10,
      fills: [],
      fontWeight: 700,
      characters: "B",
      fontSize: 16,
      fontName: { family: "Inter", style: "Bold" },
      children: []
    }
  ]);

  assert.deepEqual(Object.keys(result.designTokens.typography), ["typography_1"]);
  assert.equal(estimateTokens(result.designTokens.typography.typography_1) > 0, true);
});

test("AI helper utilities omit defaults and estimate tokens", () => {
  assert.deepEqual(omitDefaults({
    visible: true,
    opacity: 1,
    custom: "x"
  }, {
    visible: true,
    opacity: 1
  }), {
    custom: "x"
  });
  assert.equal(estimateTokens({ a: "12345678" }) > 0, true);
});
