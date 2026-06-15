import React, { useState } from 'react';

const STATUS_COLORS = {
  connected: '#3cff9a',
  connecting: '#ffcc3c',
  disconnected: '#ff5370',
};

const STATUS_TEXT = {
  connected: '已连接',
  connecting: '连接中…',
  disconnected: '未连接',
};

export default function HUD({ status, hudData, onClear, onReconnect, wsUrl, onWsUrl }) {
  const [editMode, setEditMode] = useState(false);
  const [tmpUrl, setTmpUrl] = useState(wsUrl);

  const applyUrl = () => {
    onWsUrl(tmpUrl);
    setEditMode(false);
  };

  return (
    <div className="hud-overlay">
      <div className="hud-titlebar">
        <div className="hud-title">
          <span className="hud-dot" style={{ background: STATUS_COLORS[status] }} />
          <span>ROV 声呐数字孪生系统</span>
          <span className="hud-sub">| 喀斯特暗河全景超声成像</span>
        </div>
        <div className="hud-status-pill" style={{ borderColor: STATUS_COLORS[status], color: STATUS_COLORS[status] }}>
          WS · {STATUS_TEXT[status]}
        </div>
      </div>

      <div className="hud-left">
        <div className="hud-card">
          <div className="hud-card-title">ROV 姿态</div>
          <div className="hud-row"><span>X (东向)</span><b>{hudData.rovX} m</b></div>
          <div className="hud-row"><span>Y (高程)</span><b>{hudData.rovY} m</b></div>
          <div className="hud-row"><span>Z (北向)</span><b>{hudData.rovZ} m</b></div>
          <div className="hud-row"><span>运行时</span><b>{hudData.t} s</b></div>
        </div>

        <div className="hud-card">
          <div className="hud-card-title">声呐统计</div>
          <div className="hud-row"><span>缓冲 Ping</span><b>{hudData.pings}</b></div>
          <div className="hud-row"><span>总波束点</span><b>{hudData.beams.toLocaleString()}</b></div>
          <div className="hud-row"><span>显示模式</span><b>Viridis 色谱</b></div>
          <div className="hud-row"><span>渲染模式</span><b>WebGL Instanced</b></div>
        </div>
      </div>

      <div className="hud-right">
        <div className="hud-card">
          <div className="hud-card-title">网关配置</div>
          {!editMode ? (
            <div className="hud-row hud-url" onClick={() => setEditMode(true)}>
              <span>WebSocket</span>
              <b className="hud-url-val">{wsUrl}</b>
            </div>
          ) : (
            <div className="hud-url-edit">
              <input value={tmpUrl} onChange={(e) => setTmpUrl(e.target.value)} />
              <div>
                <button onClick={applyUrl}>应用</button>
                <button className="btn-ghost" onClick={() => setEditMode(false)}>取消</button>
              </div>
            </div>
          )}
          <div className="hud-actions">
            <button onClick={onReconnect}>重新连接</button>
            <button className="btn-danger" onClick={onClear}>清空声呐</button>
          </div>
        </div>

        <div className="hud-card legend-card">
          <div className="hud-card-title">能量色谱图例</div>
          <div className="hud-legend">
            <div className="hud-legend-bar" />
            <div className="hud-legend-labels">
              <span>低强度 · 远距</span>
              <span>高强度 · 近距</span>
            </div>
          </div>
          <div className="hud-tip">拖拽画布旋转视角 · 滚轮缩放</div>
        </div>
      </div>

      <div className="hud-bottom-scan">
        <div className="scan-line" />
        <div className="scan-label">
          MULTIBEAM SONAR · 256 BEAMS · SWATH 120° · SSP CUBIC SPLINE · QUATERNION ATTITUDE FUSION
        </div>
      </div>
    </div>
  );
}
