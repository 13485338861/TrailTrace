export interface LatLng {
  lat: number;
  lng: number;
  alt?: number; // 海拔(m)
  time?: number; // Unix timestamp ms
}

export interface TrackPoint extends LatLng {
  speed?: number; // km/h
}

export interface Track {
  id: string;
  name: string;
  date: string; // ISO string
  points: TrackPoint[];
  distance: number; // km
  duration: number; // ms
  avgSpeed: number; // km/h
  maxSpeed: number; // km/h
  elevationGain: number; // m
  maxAlt: number; // m
  minAlt: number; // m
}

export type RecordingMode = 'idle' | 'recording' | 'paused';
