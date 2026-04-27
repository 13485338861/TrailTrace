import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { saveTile, getTile } from './tileCache';

export interface TileSource {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  crs: 'wgs84' | 'gcj02'; // 地图坐标系
}

/** 预设瓦片源（国内优先） */
export const TILE_SOURCES: TileSource[] = [
  {
    id: 'amap',
    name: '高德街道',
    url: 'https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=7',
    attribution: '&copy; 高德地图',
    maxZoom: 18,
    crs: 'gcj02',
  },
  {
    id: 'amap-sat',
    name: '高德卫星',
    url: 'https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=6',
    attribution: '&copy; 高德地图',
    maxZoom: 18,
    crs: 'gcj02',
  },
  {
    id: 'geoq',
    name: 'GeoQ彩色',
    url: 'https://map.geoq.cn/ArcGIS/rest/services/ChinaOnlineCommunity/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; GeoQ',
    maxZoom: 16,
    crs: 'gcj02',
  },
  {
    id: 'osm',
    name: 'OSM街道',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    maxZoom: 19,
    crs: 'wgs84',
  },
  {
    id: 'topo',
    name: '等高线',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> CC-BY-SA',
    maxZoom: 17,
    crs: 'wgs84',
  },
];

/** 支持离线缓存的瓦片图层 */
class OfflineTileLayer extends L.TileLayer {
  private _offlineMode: boolean = false;
  private _cacheHits: number = 0;
  private _cacheMisses: number = 0;

  set offlineMode(v: boolean) {
    this._offlineMode = v;
  }

  get offlineMode(): boolean {
    return this._offlineMode;
  }

  get cacheStats() {
    return { hits: this._cacheHits, misses: this._cacheMisses };
  }

  resetCacheStats() {
    this._cacheHits = 0;
    this._cacheMisses = 0;
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLImageElement {
    const tile = document.createElement('img');
    const url = this.getTileUrl(coords);

    // Try cache first
    getTile(url).then((blob) => {
      if (blob) {
        this._cacheHits++;
        const objectUrl = URL.createObjectURL(blob);
        tile.src = objectUrl;
        tile.onload = () => {
          URL.revokeObjectURL(objectUrl);
          done(undefined, tile);
        };
        tile.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          // Cache blob corrupted, try fetching
          this._fetchAndCache(url, tile, done);
        };
      } else {
        if (this._offlineMode) {
          // Offline and no cache - show empty tile
          this._cacheMisses++;
          done(undefined, tile);
        } else {
          this._cacheMisses++;
          this._fetchAndCache(url, tile, done);
        }
      }
    });

    return tile;
  }

  private _fetchAndCache(url: string, tile: HTMLImageElement, done: L.DoneCallback) {
    // Use a proxied URL that avoids CORS issues for caching
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      tile.src = img.src;
      done(undefined, tile);
      // Try to cache via fetch
      fetch(url, { mode: 'cors' })
        .then(r => r.blob())
        .then(blob => saveTile(url, blob))
        .catch(() => { /* cache fail is non-critical */ });
    };
    img.onerror = () => {
      done(new Error('Tile load failed'), tile);
    };
    img.src = url;
  }
}

/** React-Leaflet 组件：带离线缓存的瓦片图层 */
export default function CachedTileLayer({
  source,
  offlineMode,
  onCacheStatsChange,
}: {
  source: TileSource;
  offlineMode: boolean;
  onCacheStatsChange?: (stats: { hits: number; misses: number }) => void;
}) {
  const map = useMap();
  const layerRef = useRef<OfflineTileLayer | null>(null);
  const [, forceUpdate] = useState(0);

  // Create or update layer when source changes
  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    const layer = new OfflineTileLayer(source.url, {
      attribution: source.attribution,
      maxZoom: source.maxZoom,
      subdomains: source.id.startsWith('amap') ? '1234' : 'abc',
    });
    layer.offlineMode = offlineMode;
    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, map]);

  // Update offline mode
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.offlineMode = offlineMode;
    }
  }, [offlineMode]);

  // Report cache stats periodically
  useEffect(() => {
    if (!onCacheStatsChange) return;
    const interval = setInterval(() => {
      if (layerRef.current) {
        onCacheStatsChange(layerRef.current.cacheStats);
        forceUpdate(n => n + 1);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [onCacheStatsChange]);

  return null;
}
