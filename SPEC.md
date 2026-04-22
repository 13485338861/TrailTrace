# TrailTrace - 轻迹

## 1. Concept & Vision

一款极简的户外轨迹记录工具，专注于 GPS 轨迹绘制与基础统计。灵感来自两步路，但界面极度克制——只有地图、按钮和数据，没有广告、没有社区、没有杂乱的按钮。目标是做"刚好够用"的轨迹记录。

## 2. Design Language

- **Aesthetic**: 极简工具感，冷静克制，大片留白
- **Colors**:
  - Background: `#0f172a` (深蓝黑)
  - Surface: `#1e293b` (卡片)
  - Primary: `#10b981` (翠绿，活力)
  - Accent: `#f59e0b` (琥珀，警示/暂停)
  - Danger: `#ef4444` (红色，停止)
  - Text: `#f1f5f9` (主文字)
  - Muted: `#64748b` (次文字)
- **Typography**: "Outfit" (Google Fonts) — 现代几何感
- **Motion**: 过渡 200ms ease-out，数据数字使用 CSS counter 动画
- **Icons**: Lucide React

## 3. Layout

```
┌──────────────────────────────┐
│  状态栏 (时间 / 模式标签)      │
├──────────────────────────────┤
│                              │
│         地图 (全屏)            │
│         轨迹线覆盖             │
│                              │
├──────────────────────────────┤
│  数据面板 (4格: 距离/时间/速度/海拔) │
├──────────────────────────────┤
│   [定位]  [开始/暂停]  [停止]   │
│   [导入GPX] [导出GPX]          │
└──────────────────────────────┘
```

- 地图占满屏幕
- 底部控制区固定高度，半透明背景
- 数据面板在控制区上方，紧凑排列

## 4. Features & Interactions

### GPS 追踪
- 点击"开始"→ 获取 GPS 权限 → 实时画线
- 点击"暂停"→ 停止记录，地图保留
- 点击"停止"→ 结束记录，弹出轨迹摘要
- 轨迹点自动采样（每 5 秒或移动 >5m）

### 地图
- 默认 OpenStreetMap 瓦片
- 当前位置标点（移动时更新）
- 轨迹线（实线，绿色）
- 支持手势缩放/拖拽

### 数据面板
- **距离**: 累计公里数（km）
- **时长**: HH:MM:SS 格式
- **速度**: 当前速度（km/h）
- **海拔**: 当前海拔（m），GPS 获取

### GPX 导入/导出
- 导入：选择本地 .gpx 文件，解析并显示在地图上
- 导出：将当前轨迹下载为 .gpx 文件

### 轨迹历史
- 本地存储（localStorage）
- 显示最近 10 条轨迹（名称、日期、距离）
- 点击加载到地图

## 5. Component Inventory

- **MapView**: Leaflet 地图，含轨迹 Polyline 和当前位置 Marker
- **ControlBar**: 录制控制按钮组
- **StatsPanel**: 四格数据展示
- **TrackHistory**: 历史轨迹列表抽屉
- **GPXImporter**: 隐藏的 file input

## 6. Technical Approach

- **Framework**: React 18 + TypeScript + Vite
- **Map**: react-leaflet + leaflet
- **GPX**: 手动解析 XML（无依赖）
- **State**: React useState/useReducer（无 Redux）
- **Storage**: localStorage
- **Styling**: 纯 CSS（index.css）
