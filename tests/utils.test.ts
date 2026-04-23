import { haversineKm, calcDistance, calcSpeed, calcElevationGain, genId, formatDuration, formatDistance, formatSpeed, formatAlt } from '../src/utils';

describe('haversineKm', () => {
  it('计算北京-天津距离约100km', () => {
    const d = haversineKm(39.9042, 116.4074, 39.3434, 117.3616);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(110);
  });

  it('同一点距离为0', () => {
    expect(haversineKm(39.9, 116.4, 39.9, 116.4)).toBe(0);
  });
});

describe('calcDistance', () => {
  it('空数组返回0', () => {
    expect(calcDistance([])).toBe(0);
  });

  it('单点返回0', () => {
    expect(calcDistance([{ lat: 39.9, lng: 116.4, time: 0 }])).toBe(0);
  });

  it('两北京点距离约100km', () => {
    const pts = [
      { lat: 39.9042, lng: 116.4074, time: 0 },
      { lat: 39.3434, lng: 117.3616, time: 0 },
    ];
    const d = calcDistance(pts);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(110);
  });
});

describe('calcSpeed', () => {
  it('缺少时间返回0', () => {
    const p1 = { lat: 39.9, lng: 116.4 };
    const p2 = { lat: 39.9, lng: 116.4 };
    expect(calcSpeed(p1 as any, p2 as any)).toBe(0);
  });

  it('正常速度计算', () => {
    const p1 = { lat: 39.9042, lng: 116.4074, time: 1000000000000 };
    const p2 = { lat: 39.3434, lng: 117.3616, time: 1000003600000 }; // 3600s = 1小时
    const s = calcSpeed(p1, p2);
    expect(s).toBeGreaterThan(100);
    expect(s).toBeLessThan(110);
  });
});

describe('calcElevationGain', () => {
  it('空数组返回0', () => {
    expect(calcElevationGain([])).toBe(0);
  });

  it('上升+下降只计上升', () => {
    const pts = [
      { lat: 39.9, lng: 116.4, alt: 100, time: 0 },
      { lat: 39.9, lng: 116.5, alt: 200, time: 0 },
      { lat: 39.9, lng: 116.6, alt: 300, time: 0 },
    ];
    expect(calcElevationGain(pts)).toBe(200);
  });

  it('上升后下降保持同样增益', () => {
    const pts = [
      { lat: 39.9, lng: 116.4, alt: 100, time: 0 },
      { lat: 39.9, lng: 116.5, alt: 300, time: 0 },
      { lat: 39.9, lng: 116.6, alt: 150, time: 0 },
    ];
    expect(calcElevationGain(pts)).toBe(200);
  });
});

describe('genId', () => {
  it('两次生成ID不同', () => {
    const id1 = genId();
    const id2 = genId();
    expect(id1).not.toBe(id2);
  });

  it('ID是字符串且有长度', () => {
    const id = genId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('formatDuration', () => {
  it('零时长', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });
  it('5秒', () => {
    expect(formatDuration(5000)).toBe('00:00:05');
  });
  it('1分1秒', () => {
    expect(formatDuration(61000)).toBe('00:01:01');
  });
  it('1小时1分1秒', () => {
    expect(formatDuration(3661000)).toBe('01:01:01');
  });
});

describe('formatDistance', () => {
  it('小于1km显示米', () => {
    expect(formatDistance(0.5)).toMatch(/\d+ m/);
  });

  it('大于1km显示公里', () => {
    expect(formatDistance(1.5)).toBe('1.50 km');
    expect(formatDistance(10)).toBe('10.00 km');
  });
});

describe('formatSpeed', () => {
  it('速度格式化', () => {
    expect(formatSpeed(12.34)).toBe('12.3 km/h');
  });
});

describe('formatAlt', () => {
  it('null/undefined显示横杠', () => {
    expect(formatAlt(undefined)).toBe('—');
    expect(formatAlt(null as any)).toBe('—');
  });

  it('海拔四舍五入', () => {
    expect(formatAlt(1234.6)).toBe('1235 m');
  });
});