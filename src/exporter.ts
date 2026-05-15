(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.SelectionStyleExporter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NODE_FIELDS = [
    "id",
    "name",
    "type",
    "visible",
    "locked",
    "removed",
    "opacity",
    "blendMode",
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "absoluteBoundingBox",
    "absoluteRenderBounds",
    "relativeTransform",
    "layoutMode",
    "layoutWrap",
    "layoutSizingHorizontal",
    "layoutSizingVertical",
    "layoutPositioning",
    "primaryAxisSizingMode",
    "counterAxisSizingMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "layoutAlign",
    "layoutGrow",
    "itemSpacing",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "strokesIncludedInLayout",
    "layoutGrids",
    "clipsContent",
    "constraints",
    "cornerRadius",
    "cornerSmoothing",
    "topLeftRadius",
    "topRightRadius",
    "bottomRightRadius",
    "bottomLeftRadius",
    "componentProperties",
    "componentPropertyReferences",
    "componentPropertyDefinitions",
    "variantProperties",
    "scaleFactor",
    "overrides",
    "isExposedInstance",
    "exposedInstances",
    "exportSettings",
    "reactions",
    "overflowDirection",
    "numberOfFixedChildren",
    "overlayPositionType",
    "overlayBackground",
    "overlayBackgroundInteraction",
    "expanded",
    "detachedInfo",
    "annotations",
    "targetAspectRatio",
    "individualStrokeWeights",
    "variableWidthStrokeProperties",
    "complexStrokeProperties"
  ];

  const STYLE_FIELDS = [
    "fills",
    "strokes",
    "strokeWeight",
    "strokeAlign",
    "strokeCap",
    "strokeJoin",
    "dashPattern",
    "effects",
    "effectStyleId",
    "fillStyleId",
    "strokeStyleId",
    "backgrounds",
    "backgroundStyleId",
    "gridStyleId",
    "textStyleId",
    "fontName",
    "fontSize",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "paragraphIndent",
    "paragraphSpacing",
    "textAlignHorizontal",
    "textAlignVertical",
    "textAutoResize",
    "textCase",
    "textDecoration",
    "characters"
  ];

  function isRecord(value) {
    return value !== null && typeof value === "object";
  }

  function safeValue(value, seen) {
    seen = seen || new WeakSet();

    if (value === undefined || typeof value === "function") {
      return undefined;
    }

    if (typeof value === "symbol") {
      return String(value);
    }

    if (!isRecord(value)) {
      return value;
    }

    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    if (Array.isArray(value)) {
      const arrayValue = value
        .map((item) => safeValue(item, seen))
        .filter((item) => item !== undefined);
      seen.delete(value);
      return arrayValue;
    }

    const result = {};
    Object.keys(value).forEach((key) => {
      const childValue = safeValue(value[key], seen);
      if (childValue !== undefined) {
        result[key] = childValue;
      }
    });
    seen.delete(value);
    return result;
  }

  function readField(node, field, seen) {
    if (!(field in node)) {
      return undefined;
    }

    try {
      return safeValue(node[field], seen || new WeakSet());
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function readFields(node, fields) {
    const result = {};
    const seen = new WeakSet();
    fields.forEach((field) => {
      const value = readField(node, field, seen);
      if (value !== undefined) {
        result[field] = value;
      }
    });
    return result;
  }

  function collectVariableAliases(value, result) {
    if (!isRecord(value)) {
      return;
    }

    if (value.type === "VARIABLE_ALIAS" && typeof value.id === "string") {
      result[value.id] = true;
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectVariableAliases(item, result));
      return;
    }

    Object.keys(value).forEach((key) => {
      collectVariableAliases(value[key], result);
    });
  }

  function recordId(target, id) {
    if (typeof id === "string" && id && id.indexOf("Symbol(") !== 0) {
      target[id] = true;
    }
  }

  function createExportContext(options) {
    const maxConcurrency = options && typeof options.maxConcurrency === "number"
      ? Math.max(1, Math.floor(options.maxConcurrency))
      : 8;

    return {
      maxConcurrency,
      referencedVariableIds: {},
      referencedStyleIds: {
        paints: {},
        texts: {},
        effects: {},
        grids: {}
      },
      resolveVariable: createPromiseCache(options && options.resolveVariable),
      resolveVariableCollection: createPromiseCache(options && options.resolveVariableCollection)
    };
  }

  function createPromiseCache(resolve) {
    const cache = {};

    if (typeof resolve !== "function") {
      return null;
    }

    return async function cachedResolve(id) {
      if (!Object.prototype.hasOwnProperty.call(cache, id)) {
        cache[id] = Promise.resolve().then(() => resolve(id));
      }

      return cache[id];
    };
  }

  async function mapWithLimit(items, limit, iterator) {
    const result = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        result[index] = await iterator(items[index], index);
      }
    }

    const workers = [];
    const workerCount = Math.min(Math.max(1, limit), items.length);

    for (let index = 0; index < workerCount; index += 1) {
      workers.push(worker());
    }

    await Promise.all(workers);
    return result;
  }

  function recordStyleReferences(styles, exportContext) {
    if (!exportContext) {
      return;
    }

    recordId(exportContext.referencedStyleIds.paints, styles.fillStyleId);
    recordId(exportContext.referencedStyleIds.paints, styles.backgroundStyleId);
    recordId(exportContext.referencedStyleIds.texts, styles.textStyleId);
    recordId(exportContext.referencedStyleIds.effects, styles.effectStyleId);
    recordId(exportContext.referencedStyleIds.grids, styles.gridStyleId);
    recordId(exportContext.referencedStyleIds.paints, styles.strokeStyleId);
  }

  function cloneVariable(variable) {
    if (!variable) {
      return null;
    }

    return safeValue({
      id: variable.id,
      key: variable.key,
      name: variable.name,
      description: variable.description,
      remote: variable.remote,
      resolvedType: variable.resolvedType,
      collectionId: variable.variableCollectionId || variable.collectionId,
      valuesByMode: variable.valuesByMode
    }, new WeakSet());
  }

  function cloneVariableCollection(collection) {
    if (!collection) {
      return null;
    }

    return safeValue({
      id: collection.id,
      key: collection.key,
      name: collection.name,
      remote: collection.remote,
      defaultModeId: collection.defaultModeId,
      modes: collection.modes
    }, new WeakSet());
  }

  function readObjectProperty(object, property) {
    try {
      return safeValue(object[property], new WeakSet());
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function readObjectProperties(object, properties) {
    const result = {};

    properties.forEach((property) => {
      const value = readObjectProperty(object, property);

      if (value !== undefined) {
        result[property] = value;
      }
    });

    return result;
  }

  function clonePaintStyle(style) {
    return safeValue({
      id: style.id,
      key: style.key,
      name: style.name,
      description: style.description,
      remote: style.remote,
      type: style.type,
      paints: style.paints
    }, new WeakSet());
  }

  function cloneTextStyle(style) {
    return safeValue({
      id: style.id,
      key: style.key,
      name: style.name,
      description: style.description,
      remote: style.remote,
      type: style.type,
      fontName: style.fontName,
      fontSize: style.fontSize,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      paragraphIndent: style.paragraphIndent,
      paragraphSpacing: style.paragraphSpacing,
      textCase: style.textCase,
      textDecoration: style.textDecoration
    }, new WeakSet());
  }

  function cloneEffectStyle(style) {
    return safeValue({
      id: style.id,
      key: style.key,
      name: style.name,
      description: style.description,
      remote: style.remote,
      type: style.type,
      effects: style.effects
    }, new WeakSet());
  }

  function cloneGridStyle(style) {
    return safeValue({
      id: style.id,
      key: style.key,
      name: style.name,
      description: style.description,
      remote: style.remote,
      type: style.type,
      layoutGrids: style.layoutGrids
    }, new WeakSet());
  }

  function cloneDocumentResources(resources) {
    if (!resources) {
      return undefined;
    }

    return safeValue(resources, new WeakSet());
  }

  function ensureDocumentResources(resources) {
    const source = resources || {};
    const styles = source.styles || {};

    return {
      styles: {
        paints: Array.isArray(styles.paints) ? styles.paints.slice() : [],
        texts: Array.isArray(styles.texts) ? styles.texts.slice() : [],
        effects: Array.isArray(styles.effects) ? styles.effects.slice() : [],
        grids: Array.isArray(styles.grids) ? styles.grids.slice() : []
      },
      variables: Array.isArray(source.variables) ? source.variables.slice() : [],
      variableCollections: Array.isArray(source.variableCollections) ? source.variableCollections.slice() : []
    };
  }

  function hasId(idSet, value) {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(idSet, value);
  }

  function filterStylesById(styles, idSet) {
    return styles.filter((style) => hasId(idSet, style.id) || hasId(idSet, style.key));
  }

  function filterDocumentResources(resources, exportContext, options) {
    const normalized = ensureDocumentResources(resources);

    if (options && options.resourceMode === "fullResources") {
      return normalized;
    }

    const usedCollectionIds = {};
    normalized.styles.paints = filterStylesById(normalized.styles.paints, exportContext.referencedStyleIds.paints);
    normalized.styles.texts = filterStylesById(normalized.styles.texts, exportContext.referencedStyleIds.texts);
    normalized.styles.effects = filterStylesById(normalized.styles.effects, exportContext.referencedStyleIds.effects);
    normalized.styles.grids = filterStylesById(normalized.styles.grids, exportContext.referencedStyleIds.grids);
    normalized.variables = normalized.variables.filter((variable) => {
      const used = hasId(exportContext.referencedVariableIds, variable.id) || hasId(exportContext.referencedVariableIds, variable.key);

      const collectionId = variable.collectionId || variable.variableCollectionId;

      if (used && collectionId) {
        usedCollectionIds[collectionId] = true;
      }

      return used;
    });
    normalized.variableCollections = normalized.variableCollections.filter((collection) => {
      return hasId(usedCollectionIds, collection.id) || hasId(usedCollectionIds, collection.key);
    });

    return normalized;
  }

  function appendUniqueById(target, source) {
    const seen = {};

    target.forEach((item) => {
      recordId(seen, item.id);
      recordId(seen, item.key);
    });

    source.forEach((item) => {
      if (!item || hasId(seen, item.id) || hasId(seen, item.key)) {
        return;
      }

      target.push(item);
      recordId(seen, item.id);
      recordId(seen, item.key);
    });
  }

  function mergeVariableResources(resources, resolvedResources, options) {
    const normalized = ensureDocumentResources(resources);

    if (!resolvedResources) {
      return normalized;
    }

    appendUniqueById(normalized.variables, resolvedResources.variables || []);

    appendUniqueById(normalized.variableCollections, resolvedResources.variableCollections || []);

    return normalized;
  }

  function cloneComponentSet(componentSet) {
    if (!componentSet) {
      return null;
    }

    return readObjectProperties(componentSet, [
      "id",
      "key",
      "name",
      "type",
      "remote",
      "description",
      "variantGroupProperties",
      "componentPropertyDefinitions"
    ]);
  }

  function cloneComponent(component) {
    if (!component) {
      return null;
    }

    const result = readObjectProperties(component, [
      "id",
      "key",
      "name",
      "type",
      "remote",
      "description",
      "componentPropertyDefinitions",
      "variantProperties"
    ]);

    if (component.parent && component.parent.type === "COMPONENT_SET") {
      result.componentSet = cloneComponentSet(component.parent);
    }

    return result;
  }

  async function readComponentSource(node) {
    if (typeof node.getMainComponentAsync !== "function") {
      return undefined;
    }

    try {
      return cloneComponent(await node.getMainComponentAsync());
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function recordVariableReferences(styles, exportContext) {
    const ids = {};
    collectVariableAliases(styles, ids);
    const variableIds = Object.keys(ids);

    if (!variableIds.length) {
      return;
    }

    const references = {};

    for (let index = 0; index < variableIds.length; index += 1) {
      const id = variableIds[index];
      references[id] = {
        id
      };

      if (exportContext) {
        recordId(exportContext.referencedVariableIds, id);
      }
    }

    styles.resolvedVariables = references;
  }

  async function resolveReferencedVariables(exportContext) {
    const result = {
      variables: [],
      variableCollections: []
    };
    const resolveVariable = exportContext && exportContext.resolveVariable;

    if (typeof resolveVariable !== "function") {
      return result;
    }

    const collectionById = {};
    const variableIds = Object.keys(exportContext.referencedVariableIds);

    for (let index = 0; index < variableIds.length; index += 1) {
      const id = variableIds[index];

      try {
        const variable = await resolveVariable(id);
        const clonedVariable = cloneVariable(variable);

        if (!clonedVariable) {
          continue;
        }

        if (clonedVariable.collectionId && typeof exportContext.resolveVariableCollection === "function") {
          const collection = await exportContext.resolveVariableCollection(clonedVariable.collectionId);
          clonedVariable.collection = cloneVariableCollection(collection);

          if (clonedVariable.collection) {
            collectionById[clonedVariable.collection.id] = clonedVariable.collection;
          }
        }

        result.variables.push(clonedVariable);
      } catch (error) {
        result.variables.push({
          id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    result.variableCollections = Object.keys(collectionById).map((id) => collectionById[id]);
    return result;
  }

  async function serializeNode(node, context, options, exportContext) {
    const nodeContext = context || {};
    const structure = readFields(node, NODE_FIELDS);
    const styles = readFields(node, STYLE_FIELDS);

    if ("boundVariables" in node) {
      styles.boundVariables = readField(node, "boundVariables");
    }

    if ("explicitVariableModes" in node) {
      styles.explicitVariableModes = readField(node, "explicitVariableModes");
    }

    recordStyleReferences(styles, exportContext);
    recordVariableReferences(styles, exportContext);
    const componentSource = await readComponentSource(node);

    const path = Array.isArray(nodeContext.path)
      ? nodeContext.path.concat([node.name])
      : [node.name];
    const children = "children" in node && Array.isArray(node.children)
      ? await mapWithLimit(node.children, exportContext ? exportContext.maxConcurrency : 8, (child) => serializeNode(child, {
        parentId: node.id,
        depth: typeof nodeContext.depth === "number" ? nodeContext.depth + 1 : 1,
        path
      }, options, exportContext))
      : [];
    const result = {};

    Object.keys(structure).forEach((key) => {
      result[key] = structure[key];
    });
    result.parentId = Object.prototype.hasOwnProperty.call(nodeContext, "parentId")
      ? nodeContext.parentId
      : null;
    result.depth = typeof nodeContext.depth === "number" ? nodeContext.depth : 0;
    result.path = path;
    result.pathString = path.join(" / ");
    if (componentSource !== undefined) {
      result.componentSource = componentSource;
    }
    result.styles = styles;
    result.children = children;

    return result;
  }

  async function serializeSelection(selection, options) {
    const selectedNodes = Array.from(selection || []);
    const exportContext = createExportContext(options || {});
    const result = {
      plugin: "Selection Style Exporter",
      exportedAt: new Date().toISOString(),
      selectionCount: selectedNodes.length,
      fileKey: options && options.fileKey ? options.fileKey : null,
      page: options && options.page ? options.page : null,
      nodes: await mapWithLimit(selectedNodes, exportContext.maxConcurrency, (node) => serializeNode(node, {
        parentId: null,
        depth: 0,
        path: []
      }, options, exportContext))
    };

    const clonedDocumentResources = cloneDocumentResources(options && options.documentResources);
    const filteredDocumentResources = clonedDocumentResources !== undefined
      ? filterDocumentResources(clonedDocumentResources, exportContext, options || {})
      : undefined;
    const resolvedVariableResources = await resolveReferencedVariables(exportContext);
    const hasResolvedVariables = resolvedVariableResources.variables.length || resolvedVariableResources.variableCollections.length;

    if (filteredDocumentResources !== undefined || hasResolvedVariables) {
      result.documentResources = mergeVariableResources(filteredDocumentResources, resolvedVariableResources, options || {});
    }

    return result;
  }

  function roundColorChannel(value) {
    return Math.max(0, Math.min(255, Math.round((value || 0) * 255)));
  }

  function colorToHex(color, alpha) {
    const r = roundColorChannel(color && color.r);
    const g = roundColorChannel(color && color.g);
    const b = roundColorChannel(color && color.b);

    if (typeof alpha === "number" && alpha < 1) {
      return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
    }

    function toHex(value) {
      return value.toString(16).padStart(2, "0");
    }

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function cssVariableName(name) {
    return String(name || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  }

  function colorFromVariable(variable) {
    if (!variable || !variable.valuesByMode) {
      return undefined;
    }

    const modeIds = Object.keys(variable.valuesByMode);
    if (!modeIds.length) {
      return undefined;
    }

    const value = variable.valuesByMode[modeIds[0]];
    if (!value || typeof value !== "object" || typeof value.r !== "number") {
      return undefined;
    }

    return colorToHex(value, typeof value.a === "number" ? value.a : 1);
  }

  function variableAliasIdFromPaint(paint) {
    if (!paint || !paint.boundVariables) {
      return undefined;
    }

    const alias = paint.boundVariables.color || paint.boundVariables.fill || paint.boundVariables.fills;
    if (alias && alias.type === "VARIABLE_ALIAS") {
      return alias.id;
    }

    return undefined;
  }

  function paintToCss(paint) {
    if (!paint || paint.visible === false) {
      return undefined;
    }

    if (paint.type === "SOLID") {
      const alpha = typeof paint.opacity === "number" ? paint.opacity : 1;
      return colorToHex(paint.color, alpha);
    }

    if (paint.type === "GRADIENT_LINEAR" && Array.isArray(paint.gradientStops)) {
      return `linear-gradient(${gradientAngleToCss(paint)}deg, ${gradientStopsToCss(paint.gradientStops)})`;
    }

    if (paint.type === "GRADIENT_RADIAL" && Array.isArray(paint.gradientStops)) {
      return `radial-gradient(ellipse at ${gradientCenterToCss(paint)}, ${gradientStopsToCss(paint.gradientStops)})`;
    }

    if (paint.type === "GRADIENT_ANGULAR" && Array.isArray(paint.gradientStops)) {
      return `conic-gradient(from ${gradientAngleToCss(paint)}deg at ${gradientCenterToCss(paint)}, ${gradientStopsToCss(paint.gradientStops)})`;
    }

    if (paint.type === "GRADIENT_DIAMOND" && Array.isArray(paint.gradientStops)) {
      return `radial-gradient(closest-side at ${gradientCenterToCss(paint)}, ${gradientStopsToCss(paint.gradientStops)})`;
    }

    return paint.type ? paint.type.toLowerCase() : undefined;
  }

  function gradientStopsToCss(stops) {
    return stops.map((stop) => {
      const color = colorToHex(stop.color, stop.color && typeof stop.color.a === "number" ? stop.color.a : 1);
      return `${color} ${Math.round((stop.position || 0) * 100)}%`;
    }).join(", ");
  }

  function gradientAngleToCss(paint) {
    const handles = paint.gradientHandlePositions;
    if (!Array.isArray(handles) || handles.length < 2 || !handles[0] || !handles[1]) {
      return 90;
    }

    const dx = (typeof handles[1].x === "number" ? handles[1].x : 0) - (typeof handles[0].x === "number" ? handles[0].x : 0);
    const dy = (typeof handles[1].y === "number" ? handles[1].y : 0) - (typeof handles[0].y === "number" ? handles[0].y : 0);
    const degrees = (90 + Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    return Math.round(degrees);
  }

  function gradientCenterToCss(paint) {
    const handles = paint.gradientHandlePositions;
    const center = Array.isArray(handles) && handles[0] ? handles[0] : { x: 0.5, y: 0.5 };
    const x = typeof center.x === "number" ? Math.round(center.x * 100) : 50;
    const y = typeof center.y === "number" ? Math.round(center.y * 100) : 50;
    return `${x}% ${y}%`;
  }

  function firstVisiblePaintToCss(paints) {
    if (!Array.isArray(paints)) {
      return undefined;
    }

    for (let index = 0; index < paints.length; index += 1) {
      const css = paintToCss(paints[index]);
      if (css) {
        return css;
      }
    }

    return undefined;
  }

  function visiblePaintsToCss(paints) {
    if (!Array.isArray(paints)) {
      return undefined;
    }

    const layers = [];
    for (let index = 0; index < paints.length; index += 1) {
      const css = paintToCss(paints[index]);
      if (css) {
        layers.push(css);
      }
    }

    if (!layers.length) {
      return undefined;
    }

    return layers.reverse().join(", ");
  }

  function paintLimitationsFromPaints(paints) {
    if (!Array.isArray(paints)) {
      return [];
    }

    const limitations = [];
    paints.forEach((paint) => {
      if (paint && paint.visible !== false && paint.type === "GRADIENT_DIAMOND" && limitations.indexOf("diamond-gradient-approximated") === -1) {
        limitations.push("diamond-gradient-approximated");
      }
    });
    return limitations;
  }

  function firstVisiblePaint(paints) {
    if (!Array.isArray(paints)) {
      return undefined;
    }

    for (let index = 0; index < paints.length; index += 1) {
      if (paints[index] && paints[index].visible !== false) {
        return paints[index];
      }
    }

    return undefined;
  }

  function compactBox(top, right, bottom, left, unit) {
    const values = [top, right, bottom, left].map((value) => typeof value === "number" ? value : 0);
    const formatted = values.map((value) => `${value}${unit || ""}`);

    if (values.every((value) => value === 0)) {
      return undefined;
    }

    if (values[0] === values[1] && values[1] === values[2] && values[2] === values[3]) {
      return formatted[0];
    }

    if (values[0] === values[2] && values[1] === values[3]) {
      return `${formatted[0]} ${formatted[1]}`;
    }

    if (values[1] === values[3]) {
      return `${formatted[0]} ${formatted[1]} ${formatted[2]}`;
    }

    return formatted.join(" ");
  }

  function compactRadius(node) {
    if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      return `${node.cornerRadius}px`;
    }

    return compactBox(
      node.topLeftRadius,
      node.topRightRadius,
      node.bottomRightRadius,
      node.bottomLeftRadius,
      "px"
    );
  }

  function mapMainAxisAlign(value) {
    const map = {
      MIN: "flex-start",
      CENTER: "center",
      MAX: "flex-end",
      SPACE_BETWEEN: "space-between"
    };
    return map[value];
  }

  function mapCrossAxisAlign(value) {
    const map = {
      MIN: "flex-start",
      CENTER: "center",
      MAX: "flex-end",
      BASELINE: "baseline"
    };
    return map[value];
  }

  function lengthValue(value) {
    return typeof value === "number" ? `${value}px` : undefined;
  }

  function lineHeightToCss(lineHeight) {
    if (!lineHeight || typeof lineHeight !== "object") {
      return undefined;
    }

    if (lineHeight.unit === "PIXELS") {
      return `${lineHeight.value}px`;
    }

    if (lineHeight.unit === "PERCENT") {
      return `${Number(lineHeight.value.toFixed(3))}%`;
    }

    return undefined;
  }

  function letterSpacingToCss(letterSpacing) {
    if (!letterSpacing || typeof letterSpacing !== "object") {
      return undefined;
    }

    if (letterSpacing.unit === "PIXELS") {
      return `${letterSpacing.value}px`;
    }

    if (letterSpacing.unit === "PERCENT") {
      return `${Number(letterSpacing.value.toFixed(3))}%`;
    }

    return undefined;
  }

  function mapTextAlign(value) {
    const map = {
      LEFT: "left",
      CENTER: "center",
      RIGHT: "right",
      JUSTIFIED: "justify"
    };
    return map[value];
  }

  function effectColorToCss(color) {
    return colorToHex(color, color && typeof color.a === "number" ? color.a : 1);
  }

  function shadowEffectToCss(effect) {
    const inset = effect.type === "INNER_SHADOW" ? "inset " : "";
    const x = effect.offset && typeof effect.offset.x === "number" ? effect.offset.x : 0;
    const y = effect.offset && typeof effect.offset.y === "number" ? effect.offset.y : 0;
    const radius = typeof effect.radius === "number" ? effect.radius : 0;
    const spread = typeof effect.spread === "number" ? effect.spread : 0;
    return `${inset}${x}px ${y}px ${radius}px ${spread}px ${effectColorToCss(effect.color)}`;
  }

  function addEffectsToCss(css, effects) {
    if (!Array.isArray(effects)) {
      return;
    }

    const shadows = [];
    const filters = [];
    const backdropFilters = [];

    effects.forEach((effect) => {
      if (!effect || effect.visible === false) {
        return;
      }

      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        shadows.push(shadowEffectToCss(effect));
      }

      if (effect.type === "LAYER_BLUR" && typeof effect.radius === "number") {
        filters.push(`blur(${effect.radius}px)`);
      }

      if (effect.type === "BACKGROUND_BLUR" && typeof effect.radius === "number") {
        backdropFilters.push(`blur(${effect.radius}px)`);
      }
    });

    if (shadows.length) {
      css.boxShadow = shadows.join(", ");
    }

    if (filters.length) {
      css.filter = filters.join(" ");
    }

    if (backdropFilters.length) {
      css.backdropFilter = backdropFilters.join(" ");
    }
  }

  function addIfDefined(object, key, value) {
    if (value !== undefined && value !== null && value !== "") {
      object[key] = value;
    }
  }

  function toAiCss(node, styles) {
    const css = {};

    if (node.layoutMode === "VERTICAL" || node.layoutMode === "HORIZONTAL") {
      const gridColumns = gridTemplateColumnsForNode(node);
      if (gridColumns) {
        css.display = "grid";
        css.gridTemplateColumns = gridColumns;
      } else {
        css.display = "flex";
        css.flexDirection = node.layoutMode === "VERTICAL" ? "column" : "row";
        if (node.layoutWrap === "WRAP") {
          css.flexWrap = "wrap";
        }
        addIfDefined(css, "justifyContent", mapMainAxisAlign(node.primaryAxisAlignItems));
        addIfDefined(css, "alignItems", mapCrossAxisAlign(node.counterAxisAlignItems));
      }
      if (typeof node.itemSpacing === "number" && node.itemSpacing !== 0) {
        css.gap = `${node.itemSpacing}px`;
      }
    }

    addIfDefined(css, "padding", compactBox(node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft, "px"));
    addIfDefined(css, "borderRadius", compactRadius(node));

    if (node.layoutSizingHorizontal === "FILL") {
      css.width = "100%";
    } else if (node.layoutSizingHorizontal === "HUG") {
      css.width = "auto";
    } else if (node.layoutSizingHorizontal === "FIXED") {
      css.width = `${node.width}px`;
    }

    if (node.layoutSizingVertical === "FILL") {
      css.height = "100%";
    } else if (node.layoutSizingVertical === "HUG") {
      css.height = "auto";
    } else if (node.layoutSizingVertical === "FIXED") {
      css.height = `${node.height}px`;
    }

    addIfDefined(css, "minWidth", lengthValue(node.minWidth));
    addIfDefined(css, "maxWidth", lengthValue(node.maxWidth));
    addIfDefined(css, "minHeight", lengthValue(node.minHeight));
    addIfDefined(css, "maxHeight", lengthValue(node.maxHeight));

    if (node.clipsContent === true) {
      css.overflow = "hidden";
    }

    if (typeof node.opacity === "number" && node.opacity !== 1) {
      css.opacity = node.opacity;
    }

    if (typeof node.rotation === "number" && node.rotation !== 0) {
      css.transform = `rotate(${node.rotation}deg)`;
    }

    const fillCss = node.type === "TEXT" ? firstVisiblePaintToCss(styles.fills) : visiblePaintsToCss(styles.fills);
    if (fillCss) {
      if (node.type === "TEXT") {
        css.color = fillCss;
      } else {
        css.background = fillCss;
      }
    }

    const strokeCss = firstVisiblePaintToCss(styles.strokes);
    if (strokeCss) {
      const strokeWeight = typeof styles.strokeWeight === "number" ? styles.strokeWeight : 1;
      css.border = `${strokeWeight}px solid ${strokeCss}`;
      if (styles.strokeAlign === "INSIDE") {
        css.boxSizing = "border-box";
      }
    }

    if (styles.fontName && styles.fontName.family) {
      css.fontFamily = styles.fontName.family;
    }
    addIfDefined(css, "fontSize", lengthValue(styles.fontSize));
    addIfDefined(css, "fontWeight", styles.fontWeight);
    addIfDefined(css, "lineHeight", lineHeightToCss(styles.lineHeight));
    addIfDefined(css, "letterSpacing", letterSpacingToCss(styles.letterSpacing));
    addIfDefined(css, "textAlign", mapTextAlign(styles.textAlignHorizontal));
    addIfDefined(css, "textDecoration", mapTextDecoration(styles.textDecoration));
    addEffectsToCss(css, styles.effects);

    return css;
  }

  function gridTemplateColumnsForNode(node) {
    if (node.layoutWrap !== "WRAP" || !Array.isArray(node.children)) {
      return undefined;
    }

    const widths = [];
    node.children.forEach((child) => {
      if (!child || child.visible === false) {
        return;
      }
      if (child.layoutSizingHorizontal === "FIXED" && typeof child.width === "number") {
        widths.push(child.width);
      }
    });

    if (widths.length < 2) {
      return undefined;
    }

    return `repeat(auto-fit, minmax(${Math.min.apply(Math, widths)}px, 1fr))`;
  }

  function mapTextDecoration(value) {
    const map = {
      UNDERLINE: "underline",
      STRIKETHROUGH: "line-through"
    };
    return map[value];
  }

  function isEmptyObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
  }

  function omitDefaults(object, defaults) {
    const result = {};
    Object.keys(object || {}).forEach((key) => {
      const value = object[key];
      if (value === undefined || value === null || value === "") {
        return;
      }
      if (Array.isArray(value) && value.length === 0) {
        return;
      }
      if (isEmptyObject(value)) {
        return;
      }
      if (defaults && Object.prototype.hasOwnProperty.call(defaults, key) && defaults[key] === value) {
        return;
      }
      result[key] = value;
    });
    return result;
  }

  function estimateTokens(value) {
    return Math.ceil(JSON.stringify(value || "").length / 4);
  }

  function createAiContext(options) {
    const variableById = {};
    const resources = ensureDocumentResources(options && options.documentResources);

    resources.variables.forEach((variable) => {
      if (variable && variable.id) {
        variableById[variable.id] = variable;
      }
      if (variable && variable.key) {
        variableById[variable.key] = variable;
      }
    });

    return {
      maxConcurrency: options && typeof options.maxConcurrency === "number" ? Math.max(1, Math.floor(options.maxConcurrency)) : 8,
      nodeCount: 0,
      componentIds: {},
      componentDefinitions: {},
      maxDepth: 0,
      colors: {},
      colorOrder: [],
      typography: {},
      typographyOrder: [],
      spacing: {},
      spacingOrder: [],
      variableById
    };
  }

  function registerToken(map, order, prefix, value, payload) {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(map, value)) {
      const name = `${prefix}_${order.length + 1}`;
      map[value] = {
        name,
        value: payload === undefined ? value : payload
      };
      order.push(value);
    }

    return map[value].name;
  }

  function registerNamedToken(map, order, name, value) {
    if (!name || value === undefined || value === null || value === "") {
      return undefined;
    }

    const key = `named:${name}`;
    if (!Object.prototype.hasOwnProperty.call(map, key)) {
      map[key] = {
        name,
        value
      };
      order.push(key);
    }

    return name;
  }

  function buildDesignTokens(aiContext) {
    const colors = {};
    const typography = {};
    const spacing = {};

    aiContext.colorOrder.forEach((value) => {
      colors[aiContext.colors[value].name] = aiContext.colors[value].value;
    });
    aiContext.typographyOrder.forEach((value) => {
      typography[aiContext.typography[value].name] = aiContext.typography[value].value;
    });
    aiContext.spacingOrder.forEach((value) => {
      spacing[aiContext.spacing[value].name] = aiContext.spacing[value].value;
    });

    return {
      colors,
      typography,
      spacing
    };
  }

  function recordAiTokens(node, styles, css, aiContext) {
    const paintByCssKey = {
      background: firstVisiblePaint(styles.fills),
      color: firstVisiblePaint(styles.fills)
    };

    ["background", "color"].forEach((key) => {
      if (!css[key]) {
        return;
      }

      const variableId = variableAliasIdFromPaint(paintByCssKey[key]);
      const variable = variableId ? aiContext.variableById[variableId] : null;
      const variableColor = colorFromVariable(variable) || css[key];

      if (variable && variable.name) {
        registerNamedToken(aiContext.colors, aiContext.colorOrder, variable.name, variableColor);
        css[key] = `var(--${cssVariableName(variable.name)}, ${variableColor})`;
        return;
      }

      registerToken(aiContext.colors, aiContext.colorOrder, "color", css[key], css[key]);
    });

    ["gap", "padding"].forEach((key) => {
      if (css[key] && css[key].indexOf(" ") === -1) {
        registerToken(aiContext.spacing, aiContext.spacingOrder, "spacing", css[key], css[key]);
      }
    });

    if (typeof node.itemSpacing === "number" && node.itemSpacing !== 0) {
      registerToken(aiContext.spacing, aiContext.spacingOrder, "spacing", `${node.itemSpacing}px`, `${node.itemSpacing}px`);
    }

    const paddingValues = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft];
    paddingValues.forEach((value) => {
      if (typeof value === "number" && value !== 0) {
        registerToken(aiContext.spacing, aiContext.spacingOrder, "spacing", `${value}px`, `${value}px`);
      }
    });

    if (css.fontFamily || css.fontSize || css.fontWeight) {
      const typography = {};
      addIfDefined(typography, "fontFamily", css.fontFamily);
      addIfDefined(typography, "fontSize", css.fontSize);
      addIfDefined(typography, "fontWeight", css.fontWeight);
      const key = [
        typography.fontFamily || "",
        typography.fontSize || "",
        typography.fontWeight || ""
      ].join("|");
      registerToken(aiContext.typography, aiContext.typographyOrder, "typography", key, typography);
    }
  }

  function buildAiPositioning(node, context) {
    const parentLayoutMode = context && context.parentLayoutMode;
    const isAbsolute = node.layoutPositioning === "ABSOLUTE";

    if (isAbsolute) {
      return {
        mode: "absolute",
        x: node.x,
        y: node.y
      };
    }

    if (parentLayoutMode === "VERTICAL" || parentLayoutMode === "HORIZONTAL") {
      return {
        mode: "autoLayoutChild"
      };
    }

    if (context && context.depth > 0) {
      return {
        mode: "freeform",
        x: node.x,
        y: node.y
      };
    }

    return undefined;
  }

  function buildAiFigmaFields(node, styles) {
    const fields = omitDefaults({
      visible: node.visible,
      opacity: node.opacity,
      rotation: node.rotation,
      blendMode: node.blendMode,
      clipsContent: node.clipsContent,
      strokeAlign: styles && styles.strokeAlign,
      componentProperties: readField(node, "componentProperties"),
      variantProperties: readField(node, "variantProperties")
    }, {
      visible: true,
      opacity: 1,
      rotation: 0,
      clipsContent: false,
      strokeAlign: "INSIDE"
    });

    if (fields.blendMode === "PASS_THROUGH" || fields.blendMode === "NORMAL") {
      delete fields.blendMode;
    }

    return fields;
  }

  function buildAiText(styles) {
    return omitDefaults({
      characters: styles.characters,
      textAutoResize: styles.textAutoResize,
      textCase: styles.textCase,
      textDecoration: styles.textDecoration
    }, {
      textCase: "ORIGINAL",
      textDecoration: "NONE"
    });
  }

  function buildAiHints(node, styles, css) {
    const hints = {};
    const name = (node.name || "").toLowerCase();

    if (node.type === "TEXT") {
      const fontSize = typeof styles.fontSize === "number" ? styles.fontSize : 0;
      if (fontSize >= 32) {
        hints.htmlTag = "h1";
      } else if (fontSize >= 24) {
        hints.htmlTag = "h2";
      } else if (fontSize >= 18) {
        hints.htmlTag = "h3";
      } else {
        hints.htmlTag = "p";
      }
    } else if (name.indexOf("button") !== -1 && (css.background || css.borderRadius || hasTextChild(node))) {
      hints.htmlTag = "button";
    } else if (name.indexOf("icon") !== -1 && !hasTextChild(node)) {
      hints.htmlTag = "img";
    }

    if (node.layoutWrap === "WRAP") {
      hints.layoutIntent = "wrap";
    } else if (node.layoutMode === "HORIZONTAL") {
      hints.layoutIntent = "row";
    } else if (node.layoutMode === "VERTICAL") {
      hints.layoutIntent = "stack";
    }

    const paintLimitations = paintLimitationsFromPaints(styles.fills);
    if (paintLimitations.length) {
      hints.paintLimitations = paintLimitations;
    }

    return omitDefaults(hints, {});
  }

  function hasTextChild(node) {
    if (node.type === "TEXT") {
      return true;
    }

    if (!Array.isArray(node.children)) {
      return false;
    }

    for (let index = 0; index < node.children.length; index += 1) {
      if (hasTextChild(node.children[index])) {
        return true;
      }
    }

    return false;
  }

  function buildAiInteractions(node) {
    const reactions = readField(node, "reactions");
    if (!Array.isArray(reactions)) {
      return [];
    }

    return reactions.map((reaction) => {
      if (!reaction || typeof reaction !== "object") {
        return undefined;
      }

      const action = reaction.action || {};
      const interaction = omitDefaults({
        trigger: mapReactionTrigger(reaction.trigger && reaction.trigger.type),
        action: mapReactionAction(action),
        destination: buildInteractionDestination(action),
        rawActionType: action.type,
        navigation: action.navigation,
        url: action.url
      }, {});

      return Object.keys(interaction).length ? interaction : undefined;
    }).filter(Boolean);
  }

  function mapReactionTrigger(value) {
    const map = {
      ON_CLICK: "click",
      ON_HOVER: "hover",
      ON_PRESS: "press"
    };
    return map[value] || value;
  }

  function mapReactionAction(action) {
    if (!action || !action.type) {
      return undefined;
    }

    if (action.type === "NODE") {
      return "navigate";
    }

    if (action.type === "URL") {
      return "open-url";
    }

    return String(action.type).toLowerCase();
  }

  function buildInteractionDestination(action) {
    if (!action || action.type !== "NODE") {
      return undefined;
    }

    return omitDefaults({
      id: action.destinationId,
      name: action.destination && action.destination.name
    }, {});
  }

  function componentIdFromSource(componentSource) {
    if (!componentSource || componentSource.error) {
      return undefined;
    }

    return componentSource.key || componentSource.id;
  }

  function registerComponentDefinition(componentSource, aiContext) {
    const componentId = componentIdFromSource(componentSource);

    if (!componentId || Object.prototype.hasOwnProperty.call(aiContext.componentDefinitions, componentId)) {
      return componentId;
    }

    aiContext.componentDefinitions[componentId] = omitDefaults({
      id: componentSource.id,
      key: componentSource.key,
      name: componentSource.name,
      type: componentSource.type,
      remote: componentSource.remote,
      componentSet: componentSource.componentSet ? omitDefaults({
        id: componentSource.componentSet.id,
        key: componentSource.componentSet.key,
        name: componentSource.componentSet.name,
        type: componentSource.componentSet.type
      }, {}) : undefined,
      variantProperties: componentSource.variantProperties,
      componentPropertyDefinitions: componentSource.componentPropertyDefinitions
    }, {});

    aiContext.componentIds[componentId] = true;
    return componentId;
  }

  async function serializeNodeForAi(node, context, options, aiContext) {
    const nodeContext = context || {};
    aiContext.nodeCount += 1;
    aiContext.maxDepth = Math.max(aiContext.maxDepth, nodeContext.depth || 0);

    const styles = readFields(node, STYLE_FIELDS);
    const css = toAiCss(node, styles);
    recordAiTokens(node, styles, css, aiContext);

    const componentSource = await readComponentSource(node);
    const componentId = registerComponentDefinition(componentSource, aiContext);
    const figmaFields = buildAiFigmaFields(node, styles);
    const text = buildAiText(styles);
    const hints = buildAiHints(node, styles, css);
    const interactions = buildAiInteractions(node);
    const children = "children" in node && Array.isArray(node.children)
      ? await mapWithLimit(node.children, aiContext.maxConcurrency, (child) => serializeNodeForAi(child, {
        depth: (nodeContext.depth || 0) + 1,
        parentLayoutMode: node.layoutMode
      }, options, aiContext))
      : [];

    const result = omitDefaults({
      id: node.id,
      name: node.name,
      type: node.type,
      componentId,
      positioning: buildAiPositioning(node, nodeContext),
      hints,
      interactions,
      text,
      children
    }, {});
    result.css = omitDefaults(css, {});
    result.figma = figmaFields;

    return result;
  }

  async function serializeSelectionForAi(selection, options) {
    const selectedNodes = Array.from(selection || []);
    const aiContext = createAiContext(options || {});
    const nodes = await mapWithLimit(selectedNodes, aiContext.maxConcurrency, (node) => serializeNodeForAi(node, {
      depth: 0,
      parentLayoutMode: null
    }, options || {}, aiContext));
    const result = {
      schemaVersion: "2.1.0",
      mode: "ai-optimized",
      metadata: {
        selectionCount: selectedNodes.length,
        nodeCount: aiContext.nodeCount,
        componentCount: Object.keys(aiContext.componentDefinitions).length,
        maxDepth: aiContext.maxDepth,
        estimatedTokens: 0,
        page: options && options.page ? options.page : null,
        exportedAt: new Date().toISOString()
      },
      designTokens: buildDesignTokens(aiContext),
      componentDefinitions: aiContext.componentDefinitions,
      nodes
    };
    result.metadata.estimatedTokens = estimateTokens(result);
    return result;
  }

  async function serializeSummaryNodeForAi(node, context, options, aiContext) {
    const nodeContext = context || {};
    aiContext.nodeCount += 1;
    aiContext.maxDepth = Math.max(aiContext.maxDepth, nodeContext.depth || 0);

    const componentSource = await readComponentSource(node);
    const componentId = registerComponentDefinition(componentSource, aiContext);
    const children = "children" in node && Array.isArray(node.children)
      ? await mapWithLimit(node.children, aiContext.maxConcurrency, (child) => serializeSummaryNodeForAi(child, {
        depth: (nodeContext.depth || 0) + 1
      }, options, aiContext))
      : [];

    return omitDefaults({
      id: node.id,
      name: node.name,
      type: node.type,
      componentId,
      childCount: children.length,
      children
    }, {
      childCount: 0
    });
  }

  async function serializeSelectionSummaryForAi(selection, options) {
    const selectedNodes = Array.from(selection || []);
    const aiContext = createAiContext(options || {});
    const nodes = await mapWithLimit(selectedNodes, aiContext.maxConcurrency, (node) => serializeSummaryNodeForAi(node, {
      depth: 0
    }, options || {}, aiContext));
    const result = {
      schemaVersion: "2.1.0",
      mode: "ai-summary",
      metadata: {
        selectionCount: selectedNodes.length,
        nodeCount: aiContext.nodeCount,
        componentCount: Object.keys(aiContext.componentDefinitions).length,
        maxDepth: aiContext.maxDepth,
        estimatedTokens: 0,
        page: options && options.page ? options.page : null,
        exportedAt: new Date().toISOString()
      },
      designTokens: buildDesignTokens(aiContext),
      componentDefinitions: aiContext.componentDefinitions,
      nodes
    };
    result.metadata.estimatedTokens = estimateTokens(result);
    return result;
  }

  function flattenAiNodes(nodes, output) {
    output = output || [];
    (nodes || []).forEach((node) => {
      output.push(node);
      flattenAiNodes(node.children || [], output);
    });
    return output;
  }

  function hashAiNode(node) {
    const shallowNode = {};
    Object.keys(node || {}).forEach((key) => {
      if (key !== "children") {
        shallowNode[key] = node[key];
      }
    });
    const serialized = JSON.stringify(shallowNode);
    return String(Math.ceil(serialized.length / 4)) + ":" + serialized.length + ":" + serialized;
  }

  async function serializeSelectionDiffForAi(selection, options) {
    const detail = await serializeSelectionForAi(selection, options || {});
    const previousHashes = options && options.previousHashes ? options.previousHashes : {};
    const currentHashes = {};
    const changed = [];
    const flat = flattenAiNodes(detail.nodes, []);
    let unchangedCount = 0;

    flat.forEach((node) => {
      const hash = hashAiNode(node);
      currentHashes[node.id] = hash;
      if (previousHashes[node.id] === hash) {
        unchangedCount += 1;
      } else {
        changed.push(node);
      }
    });

    const removed = [];
    Object.keys(previousHashes).forEach((id) => {
      if (!Object.prototype.hasOwnProperty.call(currentHashes, id)) {
        removed.push(id);
      }
    });

    return {
      schemaVersion: "2.1.0",
      mode: "ai-diff",
      metadata: detail.metadata,
      designTokens: detail.designTokens,
      componentDefinitions: detail.componentDefinitions,
      changed,
      removed,
      unchangedCount,
      currentHashes
    };
  }

  function buildFileName(selection) {
    const firstName = selection[0] && selection[0].name
      ? selection[0].name
      : "selection";
    const safeName = firstName
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "selection";
    return `${safeName}-figma-export.json`;
  }

  function buildAiFileName(selection) {
    return buildFileName(selection).replace(/-figma-export\.json$/, "-figma-ai-export.json");
  }

  function buildAiSummaryFileName(selection) {
    return buildFileName(selection).replace(/-figma-export\.json$/, "-figma-ai-summary.json");
  }

  function buildAiDiffFileName(selection) {
    return buildFileName(selection).replace(/-figma-export\.json$/, "-figma-ai-diff.json");
  }

  async function callIfAvailable(owner, name) {
    if (!owner || typeof owner[name] !== "function") {
      return [];
    }

    try {
      return await owner[name]();
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async function buildDocumentResources(figmaApi, exporter) {
    const paintStyles = await callIfAvailable(figmaApi, "getLocalPaintStylesAsync");
    const textStyles = await callIfAvailable(figmaApi, "getLocalTextStylesAsync");
    const effectStyles = await callIfAvailable(figmaApi, "getLocalEffectStylesAsync");
    const gridStyles = await callIfAvailable(figmaApi, "getLocalGridStylesAsync");
    const variables = figmaApi.variables
      ? await callIfAvailable(figmaApi.variables, "getLocalVariablesAsync")
      : [];
    const variableCollections = figmaApi.variables
      ? await callIfAvailable(figmaApi.variables, "getLocalVariableCollectionsAsync")
      : [];

    return {
      styles: {
        paints: Array.isArray(paintStyles) ? paintStyles.map(exporter.clonePaintStyle) : paintStyles,
        texts: Array.isArray(textStyles) ? textStyles.map(exporter.cloneTextStyle) : textStyles,
        effects: Array.isArray(effectStyles) ? effectStyles.map(exporter.cloneEffectStyle) : effectStyles,
        grids: Array.isArray(gridStyles) ? gridStyles.map(exporter.cloneGridStyle) : gridStyles
      },
      variables: Array.isArray(variables) ? variables.map(exporter.cloneVariable) : variables,
      variableCollections: Array.isArray(variableCollections) ? variableCollections.map(exporter.cloneVariableCollection) : variableCollections
    };
  }

  return {
    buildDocumentResources,
    buildAiDiffFileName,
    buildAiFileName,
    buildAiSummaryFileName,
    buildFileName,
    callIfAvailable,
    colorToHex,
    compactBox,
    compactRadius,
    cloneEffectStyle,
    cloneGridStyle,
    clonePaintStyle,
    cloneTextStyle,
    cloneVariable,
    cloneVariableCollection,
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
    serializeNodeForAi,
    serializeNode,
    serializeSelection,
    toAiCss
  };
});

(async function runPlugin() {
  if (typeof figma === "undefined") {
    return;
  }

  const exporter = globalThis.SelectionStyleExporter;

  const initialSelection = figma.currentPage.selection;
  const isPanel = figma.command === "open-panel";

  if (!isPanel && !initialSelection.length) {
    figma.notify("Select at least one object before exporting.");
    figma.closePlugin();
  } else {
    figma.showUI(__html__, {
      visible: isPanel,
      width: isPanel ? 360 : 1,
      height: isPanel ? 620 : 1
    });

    const isAiExport = figma.command === "export-ai";
    const isAiSummaryExport = figma.command === "export-ai-summary";
    const resourceMode = figma.command === "export-full"
      ? "fullResources"
      : "referencedOnly";
    const MCP_SERVER_URL = "http://localhost:7800";
    const PLUGIN_VERSION = "1.0.0";
    const mcpSessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const changedNodeIds = {};
    let mcpDebounceTimer = null;
    const detailRequestQueue = [];
    const queuedDetailRequestIds = {};
    let processingDetailRequest = false;
    let uiReady = false;
    let downloadPosted = false;
    let downloadMessage = null;
    let panelStateMessage = null;
    const variableCache = {};
    const variableCollectionCache = {};
    const resolveVariable = figma.variables && typeof figma.variables.getVariableByIdAsync === "function"
      ? async function (id) {
        if (!Object.prototype.hasOwnProperty.call(variableCache, id)) {
          variableCache[id] = figma.variables.getVariableByIdAsync(id);
        }

        return await variableCache[id];
      }
      : null;
    const resolveVariableCollection = figma.variables && typeof figma.variables.getVariableCollectionByIdAsync === "function"
      ? async function (id) {
        if (!Object.prototype.hasOwnProperty.call(variableCollectionCache, id)) {
          variableCollectionCache[id] = figma.variables.getVariableCollectionByIdAsync(id);
        }

        return await variableCollectionCache[id];
      }
      : null;
    function postDownloadIfReady() {
      if (!uiReady || !downloadMessage || downloadPosted) {
        return;
      }

      downloadPosted = true;
      figma.ui.postMessage(downloadMessage);
    }

    function postPanelStateIfReady() {
      if (!uiReady || !panelStateMessage) {
        return;
      }

      figma.ui.postMessage(panelStateMessage);
    }

    async function buildExportOptions(mode) {
      const documentResources = mode === "ai-summary"
        ? null
        : await exporter.buildDocumentResources(figma, exporter);
      return {
        fileKey: figma.fileKey || null,
        page: {
          id: figma.currentPage.id,
          name: figma.currentPage.name
        },
        resolveVariable,
        resolveVariableCollection,
        documentResources,
        resourceMode: mode === "raw-full" ? "fullResources" : resourceMode
      };
    }

    function currentSelection() {
      return Array.from(figma.currentPage.selection || []);
    }

    function buildMcpEnvelope(payload) {
      return {
        fileKey: figma.fileKey || "local",
        pageId: figma.currentPage.id,
        sessionId: mcpSessionId,
        payload
      };
    }

    function buildMcpNodeDetailEnvelope(request, payload, error) {
      return {
        fileKey: figma.fileKey || "local",
        pageId: figma.currentPage.id,
        sessionId: mcpSessionId,
        requestId: request && request.requestId,
        nodeId: request && request.nodeId,
        payload,
        error
      };
    }

    function postMcpConfigIfReady() {
      if (!isPanel || !uiReady) {
        return;
      }

      figma.ui.postMessage({
        type: "mcp-config",
        serverUrl: MCP_SERVER_URL,
        fileKey: figma.fileKey || "local",
        pageId: figma.currentPage.id,
        sessionId: mcpSessionId,
        pluginVersion: PLUGIN_VERSION
      });
    }

    function postMcpStatus(message) {
      if (!isPanel || !uiReady) {
        return;
      }

      figma.ui.postMessage({
        type: "mcp-status",
        message
      });
    }

    function buildPanelReadyMessage(metadata) {
      return {
        type: "panel-ready",
        selectionCount: currentSelection().length,
        changedNodeCount: Object.keys(changedNodeIds).length,
        metadata: metadata || {
          selectionCount: currentSelection().length,
          nodeCount: 0,
          estimatedTokens: 0
        }
      };
    }

    async function buildCurrentSelectionSummary() {
      const selection = currentSelection();
      if (!selection.length) {
        postMcpStatus("No selection");
        return null;
      }

      const options = await buildExportOptions("ai-summary");
      return await exporter.serializeSelectionSummaryForAi(selection, options);
    }

    async function pushCurrentSelectionSummary() {
      if (!isPanel || !uiReady) {
        return;
      }

      try {
        const payload = await buildCurrentSelectionSummary();
        if (!payload) {
          return;
        }

        figma.ui.postMessage({
          type: "mcp-push-summary",
          body: buildMcpEnvelope(payload)
        });
        figma.ui.postMessage(buildPanelReadyMessage(payload.metadata));
      } catch (error) {
        postMcpStatus(`MCP summary failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    function beginCurrentSelectionSummaryPush() {
      if (!isPanel || !uiReady) {
        return;
      }

      figma.ui.postMessage({
        type: "mcp-sync-start",
        syncType: "summary",
        message: "Syncing summary"
      });
      setTimeout(function () {
        pushCurrentSelectionSummary();
      }, 50);
    }

    function scheduleMcpSummaryPush() {
      if (!isPanel) {
        return;
      }

      if (mcpDebounceTimer) {
        clearTimeout(mcpDebounceTimer);
      }

      mcpDebounceTimer = setTimeout(function () {
        mcpDebounceTimer = null;
        beginCurrentSelectionSummaryPush();
      }, 500);
    }

    async function readPreviousHashes() {
      if (!figma.clientStorage || typeof figma.clientStorage.getAsync !== "function") {
        return {};
      }

      const key = `selection-style-exporter:last-ai-hashes:${figma.fileKey || "local"}`;
      return await figma.clientStorage.getAsync(key) || {};
    }

    async function writePreviousHashes(hashes) {
      if (!figma.clientStorage || typeof figma.clientStorage.setAsync !== "function" || !hashes) {
        return;
      }

      const key = `selection-style-exporter:last-ai-hashes:${figma.fileKey || "local"}`;
      await figma.clientStorage.setAsync(key, hashes);
    }

    async function buildExport(profile) {
      const selection = currentSelection();
      const options = await buildExportOptions(profile);
      if (profile === "ai-summary") {
        return {
          filename: exporter.buildAiSummaryFileName(selection),
          payload: await exporter.serializeSelectionSummaryForAi(selection, options)
        };
      }

      if (profile === "ai-diff") {
        options.previousHashes = await readPreviousHashes();
        const payload = await exporter.serializeSelectionDiffForAi(selection, options);
        await writePreviousHashes(payload.currentHashes);
        return {
          filename: exporter.buildAiDiffFileName(selection),
          payload
        };
      }

      if (profile === "raw-full" || profile === "raw-referenced") {
        return {
          filename: exporter.buildFileName(selection),
          payload: await exporter.serializeSelection(selection, options)
        };
      }

      return {
        filename: exporter.buildAiFileName(selection),
        payload: await exporter.serializeSelectionForAi(selection, options)
      };
    }

    async function buildNodeDetailPayload(node) {
      const options = await buildExportOptions("ai-detail");
      return await exporter.serializeSelectionForAi([node], options);
    }

    async function processNextDetailRequest() {
      if (processingDetailRequest || !detailRequestQueue.length) {
        return;
      }

      processingDetailRequest = true;
      const request = detailRequestQueue.shift();
      if (request && request.requestId) {
        delete queuedDetailRequestIds[request.requestId];
      }

      try {
        if (!request || !request.requestId || !request.nodeId) {
          throw new Error("Invalid node detail request");
        }

        figma.ui.postMessage({
          type: "mcp-sync-start",
          syncType: "node-detail",
          message: "Syncing node detail"
        });

        const node = typeof figma.getNodeByIdAsync === "function"
          ? await figma.getNodeByIdAsync(request.nodeId)
          : null;
        if (!node) {
          figma.ui.postMessage({
            type: "mcp-push-node-detail",
            body: buildMcpNodeDetailEnvelope(request, undefined, `Node not found: ${request.nodeId}`)
          });
          return;
        }

        const payload = await buildNodeDetailPayload(node);
        figma.ui.postMessage({
          type: "mcp-push-node-detail",
          body: buildMcpNodeDetailEnvelope(request, payload, undefined)
        });
      } catch (error) {
        figma.ui.postMessage({
          type: "mcp-push-node-detail",
          body: buildMcpNodeDetailEnvelope(request, undefined, error instanceof Error ? error.message : String(error))
        });
      } finally {
        processingDetailRequest = false;
        setTimeout(processNextDetailRequest, 0);
      }
    }

    function enqueueDetailRequest(request) {
      if (!request || !request.requestId || queuedDetailRequestIds[request.requestId]) {
        return;
      }

      queuedDetailRequestIds[request.requestId] = true;
      detailRequestQueue.push(request);
      processNextDetailRequest();
    }

    figma.ui.onmessage = (message) => {
      if (message && message.type === "ui-ready") {
        uiReady = true;
        postDownloadIfReady();
        postPanelStateIfReady();
        postMcpConfigIfReady();
        return;
      }

      if (message && message.type === "panel-export") {
        (async function () {
          try {
            const exportResult = await buildExport(message.profile || "ai-detail");
            figma.ui.postMessage({
              type: message.action === "copy" ? "copy-json" : "download-json",
              filename: exportResult.filename,
              payload: exportResult.payload
            });
            if (isPanel) {
              const panelProfile = message.profile || "ai-detail";
              if (panelProfile === "ai-detail") {
                figma.ui.postMessage({
                  type: "mcp-push-selection",
                  body: buildMcpEnvelope(exportResult.payload)
                });
              } else if (panelProfile === "ai-diff") {
                figma.ui.postMessage({
                  type: "mcp-push-diff",
                  body: buildMcpEnvelope(exportResult.payload)
                });
              }
            }
          } catch (error) {
            figma.ui.postMessage({
              type: "panel-error",
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }());
        return;
      }

      if (message && message.type === "mcp-detail-request") {
        enqueueDetailRequest(message.request);
        return;
      }

      if (message && message.type === "download-complete") {
        figma.notify("Selection styles exported.");
        if (!isPanel) {
          figma.closePlugin();
        }
      }

      if (message && message.type === "download-error") {
        figma.notify(`Export failed: ${message.error}`);
        if (!isPanel) {
          figma.closePlugin();
        }
      }
    };

    if (isPanel && typeof figma.on === "function") {
      try {
        figma.on("selectionchange", function () {
          scheduleMcpSummaryPush();
        });
      } catch (error) {
        postMcpStatus(`MCP listener failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    try {
      if (isPanel) {
        panelStateMessage = buildPanelReadyMessage();
        postPanelStateIfReady();
      } else {
        const profile = isAiExport ? "ai-detail" : isAiSummaryExport ? "ai-summary" : figma.command === "export-full" ? "raw-full" : "raw-referenced";
        const exportResult = await buildExport(profile);
        downloadMessage = {
          type: "download-json",
          filename: exportResult.filename,
          payload: exportResult.payload
        };
        postDownloadIfReady();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (isPanel) {
        panelStateMessage = {
          type: "panel-error",
          error: errorMessage
        };
        postPanelStateIfReady();
        return;
      }

      figma.notify(`Export failed: ${errorMessage}`);
      figma.closePlugin();
    }
  }
}());
