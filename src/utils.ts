import type { TrackPoint } from './types';

// ── WGS-84 → GCJ-02 坐标转换（国测局偏移）──────────────────────────────
const PI = Math.PI;
const A = 6378245.0; // 长半轴
const EE = 0.00669342162296594323; // 扁率

function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

/** WGS-84 → GCJ-02（火星坐标），国内地图偏移修正 */
export function wgs84ToGcj02(lat: number, lng: number): [number, number] {
  if (outOfChina(lat, lng)) return [lat, lng]; // 国外不偏移
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return [lat + dLat, lng + dLng];
}

// ── 通用工具函数 ──────────────────────────────────────────────────────

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
