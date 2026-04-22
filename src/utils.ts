import type { TrackPoint } from './types';

/** Haversine 公式，计算两点间球面距离（km） */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 计算轨迹总距离（km） */
export function calcDistance(pts: TrackPoint[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
  }
  return d;
}

/** 计算两点间速度（km/h） */
export function calcSpeed(p1: TrackPoint, p2: TrackPoint): number {
  if (!p1.time || !p2.time) return 0;
  const dt = (p2.time - p1.time) / 3600000; // ms → h
  if (dt <= 0) return 0;
  return haversineKm(p1.lat, p1.lng, p2.lat, p2.lng) / dt;
}

/** 计算海拔增益（m），只统计上升 */
export function calcElevationGain(pts: TrackPoint[]): number {
  let gain = 0;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1].alt;
    const curr = pts[i].alt;
    if (prev != null && curr != null) {
      const diff = curr - prev;
      if (diff > 0) gain += diff;
    }
  }
  return gain;
}

/** 生成唯一 ID */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** 格式化时长 ms → HH:MM:SS */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 格式化距离 km → "x.xx km" */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

/** 格式化速度 km/h */
export function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}

/** 格式化海拔 */
export function formatAlt(alt: number | undefined): string {
  if (alt == null) return '—';
  return `${Math.round(alt)} m`;
}

/** localStorage tracks */
const TRACKS_KEY = 'trailtrace_tracks';

export function loadTracks(): import('./types').Track[] {
  try {
    const raw = localStorage.getItem(TRACKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTracks(tracks: import('./types').Track[]): void {
  localStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));
}
