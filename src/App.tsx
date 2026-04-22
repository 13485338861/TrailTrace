import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Track, TrackPoint, RecordingMode } from './types';
import { parseGPX, toGPX, downloadFile, readFileText } from './gpx';
import {
  calcDistance, calcSpeed, calcElevationGain,
  genId, formatDuration, formatDistance, formatSpeed, formatAlt,
  loadTracks, saveTracks,
} from './utils';

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

// ── Auto-follow current location ──────────────────────────────────────────
function LocationWatcher({ latlng, enabled }: { latlng: [number, number] | null; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (enabled && latlng) {
      map.flyTo(latlng, 17, { animate: true, duration: 1 });
    }
  }, [latlng, enabled, map]);
  return null;
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState<RecordingMode>('idle');
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  const [elapsed, setElapsed] = useState(0); // ms
  const [gpsError, setGpsError] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTracks, setHistoryTracks] = useState<Track[]>([]);
  const [viewedTrack, setViewedTrack] = useState<Track | null>(null);

  const watchId = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef<number>(0);
  const pauseOffset = useRef<number>(0);
  const lastPoint = useRef<TrackPoint | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => { setHistoryTracks(loadTracks()); }, []);

  // GPS watch
  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('浏览器不支持 GPS');
      return;
    }
    setGpsError('');
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, altitude } = pos.coords;
        setCurrentPos([lat, lng]);
        if (mode !== 'recording') return;
        const pt: TrackPoint = {
          lat, lng,
          alt: altitude ?? undefined,
          time: pos.timestamp,
        };
        // Sample: 5s interval OR moved > 5m
        if (!lastPoint.current) {
          lastPoint.current = pt;
          setTrackPoints(prev => [...prev, pt]);
          return;
        }
        const dt = (pt.time! - lastPoint.current.time!) / 1000;
        const d = calcDistance([lastPoint.current, pt]) * 1000;
        if (dt >= 5 || d >= 5) {
          const spd = calcSpeed(lastPoint.current, pt);
          const newPt: TrackPoint = { ...pt, speed: spd };
          lastPoint.current = newPt;
          setTrackPoints(prev => [...prev, newPt]);
        }
      },
      (err) => setGpsError(`GPS 错误: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }, [mode]);

  const stopGps = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
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

  // Start recording
  const handleStart = () => {
    setTrackPoints([]);
    setElapsed(0);
    pauseOffset.current = 0;
    startTime.current = Date.now();
    lastPoint.current = null;
    setMode('recording');
    startGps();
  };

  // Pause
  const handlePause = () => {
    setMode('paused');
    pauseOffset.current = elapsed;
    startTime.current = Date.now();
    stopGps();
  };

  // Resume
  const handleResume = () => {
    pauseOffset.current = elapsed;
    startTime.current = Date.now();
    setMode('recording');
    startGps();
  };

  // Stop & save
  const handleStop = () => {
    stopGps();
    setMode('idle');
    const pts = trackPoints;
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
      maxAlt: alts.length ? Math.max(...alts) : 0,
      minAlt: alts.length ? Math.min(...alts) : 0,
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
        maxAlt: alts.length ? Math.max(...alts) : 0,
        minAlt: alts.length ? Math.min(...alts) : 0,
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
        maxAlt: 0,
        minAlt: 0,
      };
      downloadFile(toGPX(track), `${track.name}.gpx`);
    }
  };

  // Current stats
  const distance = calcDistance(trackPoints);
  const curSpeed = trackPoints.length > 1
    ? calcSpeed(trackPoints[trackPoints.length - 2], trackPoints[trackPoints.length - 1])
    : 0;
  const curAlt = trackPoints.length > 0 ? trackPoints[trackPoints.length - 1].alt : undefined;

  // Map center
  const mapCenter: [number, number] = currentPos
    ?? (trackPoints.length > 0 ? [trackPoints[0].lat, trackPoints[0].lng] : [31.23, 121.47]);
  const mapZoom = currentPos || trackPoints.length > 0 ? 17 : 13;

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
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {displayTrack && displayTrack.points.length > 0 && (
          <Polyline
            positions={displayTrack.points.map(p => [p.lat, p.lng])}
            pathOptions={{ color: '#10b981', weight: 4, opacity: 0.85 }}
          />
        )}
        {currentPos && <Marker position={currentPos} icon={locIcon} />}
        <LocationWatcher latlng={currentPos} enabled={mode === 'recording'} />
      </MapContainer>

      {/* Status bar */}
      <div className="status-bar">
        <span className={`mode-badge mode-${mode}`}>
          {mode === 'idle' ? '就绪' : mode === 'recording' ? '● 录制中' : '⏸ 暂停'}
        </span>
        {gpsError && <span className="gps-error">{gpsError}</span>}
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
        <button
          className="btn-icon"
          onClick={() => {
            navigator.geolocation?.getCurrentPosition(
              p => setCurrentPos([p.coords.latitude, p.coords.longitude]),
              () => {}
            );
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
    </div>
  );
}
