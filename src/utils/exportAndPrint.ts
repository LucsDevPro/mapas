import * as L from 'leaflet';
import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import {
  CadastralFeature,
  LatLngTuple,
  NeighborhoodMapProject,
  PrintConfig,
} from '../types/gis';
import {
  computeGraphicScaleBar,
  computePolygonCentroid,
  getApproximateScale,
  getMetersPerPixel,
} from './geometryAndGeoJson';

export interface SheetRenderContext {
  leafletMap: L.Map;
  mapElement?: HTMLElement | null;
  beforeCapture?: () => Promise<void>;
  project: NeighborhoodMapProject;
  printConfig?: PrintConfig;
  pixelScale?: number; // 1.4 for fast modal preview, ~4.6 for high-resolution export/print
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(15, 23, 42, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseDashArray(dash: string, scale: number): number[] {
  if (!dash || !dash.trim()) return [];
  return dash
    .split(',')
    .map((n) => Number(n.trim()) * scale)
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawNorthArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  ctx.save();
  // Clean white circular plate
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, size * 0.035);
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  const topY = cy - size * 0.36;
  const bottomY = cy + size * 0.36;
  const halfW = size * 0.22;
  const notchY = cy + size * 0.18;

  // Left dark half of North needle
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx - halfW, bottomY);
  ctx.lineTo(cx, notchY);
  ctx.closePath();
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.stroke();

  // Right white half of North needle
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx + halfW, bottomY);
  ctx.lineTo(cx, notchY);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  // "N" letter
  ctx.font = `800 ${Math.round(size * 0.26)}px Inter, sans-serif`;
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N', cx, topY - size * 0.03);

  ctx.restore();
}

function drawGraphicScale(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  barWidthPx: number,
  totalMeters: number,
  unitScale: number
) {
  ctx.save();
  const padX = 12 * unitScale;
  const padY = 9 * unitScale;
  const barH = 7 * unitScale;
  const boxW = barWidthPx + padX * 2 + 22 * unitScale;
  const boxH = 36 * unitScale;

  drawRoundedRect(ctx, x, y - boxH, boxW, boxH, 4 * unitScale);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.fill();
  ctx.lineWidth = 1.2 * unitScale;
  ctx.strokeStyle = '#334155';
  ctx.stroke();

  const barX = x + padX;
  const barY = y - padY - barH;
  const segW = barWidthPx / 4;

  // 4 alternating black/white segments
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#0f172a' : '#ffffff';
    ctx.fillRect(barX + i * segW, barY, segW, barH);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.1 * unitScale;
    ctx.strokeRect(barX + i * segW, barY, segW, barH);
  }

  // Labels: 0, half, full
  ctx.font = `700 ${Math.round(9.5 * unitScale)}px Inter, sans-serif`;
  ctx.fillStyle = '#0f172a';
  ctx.textBaseline = 'bottom';

  ctx.textAlign = 'left';
  ctx.fillText('0', barX, barY - 3 * unitScale);

  ctx.textAlign = 'center';
  const halfVal = totalMeters / 2;
  const halfText = halfVal >= 1000 ? `${halfVal / 1000} km` : `${halfVal}`;
  ctx.fillText(halfText, barX + barWidthPx / 2, barY - 3 * unitScale);

  ctx.textAlign = 'center';
  const fullText =
    totalMeters >= 1000 ? `${totalMeters / 1000} km` : `${totalMeters} m`;
  ctx.fillText(fullText, barX + barWidthPx, barY - 3 * unitScale);

  ctx.restore();
}

/**
 * Calcula o retângulo central de enquadramento no container Leaflet que corresponde
 * exatamente à proporção da janela útil de mapa na folha A4/A3 escolhida.
 */
