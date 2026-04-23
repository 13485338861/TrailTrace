import { parseGPX, toGPX } from '../src/gpx';

describe('parseGPX', () => {
  it('解析trkpt轨迹点', () => {
    const gpx = `<?xml version="1.0"?>
<gpx>
  <trk><trkseg>
    <trkpt lat="39.9" lon="116.4"><ele>100</ele><time>2025-01-06T00:00:00Z</time></trkpt>
    <trkpt lat="39.95" lon="116.5"><ele>200</ele></trkpt>
  </trkseg></trk>
</gpx>`;
    const pts = parseGPX(gpx);
    expect(pts).toHaveLength(2);
    expect(pts[0].lat).toBe(39.9);
    expect(pts[0].lng).toBe(116.4);
    expect(pts[0].alt).toBe(100);
    expect(pts[1].alt).toBe(200);
  });

  it('解析wpt航点', () => {
    const gpx = `<?xml version="1.0"?>
<gpx>
  <wpt lat="40.0" lon="117.0"><ele>300</ele></wpt>
</gpx>`;
    const pts = parseGPX(gpx);
    expect(pts).toHaveLength(1);
    expect(pts[0].lat).toBe(40);
    expect(pts[0].alt).toBe(300);
  });

  it('无效XML返回空数组', () => {
    expect(parseGPX('not xml at all')).toHaveLength(0);
  });
});

describe('toGPX', () => {
  it('生成有效GPX XML', () => {
    const track = {
      id: 'test1',
      name: '测试轨迹',
      date: new Date().toISOString(),
      distance: 0,
      duration: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      elevationGain: 0,
      maxAlt: 100,
      minAlt: 100,
      points: [
        { lat: 39.9, lng: 116.4, alt: 100, time: 1736150400000 },
      ],
    };
    const xml = toGPX(track);
    expect(xml).toContain('<trkpt lat="39.9" lon="116.4">');
    expect(xml).toContain('<ele>100</ele>');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('转义XML特殊字符', () => {
    const track = {
      id: 'test2',
      name: 'A & B < C > D "test"',
      date: new Date().toISOString(),
      distance: 0,
      duration: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      elevationGain: 0,
      maxAlt: 0,
      minAlt: 0,
      points: [{ lat: 1, lng: 2 }],
    };
    const xml = toGPX(track);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&quot;');
  });
});