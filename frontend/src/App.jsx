import React, { useEffect, useRef, useState } from 'react';
import { SceneEngine } from './scene/SceneEngine.js';
import { SonarDataBuffer, SonarWSClient } from './utils/data_buffer.js';
import HUD from './components/HUD.jsx';
import './styles/app.css';

const WS_URL = (typeof window !== 'undefined' && (window.location.protocol === 'https:'
  ? 'wss://' + window.location.hostname + ':8765'
  : 'ws://' + (window.location.hostname || 'localhost') + ':8765'));

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const bufferRef = useRef(null);
  const clientRef = useRef(null);
  const [status, setStatus] = useState('disconnected');
  const [hudData, setHudData] = useState({
    rovX: 0, rovY: 0, rovZ: 0, pings: 0, beams: 0, t: 0
  });
  const [wsUrl, setWsUrl] = useState(WS_URL);

  useEffect(() => {
    const buffer = new SonarDataBuffer(1200);
    bufferRef.current = buffer;
    const client = new SonarWSClient(wsUrl, buffer);
    clientRef.current = client;
    const unsub = client.onStatus((s) => setStatus(s));
    client.connect();

    const engine = new SceneEngine(canvasRef.current, buffer);
    engineRef.current = engine;
    engine.start();

    const hudInterval = setInterval(() => {
      const s = engine.getStatus();
      setHudData({
        rovX: s.rovPos[0].toFixed(2),
        rovY: s.rovPos[1].toFixed(2),
        rovZ: s.rovPos[2].toFixed(2),
        pings: buffer.pings.length,
        beams: buffer.pings.length > 0 ? buffer.pings.length * (buffer.pings[0]?.beams?.count || 0) : 0,
        t: s.t.toFixed(1),
      });
    }, 100);

    return () => {
      clearInterval(hudInterval);
      unsub && unsub();
      client.close();
      engine.dispose();
    };
  }, [wsUrl]);

  const handleClear = () => engineRef.current?.clearSonar();
  const handleReconnect = () => {
    const c = clientRef.current;
    if (c) { c.close(); setTimeout(() => c.connect(), 100); }
  };

  return (
    <div className="app-root">
      <canvas ref={canvasRef} className="main-canvas" />
      <HUD
        status={status}
        hudData={hudData}
        onClear={handleClear}
        onReconnect={handleReconnect}
        wsUrl={wsUrl}
        onWsUrlChange={setWsUrl}
      />
    </div>
  );
}