export function getMapFrameViewportCrop(
  containerWidth: number,
  containerHeight: number,
  printConfig: PrintConfig
): { cropX: number; cropY: number; cropW: number; cropH: number; mapAspect: number } {
  // Dimensões da folha em mm
  const baseW = printConfig.paperSize === 'A3' ? 420 : 297;
  const baseH = printConfig.paperSize === 'A3' ? 297 : 210;
  const sheetW = printConfig.orientation === 'landscape' ? baseW : baseH;
  const sheetH = printConfig.orientation === 'landscape' ? baseH : baseW;

  // Margens internas da prancha técnica (cabeçalho + rodapé opcional)
  const marginMm = 10;
  const headerMm = 18;
  const footerMm = printConfig.showLegend ? 11 : 3;
  const usableW = sheetW - marginMm * 2;
  const usableH = sheetH - marginMm * 2 - headerMm - footerMm;
  const mapAspect = usableW / usableH;

  const containerAspect = containerWidth / Math.max(1, containerHeight);
  let cropW = containerWidth;
  let cropH = containerHeight;

  if (containerAspect > mapAspect) {
    cropH = containerHeight * 0.92;
    cropW = cropH * mapAspect;
  } else {
    cropW = containerWidth * 0.92;
    cropH = cropW / mapAspect;
  }

  // Se não estiver usando o overlay de corte reduzido, podemos aproveitar até 98% da área mantendo proporção exata
  if (!printConfig.showFrameOverlay) {
    if (containerAspect > mapAspect) {
      cropH = containerHeight;
      cropW = cropH * mapAspect;
    } else {
      cropW = containerWidth;
      cropH = cropW / mapAspect;
    }
  }

  const cropX = (containerWidth - cropW) / 2;
  const cropY = (containerHeight - cropH) / 2;
  return { cropX, cropY, cropW, cropH, mapAspect };
}

/**
 * Compõe a Prancha Cadastral completa em alta resolução (A4 ou A3, Retrato ou Paisagem)
 */
