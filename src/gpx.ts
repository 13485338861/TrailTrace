import type { Track, TrackPoint } from './types';

/** 解析 GPX XML 字符串，返回轨迹点数组 */
export function parseGPX(xmlString: string): TrackPoint[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const pts: TrackPoint[] = [];

  // 尝试 trkpt（TrackPoints）
  const trkpts = doc.querySelectorAll('trkpt');
  if (trkpts.length > 0) {
    trkpts.forEach(pt => {
      pts.push({
        lat: parseFloat(pt.getAttribute('lat') ?? '0'),
        lng: parseFloat(pt.getAttribute('lon') ?? '0'),
        alt: safeFloat(pt.querySelector('ele')?.textContent),
        time: parseTime(pt.querySelector('time')?.textContent ?? ''),
      });
    });
    return pts;
  }

  // 尝试 wpt（Waypoints）
  const wpts = doc.querySelectorAll('wpt');
  if (wpts.length > 0) {
    wpts.forEach(pt => {
      pts.push({
        lat: parseFloat(pt.getAttribute('lat') ?? '0'),
        lng: parseFloat(pt.getAttribute('lon') ?? '0'),
        alt: safeFloat(pt.querySelector('ele')?.textContent),
        time: parseTime(pt.querySelector('time')?.textContent ?? ''),
      });
    });
    return pts;
  }

  return pts;
}

function safeFloat(v: string | null | undefined): number | undefined {
  const n = parseFloat(v ?? '');
  return isNaN(n) ? undefined : n;
}

function parseTime(s: string): number | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

/** 生成 GPX XML 字符串 */
export function toGPX(track: Track): string {
  const pts = track.points;
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="TrailTrace" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <trk>`,
    `    <name>${escapeXml(track.name)}</name>`,
    `    <trkseg>`,
  ];
  pts.forEach(p => {
    const time = p.time ? new Date(p.time).toISOString() : '';
    lines.push(
      `      <trkpt lat="${p.lat}" lon="${p.lng}">` +
      (p.alt != null ? `<ele>${p.alt}</ele>` : '') +
      (time ? `<time>${time}</time>` : '') +
      `</trkpt>`
    );
  });
  lines.push('    </trkseg>', '  </trk>', '</gpx>');
  return lines.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 下载字符串为文件 */
export function downloadFile(content: string, filename: string, mime: string = 'application/gpx+xml') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 读取本地文件为文本 */
export function readFileText(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.onerror = fail;
    r.readAsText(file);
  });
}
