import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Geolocation } from '@capacitor/geolocation';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import CachedTileLayer, { TILE_SOURCES, type TileSource } from './CachedTileLayer';
import type { Track, TrackPoint, RecordingMode } from './types';
import { parseGPX, toGPX, downloadFile, readFileText } from './gpx';
import {
  calcDistance, calcSpeed, calcElevationGain,
  genId, formatDuration, formatDistance, formatSpeed, formatAlt,
  loadTracks, saveTracks, wgs84ToGcj02,
} from './utils';
import { getCacheStats, clearTileCache, formatCacheSize, prefetchTiles } from './tileCache';

// Leaflet icon fix for Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(delete (L.Icon.Default.prototype as any)._getIconUrl);
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

// Current location marker icon
const locIcon = new L.DivIcon({
  html: `<div style="width:16px;height:16px;background:#10b981;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(16,185,129,0.8)"></div>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// useMap() removed — using mapRef instead (react-leaflet v5 context issue in Capacitor WebView)

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState<RecordingMode>('idle');
  const modeRef = useRef<RecordingMode>(mode);
  modeRef.current = mode;  // always in sync
  const [tileSource, setTileSource] = useState<TileSource>(TILE_SOURCES[0]);
  const [offlineMode, setOfflineMode] = useState(false);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const trackPointsRef = useRef<TrackPoint[]>([]);
  trackPointsRef.current = trackPoints;
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  const [elapsed, setElapsed] = useState(0); // ms
  const [gpsError, setGpsError] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTracks, setHistoryTracks] = useState<Track[]>([]);
  const [viewedTrack, setViewedTrack] = useState<Track | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [downloadZooms, setDownloadZooms] = useState<number[]>([12, 13, 14, 15, 16]);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [cacheStats, setCacheStats] = useState<{ count: number; sizeBytes: number }>({ count: 0, sizeBytes: 0 });

  const watchId = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef<number>(0);
  const pauseOffset = useRef<number>(0);
  const lastPoint = useRef<TrackPoint | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logFileRef = useRef<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // App init: fetch initial location and center map
  useEffect(() => {
    (async () => {
      try {
        const permStatus = await Geolocation.checkPermissions();
        if (permStatus.location === 'prompt' || permStatus.location === 'prompt-with-rationale') {
          const req = await Geolocation.requestPermissions();
          if (req.location !== 'granted') return;
        } else if (permStatus.location === 'denied') {
          return;
        }
        const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        const pos: [number, number] = [p.coords.latitude, p.coords.longitude];
        setCurrentPos(pos);
        if (mapRef.current) {
          const dp = tileSource.crs === 'gcj02' ? wgs84ToGcj02(pos[0], pos[1]) : pos;
          mapRef.current.setView(dp, 17);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Fly to current position during recording
  useEffect(() => {
    if (mode === 'recording' && currentPos && mapRef.current) {
      const dp = tileSource.crs === 'gcj02' ? wgs84ToGcj02(currentPos[0], currentPos[1]) : currentPos;
      mapRef.current.setView(dp, 17);
    }
  }, [currentPos, mode, tileSource.crs]);

  // Write a log line to file
  const writeLog = async (line: string) => {
    try {
      const ts = new Date().toLocaleString('zh-CN');
      const entry = `[${ts}] ${line}\n`;
      if (!logFileRef.current) {
        const name = `gps_log_${Date.now()}.txt`;
        await Filesystem.writeFile({ path: name, data: entry, directory: Directory.Documents, encoding: Encoding.UTF8 });
        logFileRef.current = name;
      } else {
        await Filesystem.appendFile({ path: logFileRef.current, data: entry, directory: Directory.Documents, encoding: Encoding.UTF8 });
      }
    } catch {}
  };

  // Load history on mount
  useEffect(() => { setHistoryTracks(loadTracks()); }, []);

  // GPS watch (Capacitor Geolocation plugin)
  const startGps = useCallback(async () => {
    setGpsError('');
    try {
      // Request permission first (Capacitor native)
      const permStatus = await Geolocation.checkPermissions();
      if (permStatus.location === 'prompt' || permStatus.location === 'prompt-with-rationale') {
        const req = await Geolocation.requestPermissions();
        if (req.location === 'denied') {
          setGpsError('定位权限被拒绝');
          return;
        }
      } else if (permStatus.location === 'denied') {
        setGpsError('定位权限被拒绝，请在设置中开启');
        return;
      }

      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10000 },
        (pos, err) => {
          if (err) {
            setGpsError(`GPS 错误: ${err.message}`);
            return;
          }
          if (!pos) return;
          const { latitude: lat, longitude: lng, altitude } = pos.coords;
          setCurrentPos([lat, lng]);
          if (modeRef.current !== 'recording') return;
          const pt: TrackPoint = {
            lat, lng,
            alt: altitude ?? undefined,
            time: pos.timestamp,
          };
          // Sample: 5s interval OR moved > 5m
          if (!lastPoint.current) {
            lastPoint.current = pt;
            setTrackPoints(prev => [...prev, pt]);
            writeLog(`${pt.lat},${pt.lng},${pt.alt ?? ''},0`);
            return;
          }
          const dt = (pt.time! - lastPoint.current.time!) / 1000;
          const d = calcDistance([lastPoint.current, pt]) * 1000;
          if (dt >= 5 || d >= 5) {
            const spd = calcSpeed(lastPoint.current, pt);
            const newPt: TrackPoint = { ...pt, speed: spd };
            lastPoint.current = newPt;
            setTrackPoints(prev => [...prev, newPt]);
            writeLog(`${pt.lat},${pt.lng},${pt.alt ?? ''},${spd.toFixed(2)}`);
          }
        }
      );
      watchId.current = id;
    } catch (e: any) {
      setGpsError(`GPS 初始化失败: ${e?.message ?? e}`);
    }
  }, [mode]);

  const stopGps = useCallback(() => {
    if (watchId.current !== null) {
      Geolocation.clearWatch({ id: watchId.current });
      watchId.current = null;
    }
  }, []);

  // Timer
  useEffect(() => {
    if (mode === 'recording') {
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTime.current + pauseOffset.current);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode]);

  // Reset log file on new recording
  const resetLog = async () => {
    try {
      const name = `gps_log_${Date.now()}.txt`;
      const header = `timestamp,lat,lng,alt,speed,accuracy,mode\n`;
      await Filesystem.writeFile({ path: name, data: header, directory: Directory.Documents, encoding: Encoding.UTF8 });
      logFileRef.current = name;
    } catch {}
  };

  // Start recording
  const handleStart = async () => {
    setTrackPoints([]);
    setElapsed(0);
    pauseOffset.current = 0;
    startTime.current = Date.now();
    lastPoint.current = null;
    await resetLog();
    writeLog(`MODE=START lat= lng= alt= speed=0`);
    setMode('recording');
    startGps();
  };

  // Pause
  const handlePause = () => {
    writeLog(`MODE=PAUSE lat= lng= alt= speed=0`);
    setMode('paused');
    pauseOffset.current = elapsed;
    startTime.current = Date.now();
    stopGps();
  };

  // Resume
  const handleResume = () => {
    writeLog(`MODE=RESUME lat= lng= alt= speed=0`);
    pauseOffset.current = elapsed;
    startTime.current = Date.now();
    setMode('recording');
    startGps();
  };

  // Stop & save
  const handleStop = () => {
    stopGps();
    writeLog(`MODE=STOP lat= lng= alt= speed=0`);
    setMode('idle');
    const pts = trackPointsRef.current;
    if (pts.length < 2) { setTrackPoints([]); return; }
    const distance = calcDistance(pts);
    const elevGain = calcElevationGain(pts);
    const alts = pts.map(p => p.alt).filter((a): a is number => a != null);
    const track: Track = {
      id: genId(),
      name: `轨迹 ${new Date().toLocaleString('zh-CN')}`,
      date: new Date().toISOString(),
      points: pts,
      distance,
      duration: elapsed,
      avgSpeed: elapsed > 0 ? distance / (elapsed / 3600000) : 0,
      maxSpeed: Math.max(...pts.map(p => p.speed ?? 0), 0),
      elevationGain: elevGain,
      maxAlt: alts.length ? Math.max(...alts) : undefined,
      minAlt: alts.length ? Math.min(...alts) : undefined,
    };
    const updated = [track, ...tracks].slice(0, 10);
    saveTracks(updated);
    setTracks(updated);
    setHistoryTracks(updated);
    setViewedTrack(track);
    setTrackPoints([]);
    setElapsed(0);
  };

  // GPX import
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileText(file);
      const pts = parseGPX(text);
      if (pts.length < 2) { alert('GPX 文件中没有足够的轨迹点'); return; }
      const distance = calcDistance(pts);
      const elevGain = calcElevationGain(pts);
      const alts = pts.map(p => p.alt).filter((a): a is number => a != null);
      const track: Track = {
        id: genId(),
        name: file.name.replace(/\.gpx$/i, ''),
        date: new Date().toISOString(),
        points: pts,
        distance,
        duration: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        elevationGain: elevGain,
        maxAlt: alts.length ? Math.max(...alts) : undefined,
        minAlt: alts.length ? Math.min(...alts) : undefined,
      };
      setViewedTrack(track);
      const updated = [track, ...tracks].slice(0, 10);
      saveTracks(updated);
      setTracks(updated);
      setHistoryTracks(updated);
    } catch {
      alert('GPX 解析失败');
    }
    e.target.value = '';
  };

  // GPX export
  const handleExport = () => {
    if (viewedTrack) {
      downloadFile(toGPX(viewedTrack), `${viewedTrack.name}.gpx`);
    } else if (trackPoints.length > 1) {
      const pts = trackPoints;
      const distance = calcDistance(pts);
      const track: Track = {
        id: genId(),
        name: `轨迹 ${new Date().toLocaleString('zh-CN')}`,
        date: new Date().toISOString(),
        points: pts,
        distance,
        duration: elapsed,
        avgSpeed: elapsed > 0 ? distance / (elapsed / 3600000) : 0,
        maxSpeed: 0,
        elevationGain: calcElevationGain(pts),
        maxAlt: undefined,
        minAlt: undefined,
      };
      downloadFile(toGPX(track), `${track.name}.gpx`);
    }
  };

  // Offline map download
  const handleDownload = async () => {
    if (!mapRef.current) return;
    const bounds = mapRef.current.getBounds();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();
    setDownloadProgress({ done: 0, total: 0, failed: 0 });
    try {
      const result = await prefetchTiles(
        tileSource.url, { south, north, east, west }, downloadZooms,
        (done, total, failed) => setDownloadProgress({ done, total, failed })
      );
      setDownloadProgress({ done: result.cached, total: result.total, failed: result.failed });
      await refreshCacheStats();
    } catch {
      setDownloadProgress({ done: 0, total: 0, failed: 0 });
    }
  };

  const handleClearCache = async () => {
    if (confirm('确定清除所有离线地图缓存？')) {
      await clearTileCache();
      await refreshCacheStats();
    }
  };

  const refreshCacheStats = async () => {
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch { /* ignore */ }
  };

  // Load cache stats on mount
  useEffect(() => { refreshCacheStats(); }, []);

  // Current stats
  const distance = calcDistance(trackPoints);
  const curSpeed = trackPoints.length > 1
    ? calcSpeed(trackPoints[trackPoints.length - 2], trackPoints[trackPoints.length - 1])
    : 0;
  const curAlt = trackPoints.length > 0 ? trackPoints[trackPoints.length - 1].alt : undefined;

  // Coordinate conversion: if map uses GCJ-02, convert WGS-84 GPS coords for display
  const needConvert = tileSource.crs === 'gcj02';
  const toDisplay = (lat: number, lng: number): [number, number] =>
    needConvert ? wgs84ToGcj02(lat, lng) : [lat, lng];

  // Map center
  const mapCenter: [number, number] = currentPos
    ? toDisplay(currentPos[0], currentPos[1])
    : (trackPoints.length > 0 ? toDisplay(trackPoints[0].lat, trackPoints[0].lng) : [31.23, 121.47]);
  const mapZoom = currentPos != null || trackPoints.length > 0 ? 17 : 13;

  // Displayed track
  const displayTrack = viewedTrack ?? (trackPoints.length > 0 ? { points: trackPoints } : null);

  return (
    <div className="app">
      {/* Map */}
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        className="map"
        zoomControl={true}
        ref={(map) => { if (map) mapRef.current = map; }}
      >
        <CachedTileLayer source={tileSource} offlineMode={offlineMode} />
        {displayTrack && displayTrack.points.length > 0 && (
          <Polyline
            positions={displayTrack.points.map(p => toDisplay(p.lat, p.lng))}
            pathOptions={{ color: '#10b981', weight: 4, opacity: 0.85 }}
          />
        )}
        {currentPos && <Marker position={toDisplay(currentPos[0], currentPos[1])} icon={locIcon} />}
      </MapContainer>

      {/* Status bar */}
      <div className="status-bar">
        <span className={`mode-badge mode-${mode}`}>
          {mode === 'idle' ? '就绪' : mode === 'recording' ? '● 录制中' : '⏸ 暂停'}
        </span>
        {gpsError && <span className="gps-error">{gpsError}</span>}
        <div className="status-right">
          <span className="tile-label">
            {tileSource.name}{offlineMode ? ' · 离线' : ''}
          </span>
        </div>
      </div>

      {/* Stats panel */}
      <div className="stats-panel">
        <div className="stat">
          <span className="stat-value">{formatDistance(distance)}</span>
          <span className="stat-label">距离</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatDuration(elapsed)}</span>
          <span className="stat-label">时长</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatSpeed(curSpeed)}</span>
          <span className="stat-label">速度</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatAlt(curAlt)}</span>
          <span className="stat-label">海拔</span>
        </div>
      </div>

      {/* Track summary (after stop) */}
      {viewedTrack && mode === 'idle' && (
        <div className="track-summary">
          <div className="summary-title">{viewedTrack.name}</div>
          <div className="summary-stats">
            <span>📏 {formatDistance(viewedTrack.distance)}</span>
            <span>⏱ {formatDuration(viewedTrack.duration)}</span>
            <span>📈 {viewedTrack.elevationGain} m 爬升</span>
            <span>⛰ {formatAlt(viewedTrack.minAlt)} ~ {formatAlt(viewedTrack.maxAlt)}</span>
          </div>
          <button className="btn-ghost" onClick={() => setViewedTrack(null)}>清除</button>
        </div>
      )}

      {/* Control bar */}
      <div className="control-bar">
        <button className="btn-icon" onClick={() => setShowHistory(h => !h)} title="历史轨迹">
          📂
        </button>
        <button className="btn-icon" onClick={() => setShowDownload(true)} title="下载地图">
          ⬇
        </button>
        <button className="btn-icon" onClick={() => setShowSettings(h => !h)} title="设置">
          ⚙️
        </button>
        <button
          className="btn-icon"
          onClick={async () => {
            try {
              const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
              const pos: [number, number] = [p.coords.latitude, p.coords.longitude];
              setCurrentPos(pos);
              const dp = tileSource.crs === 'gcj02' ? wgs84ToGcj02(pos[0], pos[1]) : pos;
              mapRef.current?.setView(dp, 17);
            } catch { /* ignore */ }
          }}
          title="定位"
        >
          📍
        </button>
        {mode === 'idle' && (
          <button className="btn-primary btn-start" onClick={handleStart}>开始</button>
        )}
        {mode === 'recording' && (
          <button className="btn-warning btn-pause" onClick={handlePause}>暂停</button>
        )}
        {mode === 'paused' && (
          <>
            <button className="btn-primary btn-start" onClick={handleResume}>继续</button>
            <button className="btn-danger btn-stop" onClick={handleStop}>停止</button>
          </>
        )}
        {(mode === 'recording' || trackPoints.length > 1) && (
          <button className="btn-danger btn-stop" onClick={handleStop}>停止</button>
        )}
        <button className="btn-icon" onClick={handleExport} title="导出 GPX">📤</button>
        <button className="btn-icon" onClick={() => fileInputRef.current?.click()} title="导入 GPX">📥</button>
        <input ref={fileInputRef} type="file" accept=".gpx" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {/* History drawer */}
      {showHistory && (
        <div className="history-drawer">
          <div className="history-header">
            <span>历史轨迹</span>
            <button className="btn-ghost" onClick={() => setShowHistory(false)}>✕</button>
          </div>
          {historyTracks.length === 0 && (
            <div className="history-empty">暂无轨迹记录</div>
          )}
          {historyTracks.map(t => (
            <div key={t.id} className="history-item" onClick={() => { setViewedTrack(t); setShowHistory(false); }}>
              <div className="history-name">{t.name}</div>
              <div className="history-meta">{formatDistance(t.distance)} · {formatDuration(t.duration)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Settings drawer */}
      {showSettings && (
        <div className="settings-drawer">
          <div className="history-header">
            <span>设置</span>
            <button className="btn-ghost" onClick={() => setShowSettings(false)}>✕</button>
          </div>
          <div style={{ padding: '16px' }}>
            {/* Tile source section */}
            <div className="settings-section">
              <div className="settings-section-title">地图源</div>
              <div className="tile-source-grid">
                {TILE_SOURCES.map(ts => (
                  <button
                    key={ts.id}
                    className={`tile-source-btn ${tileSource.id === ts.id ? 'active' : ''}`}
                    onClick={() => setTileSource(ts)}
                  >
                    <span className="tile-source-name">{ts.name}</span>
                    <span className="tile-source-crs">{ts.crs === 'gcj02' ? 'GCJ-02' : 'WGS-84'}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Offline mode section */}
            <div className="settings-section">
              <div className="settings-section-title">离线模式</div>
              <div className="toggle-row">
                <div>
                  <div style={{ fontSize: '14px' }}>仅使用缓存瓦片</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                    开启后不从网络加载新瓦片
                  </div>
                </div>
                <button
                  className={`toggle-switch ${offlineMode ? 'on' : ''}`}
                  onClick={() => setOfflineMode(v => !v)}
                >
                  <div className="toggle-knob" />
                </button>
              </div>
            </div>
            {/* Cache info */}
            <div className="settings-section">
              <div className="settings-section-title">缓存信息</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {cacheStats.count} 张瓦片 · {formatCacheSize(cacheStats.sizeBytes)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offline download panel */}
      {showDownload && (
        <div className="history-drawer">
          <div className="history-header">
            <span>离线地图下载</span>
            <button className="btn-ghost" onClick={() => setShowDownload(false)}>✕</button>
          </div>
          <div style={{ padding: '12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>当前区域：地图可视范围</div>
              <div style={{ fontSize: '14px', color: '#333' }}>瓦片源：{tileSource.name}</div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>下载缩放级别：</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(z => (
                  <label key={z} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={downloadZooms.includes(z)}
                      onChange={e => {
                        if (e.target.checked) {
                          setDownloadZooms(prev => [...prev, z].sort((a, b) => a - b));
                        } else {
                          setDownloadZooms(prev => prev.filter(zz => zz !== z));
                        }
                      }}
                    />
                    z{z}
                  </label>
                ))}
              </div>
            </div>
            {downloadProgress && (
              <div style={{ marginBottom: '12px', padding: '8px', background: '#f5f5f5', borderRadius: '6px', fontSize: '13px' }}>
                {downloadProgress.total > 0 ? (
                  <>下载完成: {downloadProgress.done}/{downloadProgress.total} (失败 {downloadProgress.failed})</>
                ) : (
                  <>下载中...</>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
              <button
                className="btn-primary"
                onClick={handleDownload}
                disabled={downloadZooms.length === 0}
              >
                {downloadZooms.length === 0 ? '请选择缩放级别' : `下载当前区域 (z${downloadZooms[0]}-z${downloadZooms[downloadZooms.length-1]})`}
              </button>
              <button className="btn-ghost" onClick={() => refreshCacheStats()}>
                缓存: {cacheStats.count} 张瓦片 ({formatCacheSize(cacheStats.sizeBytes)})
              </button>
              <button className="btn-danger" onClick={handleClearCache}>
                清除缓存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