export async function renderCadastralSheetCanvas(
  ctxParams: SheetRenderContext
): Promise<HTMLCanvasElement> {
  const { leafletMap, project, pixelScale = 2.4 } = ctxParams;
  const cfg = ctxParams.printConfig || project.printConfig;

  const baseMmW = cfg.paperSize === 'A3' ? 420 : 297;
  const baseMmH = cfg.paperSize === 'A3' ? 297 : 210;
  const sheetMmW = cfg.orientation === 'landscape' ? baseMmW : baseMmH;
  const sheetMmH = cfg.orientation === 'landscape' ? baseMmH : baseMmW;

  // 1 mm = 4.2 px * pixelScale (em pixelScale 2.4 -> ~2990px para A4, ~4230px para A3!)
  const pxPerMm = (cfg.paperSize === 'A3' ? 3.5 : 4.2) * (pixelScale / 2.0);
  const canvasW = Math.round(sheetMmW * pxPerMm);
  const canvasH = Math.round(sheetMmH * pxPerMm);

  const out = document.createElement('canvas');
  out.width = canvasW;
  out.height = canvasH;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fundo branco puro da folha
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const marginPx = Math.round(10 * pxPerMm);
  const headerH = Math.round(18 * pxPerMm);
  const footerH = Math.round((cfg.showLegend ? 11 : 3) * pxPerMm);

  const frameX = marginPx;
  const frameY = marginPx;
  const frameW = canvasW - marginPx * 2;
  const frameH = canvasH - marginPx * 2;

  // Moldura externa técnica da prancha
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1.8, 0.55 * pxPerMm);
  ctx.strokeRect(frameX, frameY, frameW, frameH);

  // Cabeçalho técnico com nome do bairro e metadados
  const headerBottomY = frameY + headerH;
  ctx.beginPath();
  ctx.moveTo(frameX, headerBottomY);
  ctx.lineTo(frameX + frameW, headerBottomY);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1.4, 0.4 * pxPerMm);
  ctx.stroke();

  const metaBoxW = Math.round(Math.min(frameW * 0.34, 96 * pxPerMm));
  const titleAreaW = frameW - metaBoxW;

  // Linha divisória vertical do cabeçalho
  ctx.beginPath();
  ctx.moveTo(frameX + titleAreaW, frameY);
  ctx.lineTo(frameX + titleAreaW, headerBottomY);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = Math.max(1, 0.3 * pxPerMm);
  ctx.stroke();

  // Textos do título do bairro
  const subtitleText =
    cfg.subtitle?.trim() || 'PLANTA CADASTRAL URBANA • MUNICÍPIO DE PONTA PORÃ – MS';
  const mainTitleText =
    cfg.title?.trim() || `BAIRRO ${project.neighborhoodName.toUpperCase()}`;

  ctx.fillStyle = '#475569';
  ctx.font = `700 ${Math.round(3.1 * pxPerMm)}px Inter, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(subtitleText, frameX + 4 * pxPerMm, frameY + 2.8 * pxPerMm);

  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${Math.round(6.2 * pxPerMm)}px Inter, sans-serif`;
  ctx.fillText(
    mainTitleText,
    frameX + 4 * pxPerMm,
    frameY + 7.4 * pxPerMm,
    titleAreaW - 8 * pxPerMm
  );

  // Metadados técnicos à direita do cabeçalho
  const center = leafletMap.getCenter();
  const zoom = leafletMap.getZoom();
  const approxScale = getApproximateScale(center.lat, zoom);
  const blockCount = project.features.filter((f) => f.kind === 'quarteirao').length;
  const dateStr = new Date().toLocaleDateString('pt-BR');

  const metaX = frameX + titleAreaW + 3.5 * pxPerMm;
  ctx.fillStyle = '#1e293b';
  ctx.font = `600 ${Math.round(2.9 * pxPerMm)}px Inter, sans-serif`;
  ctx.fillText(
    `FORMATO: ${cfg.paperSize} (${
      cfg.orientation === 'landscape' ? 'PAISAGEM' : 'RETRATO'
    })   |   DATA: ${dateStr}`,
    metaX,
    frameY + 3.4 * pxPerMm
  );
  ctx.fillText(
    `ESCALA REF.: 1:${approxScale.toLocaleString('pt-BR')}   |   QUARTEIRÕES: ${blockCount}`,
    metaX,
    frameY + 8.4 * pxPerMm
  );
  ctx.fillStyle = '#475569';
  ctx.font = `500 ${Math.round(2.6 * pxPerMm)}px JetBrains Mono, monospace`;
  ctx.fillText(
    `CENTRO: ${center.lat.toFixed(5)}°, ${center.lng.toFixed(5)}°`,
    metaX,
    frameY + 13.0 * pxPerMm
  );

  // Área útil do mapa na folha
  const mapPad = Math.round(2 * pxPerMm);
  const mapX = frameX + mapPad;
  const mapY = headerBottomY + mapPad;
  const mapW = frameW - mapPad * 2;
  const mapH = frameH - headerH - footerH - mapPad * 2;

  const containerSize = leafletMap.getSize();
  const { cropX, cropY, cropW, cropH } = getMapFrameViewportCrop(
    containerSize.x,
    containerSize.y,
    cfg
  );

  const mapRenderScale = mapW / Math.max(1, cropW);

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapX, mapY, mapW, mapH);
  ctx.clip();

  // Fundo branco da janela cartográfica
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mapX, mapY, mapW, mapH);

  // 1) Captura o mapa Leaflet real (ruas SVG + nomes das ruas + desenhos do usuário)
  let captured: HTMLCanvasElement | null = null;
  if (ctxParams.beforeCapture) {
    try {
      await ctxParams.beforeCapture();
    } catch {
      // prossegue mesmo sem confirmação
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  const mapElement = ctxParams.mapElement || leafletMap.getContainer();
  const captureRatio = Math.min(
    4,
    Math.max(2, (mapW * 1.25) / Math.max(1, cropW))
  );
  try {
    captured = await toCanvas(mapElement, {
      pixelRatio: captureRatio,
      backgroundColor: '#ffffff',
      skipFonts: true,
      filter: (node: Node) => {
        const el = node as HTMLElement;
        if (!el || !el.classList) return true;
        if (el.classList.contains('leaflet-control-container')) return false;
        if (el.classList.contains('no-print')) return false;
        return true;
      },
    });
  } catch {
    captured = null;
  }

  if (captured && captured.width > 0 && captured.height > 0) {
    const ratioX = captured.width / Math.max(1, containerSize.x);
    const ratioY = captured.height / Math.max(1, containerSize.y);
    ctx.drawImage(
      captured,
      cropX * ratioX,
      cropY * ratioY,
      cropW * ratioX,
      cropH * ratioY,
      mapX,
      mapY,
      mapW,
      mapH
    );
  } else {
    // Fallback: desenha os tiles raster (se houver) caso a captura DOM falhe
    const tileImgs = leafletMap
      .getContainer()
      .querySelectorAll<HTMLImageElement>('.leaflet-tile-pane img');
    const containerRect = leafletMap.getContainer().getBoundingClientRect();
    tileImgs.forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) return;
      const r = img.getBoundingClientRect();
      const relX = r.left - containerRect.left;
      const relY = r.top - containerRect.top;
      const dstX = mapX + (relX - cropX) * mapRenderScale;
      const dstY = mapY + (relY - cropY) * mapRenderScale;
      const dstW = r.width * mapRenderScale;
      const dstH = r.height * mapRenderScale;
      try {
        ctx.drawImage(img, dstX, dstY, dstW, dstH);
      } catch {
        // Ignora caso algum tile externo falhe CORS
      }
    });
  }

  // Helper de projeção geográfica -> pixel da folha técnica
  const projectLatLng = (latlng: LatLngTuple): { x: number; y: number } => {
    const pt = leafletMap.latLngToContainerPoint(L.latLng(latlng[0], latlng[1]));
    return {
      x: mapX + (pt.x - cropX) * mapRenderScale,
      y: mapY + (pt.y - cropY) * mapRenderScale,
    };
  };

  if (!captured) {
  // 2) Desenha os elementos vetoriais do usuário (Perímetro do Bairro, Quarteirões, Polígonos, Linhas, Círculos)
  const orderedFeatures: CadastralFeature[] = [
    ...project.features.filter((f) => f.kind === 'bairro'),
    ...project.features.filter((f) => f.kind === 'polygon' || f.kind === 'circle'),
    ...project.features.filter((f) => f.kind === 'quarteirao' && f.geometryType === 'Polygon'),
    ...project.features.filter((f) => f.kind === 'polyline'),
  ];

  for (const feat of orderedFeatures) {
    if (feat.visible === false) continue;
    const st = feat.style;

    ctx.save();
    ctx.setLineDash(parseDashArray(st.dashArray, mapRenderScale));
    ctx.lineWidth = Math.max(1, st.strokeWidth * mapRenderScale);
    ctx.strokeStyle = hexToRgba(st.strokeColor, st.strokeOpacity ?? 1);
    ctx.fillStyle = hexToRgba(st.fillColor, st.fillOpacity ?? 0.08);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (feat.geometryType === 'Polygon') {
      const pts = feat.coordinates as LatLngTuple[];
      if (pts.length >= 3) {
        ctx.beginPath();
        pts.forEach((pt, idx) => {
          const p = projectLatLng(pt);
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        if ((st.fillOpacity ?? 0) > 0.001) ctx.fill();
        ctx.stroke();
      }
    } else if (feat.geometryType === 'LineString') {
      const pts = feat.coordinates as LatLngTuple[];
      if (pts.length >= 2) {
        ctx.beginPath();
        pts.forEach((pt, idx) => {
          const p = projectLatLng(pt);
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
    } else if (feat.geometryType === 'Circle') {
      const centerPt = feat.coordinates as LatLngTuple;
      const p = projectLatLng(centerPt);
      const mPerPx = getMetersPerPixel(centerPt[0], zoom);
      const radiusPx = ((feat.radius || 50) / mPerPx) * mapRenderScale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, radiusPx), 0, Math.PI * 2);
      if ((st.fillOpacity ?? 0) > 0.001) ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  // 3) Desenha os números de Quarteirões e Textos inseridos com nitidez tipográfica absoluta
  for (const feat of project.features) {
    if (feat.visible === false) continue;
    const textValue = feat.name?.trim();
    if (!textValue) continue;
    // Polígonos comuns/linhas/círculos só desenham rótulo se tiverem nome definido; bairros desenham se tiverem nome
    if (
      feat.kind !== 'quarteirao' &&
      feat.kind !== 'text' &&
      feat.kind !== 'bairro' &&
      !textValue
    ) {
      continue;
    }

    let anchor: LatLngTuple | null = null;
    if (feat.geometryType === 'Point' || feat.geometryType === 'Circle') {
      anchor = feat.coordinates as LatLngTuple;
    } else if (feat.geometryType === 'Polygon') {
      anchor =
        feat.labelPosition ||
        computePolygonCentroid(feat.coordinates as LatLngTuple[]);
    }

    if (!anchor) continue;

    // Para polígono de bairro, como o título já aparece no cabeçalho da planta, só desenha etiqueta interna se labelBg === 'badge' e tiver nome
    if (feat.kind === 'bairro' && feat.style.labelBg === 'none') continue;

    const p = projectLatLng(anchor);
    const st = feat.style;
    const fontPx = Math.max(9, Math.round((st.fontSize || 13) * mapRenderScale));
    const weight = st.fontWeight === 'normal' ? '500' : '700';
    const family = st.fontFamily || 'Inter';

    ctx.save();
    ctx.translate(p.x, p.y);
    if (st.rotation) {
      ctx.rotate((st.rotation * Math.PI) / 180);
    }

    ctx.font = `${weight} ${fontPx}px "${family}", Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (st.labelBg === 'badge') {
      const metrics = ctx.measureText(textValue);
      const padX = fontPx * 0.5;
      const padY = fontPx * 0.28;
      const bw = metrics.width + padX * 2;
      const bh = fontPx + padY * 2;
      drawRoundedRect(ctx, -bw / 2, -bh / 2, bw, bh, fontPx * 0.28);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fill();
      ctx.lineWidth = Math.max(1, 1.2 * mapRenderScale);
      ctx.strokeStyle = st.strokeColor || st.textColor || '#1e3a8a';
      ctx.stroke();
    } else if (st.labelBg === 'halo') {
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = Math.max(2.5, fontPx * 0.26);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(textValue, 0, 0);
    }

    ctx.fillStyle = st.textColor || '#0f172a';
    ctx.fillText(textValue, 0, 0);
    ctx.restore();
  }

  }

  // 4) Orientação Norte (canto superior direito do mapa)
  const uiScale = Math.max(1, pxPerMm * 0.34);
  if (cfg.showNorthArrow) {
    const arrowSize = Math.round(14 * pxPerMm);
    drawNorthArrow(
      ctx,
      mapX + mapW - arrowSize * 0.85,
      mapY + arrowSize * 0.85,
      arrowSize
    );
  }

  // 5) Escala Gráfica Real (canto inferior esquerdo do mapa)
  if (cfg.showScaleBar) {
    const spec = computeGraphicScaleBar(center.lat, zoom, 155);
    const scaledBarPx = spec.pixelWidth * mapRenderScale;
    drawGraphicScale(
      ctx,
      mapX + Math.round(4 * pxPerMm),
      mapY + mapH - Math.round(3.5 * pxPerMm),
      scaledBarPx,
      spec.totalMeters,
      uiScale
    );
  }

  ctx.restore(); // Fim do clip da janela do mapa

  // Borda interna da janela cartográfica
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = Math.max(1, 0.3 * pxPerMm);
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  // 6) Rodapé / Legenda Cadastral
  if (cfg.showLegend) {
    const legY = mapY + mapH + Math.round(2.5 * pxPerMm);
    let curX = mapX;

    // Swatch Perímetro do Bairro
    const bStyle = project.defaultStyles.bairro;
    ctx.save();
    ctx.strokeStyle = bStyle.strokeColor;
    ctx.lineWidth = Math.max(1.5, 0.55 * pxPerMm);
    ctx.setLineDash([2 * pxPerMm, 1.2 * pxPerMm]);
    ctx.strokeRect(curX, legY + 0.8 * pxPerMm, 6 * pxPerMm, 3.6 * pxPerMm);
    ctx.restore();

    ctx.fillStyle = '#1e293b';
    ctx.font = `600 ${Math.round(2.7 * pxPerMm)}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Limite do Bairro', curX + 7.5 * pxPerMm, legY + 1.1 * pxPerMm);

    curX += 35 * pxPerMm;

    // Swatch Quarteirão
    const qStyle = project.defaultStyles.quarteirao;
    ctx.save();
    ctx.fillStyle = hexToRgba(qStyle.fillColor, Math.max(0.12, qStyle.fillOpacity));
    ctx.strokeStyle = qStyle.strokeColor;
    ctx.lineWidth = Math.max(1.3, 0.45 * pxPerMm);
    ctx.fillRect(curX, legY + 0.8 * pxPerMm, 6 * pxPerMm, 3.6 * pxPerMm);
    ctx.strokeRect(curX, legY + 0.8 * pxPerMm, 6 * pxPerMm, 3.6 * pxPerMm);
    ctx.restore();

    ctx.fillStyle = '#1e293b';
    ctx.fillText(
      'Quarteirão Delimitado / Numerado',
      curX + 7.5 * pxPerMm,
      legY + 1.1 * pxPerMm
    );

    // Crédito técnico OpenStreetMap à direita
    ctx.fillStyle = '#64748b';
    ctx.font = `500 ${Math.round(2.5 * pxPerMm)}px Inter, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(
      'Base Cartográfica: OpenStreetMap • Planta Cadastral Urbana de Ponta Porã – MS',
      mapX + mapW,
      legY + 1.3 * pxPerMm
    );
  }

  return out;
}

function sanitizeFilename(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Mapa_Bairro'
  );
}

export async function exportProjectAsPNG(ctxParams: SheetRenderContext): Promise<void> {
  const canvas = await renderCadastralSheetCanvas({
    ...ctxParams,
    pixelScale: 4.6,
  });
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const link = document.createElement('a');
  const slug = sanitizeFilename(ctxParams.project.neighborhoodName);
  link.download = `Planta_Cadastral_${slug}_Ponta_Pora.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exportProjectAsPDF(ctxParams: SheetRenderContext): Promise<void> {
  const cfg = ctxParams.printConfig || ctxParams.project.printConfig;
  const canvas = await renderCadastralSheetCanvas({
    ...ctxParams,
    pixelScale: 4.6,
  });
  const dataUrl = canvas.toDataURL('image/png', 1.0);

  const pdf = new jsPDF({
    orientation: cfg.orientation === 'landscape' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: cfg.paperSize.toLowerCase(), // 'a4' | 'a3'
    compress: true,
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');

  const slug = sanitizeFilename(ctxParams.project.neighborhoodName);
  pdf.save(
    `Planta_Cadastral_${slug}_${cfg.paperSize}_${
      cfg.orientation === 'landscape' ? 'Paisagem' : 'Retrato'
    }.pdf`
  );
}

export async function printProjectSheet(ctxParams: SheetRenderContext): Promise<void> {
  const cfg = ctxParams.printConfig || ctxParams.project.printConfig;
  const canvas = await renderCadastralSheetCanvas({
    ...ctxParams,
    pixelScale: 4.6,
  });
  const dataUrl = canvas.toDataURL('image/png', 1.0);

  // Configura dinamicamente o tamanho exato da folha (A4 ou A3) e orientação no navegador
  let styleEl = document.getElementById('dynamic-print-page-style') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-print-page-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@media print { @page { size: ${cfg.paperSize} ${cfg.orientation}; margin: 4mm; } }`;

  let container = document.getElementById('print-sheet-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'print-sheet-container';
    document.body.appendChild(container);
  }

  container.innerHTML = '';
  const img = new Image();
  img.src = dataUrl;
  img.alt = `Planta Cadastral - ${ctxParams.project.neighborhoodName}`;
  container.appendChild(img);

  await new Promise<void>((resolve) => {
    if (img.complete) resolve();
    else {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    }
  });

  window.print();
}
