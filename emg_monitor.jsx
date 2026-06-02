import { useState, useEffect, useRef, useCallback } from "react";

// ── Palette & constants ──────────────────────────────────────────────────────
const CHANNEL_COLORS = [
  "#00e5ff", "#69ff47", "#ff6d3b", "#e040fb",
  "#ffea00", "#00bfa5", "#ff4081", "#40c4ff",
];

const MUSCLES = [
  "Biceps Brachii", "Triceps Brachii", "Deltoid", "Flexor Carpi Radialis",
  "Extensor Carpi Ulnaris", "Gastrocnemius", "Tibialis Anterior",
  "Vastus Lateralis", "Head and Neck", "Orbicularis Oculi",
  "First Dorsal Interosseous", "Abductor Pollicis Brevis",
];

const FILTER_PRESETS = {
  EMG:       { lff: 20,  hff: 10000 },
  NCS:       { lff: 2,   hff: 3000  },
  EP:        { lff: 1,   hff: 3000  },
  SFEMG:     { lff: 500, hff: 10000 },
  AUTONOMIC: { lff: 0.1, hff: 100   },
};

const SWEEPS = [50, 100, 200, 500, 1000];   // ms/div
const SENSITIVITIES = [20, 50, 100, 200, 500, 1000]; // µV/div

function generateEMG(t, active, noise = 0.08) {
  if (!active) return (Math.random() - 0.5) * noise * 0.1;
  const burst = Math.sin(t * 0.18) * 0.5 + 0.5;
  const spikes =
    Math.sin(t * 47) * 0.6 +
    Math.sin(t * 73) * 0.3 +
    Math.sin(t * 113) * 0.1;
  return spikes * burst * 0.85 + (Math.random() - 0.5) * noise;
}

// ── Single waveform canvas ───────────────────────────────────────────────────
function WaveformCanvas({ data, color, sensitivity, gridLines = 8 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridLines; i++) {
      const x = (i / gridLines) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // baseline
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

    // signal
    if (!data || data.length < 2) return;
    const scale = (H / 2) / (sensitivity / 100);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H / 2 - v * scale;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [data, color, sensitivity, gridLines]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={120}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

// ── Channel row ──────────────────────────────────────────────────────────────
function ChannelRow({ ch, index, onUpdate, onRemove, signalData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid rgba(${hexToRgb(ch.color)},0.25)`,
      borderRadius: 10,
      marginBottom: 8,
      overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      {/* Header bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        background: `rgba(${hexToRgb(ch.color)},0.08)`,
        cursor: "pointer",
      }} onClick={() => setExpanded(e => !e)}>
        {/* color dot + active toggle */}
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: ch.active ? ch.color : "#444",
          boxShadow: ch.active ? `0 0 8px ${ch.color}` : "none",
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          color: "#ccc",
          letterSpacing: 1,
          textTransform: "uppercase",
          flexShrink: 0,
          width: 20,
        }}>Ch{index + 1}</span>

        {/* muscle name */}
        <select
          value={ch.muscle}
          onChange={e => { e.stopPropagation(); onUpdate({ muscle: e.target.value }); }}
          onClick={e => e.stopPropagation()}
          style={selectStyle(ch.color)}
        >
          {MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* mini stats */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}>
          <Stat label="RMS" value={signalData ? rms(signalData).toFixed(1) : "–"} unit="µV" color={ch.color} />
          <Stat label="PEAK" value={signalData ? peak(signalData).toFixed(1) : "–"} unit="µV" color={ch.color} />

          {/* active toggle */}
          <button
            onClick={e => { e.stopPropagation(); onUpdate({ active: !ch.active }); }}
            style={{
              background: ch.active ? ch.color : "transparent",
              border: `1px solid ${ch.color}`,
              borderRadius: 4,
              color: ch.active ? "#000" : ch.color,
              fontSize: 10,
              fontFamily: "'DM Mono', monospace",
              padding: "3px 8px",
              cursor: "pointer",
              letterSpacing: 0.5,
            }}>
            {ch.active ? "LIVE" : "OFF"}
          </button>

          {/* remove */}
          <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{
            background: "transparent", border: "none",
            color: "#666", cursor: "pointer", fontSize: 16, lineHeight: 1,
          }}>×</button>

          {/* expand arrow */}
          <span style={{ color: "#555", fontSize: 12, transform: expanded ? "rotate(180deg)" : "none", transition: "0.2s" }}>▼</span>
        </div>
      </div>

      {/* Waveform */}
      <div style={{ height: 100, padding: "4px 0", background: "#050810" }}>
        <WaveformCanvas
          data={signalData}
          color={ch.color}
          sensitivity={ch.sensitivity}
        />
      </div>

      {/* Controls (expanded) */}
      {expanded && (
        <div style={{
          padding: "12px 16px",
          display: "flex", gap: 24, flexWrap: "wrap",
          background: "rgba(0,0,0,0.3)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          <Control label="SENSITIVITY">
            <select value={ch.sensitivity} onChange={e => onUpdate({ sensitivity: +e.target.value })} style={selectStyle(ch.color)}>
              {SENSITIVITIES.map(s => <option key={s} value={s}>{s} µV/div</option>)}
            </select>
          </Control>
          <Control label="LFF (Hz)">
            <input type="number" min={0.1} max={500} step={0.1}
              value={ch.lff}
              onChange={e => onUpdate({ lff: +e.target.value })}
              style={inputStyle(ch.color)} />
          </Control>
          <Control label="HFF (Hz)">
            <input type="number" min={100} max={10000} step={100}
              value={ch.hff}
              onChange={e => onUpdate({ hff: +e.target.value })}
              style={inputStyle(ch.color)} />
          </Control>
          <Control label="FILTER PRESET">
            <div style={{ display: "flex", gap: 4 }}>
              {Object.keys(FILTER_PRESETS).map(k => (
                <button key={k} onClick={() => onUpdate(FILTER_PRESETS[k])}
                  style={presetBtn(ch.color, ch.lff === FILTER_PRESETS[k].lff && ch.hff === FILTER_PRESETS[k].hff)}>
                  {k}
                </button>
              ))}
            </div>
          </Control>
          <Control label="COLOR">
            <div style={{ display: "flex", gap: 6 }}>
              {CHANNEL_COLORS.map(c => (
                <div key={c} onClick={() => onUpdate({ color: c })} style={{
                  width: 18, height: 18, borderRadius: "50%", background: c,
                  cursor: "pointer",
                  border: ch.color === c ? "2px solid #fff" : "2px solid transparent",
                  boxShadow: ch.color === c ? `0 0 6px ${c}` : "none",
                }} />
              ))}
            </div>
          </Control>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
function rms(data) { return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) * 100; }
function peak(data) { return Math.max(...data.map(Math.abs)) * 100; }

function Stat({ label, value, unit, color }) {
  return (
    <div style={{ textAlign: "center", minWidth: 52 }}>
      <div style={{ fontSize: 9, color: "#555", letterSpacing: 1, fontFamily: "'DM Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 13, color, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
        {value}<span style={{ fontSize: 9, color: "#666" }}> {unit}</span>
      </div>
    </div>
  );
}
function Control({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#555", letterSpacing: 1, fontFamily: "'DM Mono', monospace", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function selectStyle(color) {
  return {
    background: "rgba(0,0,0,0.5)",
    border: `1px solid rgba(${hexToRgb(color)},0.35)`,
    borderRadius: 5,
    color: "#ddd",
    fontSize: 12,
    fontFamily: "'DM Mono', monospace",
    padding: "4px 8px",
    outline: "none",
    cursor: "pointer",
  };
}
function inputStyle(color) {
  return {
    background: "rgba(0,0,0,0.5)",
    border: `1px solid rgba(${hexToRgb(color)},0.35)`,
    borderRadius: 5,
    color: "#ddd",
    fontSize: 12,
    fontFamily: "'DM Mono', monospace",
    padding: "4px 8px",
    width: 90,
    outline: "none",
  };
}
function presetBtn(color, active) {
  return {
    background: active ? `rgba(${hexToRgb(color)},0.25)` : "rgba(0,0,0,0.4)",
    border: `1px solid rgba(${hexToRgb(color)},${active ? 0.7 : 0.25})`,
    borderRadius: 4,
    color: active ? color : "#777",
    fontSize: 9,
    fontFamily: "'DM Mono', monospace",
    padding: "3px 7px",
    cursor: "pointer",
    letterSpacing: 0.5,
  };
}

// ── Serial port manager ──────────────────────────────────────────────────────
function useArduinoSerial(onData) {
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("DISCONNECTED");

  const connect = useCallback(async () => {
    if (!("serial" in navigator)) {
      setStatus("WEB SERIAL NOT SUPPORTED – USE CHROME/EDGE");
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setConnected(true);
      setStatus("CONNECTED");

      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();
      readerRef.current = reader;

      let buf = "";
      const read = async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split("\n");
          buf = lines.pop();
          lines.forEach(line => {
            const vals = line.trim().split(",").map(Number).filter(v => !isNaN(v));
            if (vals.length > 0) onData(vals);
          });
        }
      };
      read().catch(() => setStatus("STREAM ENDED"));
    } catch (e) {
      setStatus("CONNECTION FAILED");
    }
  }, [onData]);

  const disconnect = useCallback(async () => {
    try {
      readerRef.current?.cancel();
      await portRef.current?.close();
    } catch (_) {}
    setConnected(false);
    setStatus("DISCONNECTED");
  }, []);

  return { connected, status, connect, disconnect };
}

// ── Main App ─────────────────────────────────────────────────────────────────
const BUFFER_SIZE = 400;

export default function EMGMonitor() {
  const [channels, setChannels] = useState([
    { id: 1, muscle: "Biceps Brachii", color: CHANNEL_COLORS[0], active: true, sensitivity: 200, lff: 20, hff: 10000 },
    { id: 2, muscle: "Triceps Brachii", color: CHANNEL_COLORS[1], active: true, sensitivity: 200, lff: 20, hff: 10000 },
  ]);
  const [sweep, setSweep] = useState(200);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [useSimulator, setUseSimulator] = useState(true);

  // circular signal buffers keyed by channel id
  const buffers = useRef({});
  const tRef = useRef(0);
  const [tick, setTick] = useState(0);

  // ensure buffers exist for all channels
  useEffect(() => {
    channels.forEach(ch => {
      if (!buffers.current[ch.id]) {
        buffers.current[ch.id] = new Float32Array(BUFFER_SIZE);
      }
    });
  }, [channels]);

  // Arduino data handler
  const handleArduinoData = useCallback((vals) => {
    channels.forEach((ch, i) => {
      const v = vals[i] !== undefined ? (vals[i] - 512) / 512 : 0;
      const buf = buffers.current[ch.id];
      if (!buf) return;
      buf.copyWithin(0, 1);
      buf[BUFFER_SIZE - 1] = v;
    });
    setTick(t => t + 1);
  }, [channels]);

  const { connected, status, connect, disconnect } = useArduinoSerial(handleArduinoData);

  // Simulator
  useEffect(() => {
    if (!useSimulator || connected) return;
    const id = setInterval(() => {
      tRef.current += 1;
      channels.forEach(ch => {
        const buf = buffers.current[ch.id];
        if (!buf) return;
        buf.copyWithin(0, 1);
        buf[BUFFER_SIZE - 1] = generateEMG(tRef.current, ch.active);
      });
      setTick(t => t + 1);
    }, 16);
    return () => clearInterval(id);
  }, [useSimulator, connected, channels]);

  // recording timer
  useEffect(() => {
    if (!recording) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const addChannel = () => {
    if (channels.length >= 8) return;
    const id = Date.now();
    const color = CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length];
    setChannels(c => [...c, {
      id, muscle: MUSCLES[channels.length % MUSCLES.length],
      color, active: true, sensitivity: 200, lff: 20, hff: 10000,
    }]);
    buffers.current[id] = new Float32Array(BUFFER_SIZE);
  };

  const updateChannel = (id, patch) => setChannels(c => c.map(ch => ch.id === id ? { ...ch, ...patch } : ch));
  const removeChannel = (id) => setChannels(c => c.filter(ch => ch.id !== id));

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#030508",
      color: "#e0e0e0",
      fontFamily: "'DM Mono', monospace",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Font import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Orbitron:wght@600;800&display=swap');
        ::-webkit-scrollbar { width: 4px; background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        select, input, button { transition: all 0.15s; }
        select:hover, input:focus { border-color: rgba(255,255,255,0.4) !important; }
      `}</style>

      {/* ── Top Bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "10px 20px",
        background: "rgba(0,229,255,0.04)",
        borderBottom: "1px solid rgba(0,229,255,0.12)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 14, fontWeight: 800,
            color: "#00e5ff",
            letterSpacing: 3,
          }}>ALLENGERS</span>
          <span style={{ fontSize: 8, color: "#555", letterSpacing: 4, marginTop: 2 }}>SCORPIO · EMG MONITOR</span>
        </div>

        <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.08)" }} />

        {/* Connection status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: connected ? "#69ff47" : "#ff4444",
            boxShadow: connected ? "0 0 8px #69ff47" : "0 0 8px #ff4444",
            animation: connected ? "pulse 1.5s infinite" : "none",
          }} />
          <span style={{ fontSize: 10, color: connected ? "#69ff47" : "#ff4444", letterSpacing: 1 }}>
            {status}
          </span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {/* Simulator toggle */}
          <button onClick={() => setUseSimulator(s => !s)} style={{
            background: useSimulator ? "rgba(255,234,0,0.12)" : "transparent",
            border: `1px solid rgba(255,234,0,${useSimulator ? 0.6 : 0.2})`,
            borderRadius: 6, color: useSimulator ? "#ffea00" : "#555",
            fontSize: 10, padding: "5px 12px", cursor: "pointer", letterSpacing: 1,
          }}>
            {useSimulator ? "⚡ SIMULATOR ON" : "⚡ SIMULATOR OFF"}
          </button>

          {/* Arduino connect */}
          <button onClick={connected ? disconnect : connect} style={{
            background: connected ? "rgba(255,68,68,0.12)" : "rgba(105,255,71,0.12)",
            border: `1px solid ${connected ? "#ff4444" : "#69ff47"}`,
            borderRadius: 6,
            color: connected ? "#ff4444" : "#69ff47",
            fontSize: 10, padding: "5px 14px", cursor: "pointer", letterSpacing: 1,
          }}>
            {connected ? "⏏ DISCONNECT" : "⏎ CONNECT ARDUINO"}
          </button>

          {/* Sweep */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "#555" }}>SWEEP</span>
            <select value={sweep} onChange={e => setSweep(+e.target.value)} style={selectStyle("#00e5ff")}>
              {SWEEPS.map(s => <option key={s} value={s}>{s} ms/div</option>)}
            </select>
          </div>

          {/* Record */}
          <button onClick={() => setRecording(r => !r)} style={{
            background: recording ? "rgba(255,64,129,0.2)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${recording ? "#ff4081" : "#333"}`,
            borderRadius: 6,
            color: recording ? "#ff4081" : "#888",
            fontSize: 10, padding: "5px 14px", cursor: "pointer", letterSpacing: 1,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              display: "inline-block", width: 7, height: 7, borderRadius: "50%",
              background: recording ? "#ff4081" : "#555",
              boxShadow: recording ? "0 0 6px #ff4081" : "none",
            }} />
            {recording ? fmt(elapsed) : "REC"}
          </button>
        </div>
      </div>

      {/* ── Mode tabs ── */}
      <ModeBar channels={channels} onPreset={(lff, hff) => channels.forEach(ch => updateChannel(ch.id, { lff, hff }))} />

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Channel list ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {channels.map((ch, i) => (
            <ChannelRow
              key={ch.id}
              ch={ch}
              index={i}
              onUpdate={patch => updateChannel(ch.id, patch)}
              onRemove={() => removeChannel(ch.id)}
              signalData={Array.from(buffers.current[ch.id] || [])}
            />
          ))}

          {channels.length < 8 && (
            <button onClick={addChannel} style={{
              width: "100%", padding: "10px",
              background: "rgba(0,229,255,0.04)",
              border: "1px dashed rgba(0,229,255,0.2)",
              borderRadius: 10, color: "#00e5ff66",
              fontSize: 11, cursor: "pointer", letterSpacing: 2,
            }}>
              + ADD CHANNEL
            </button>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div style={{
          width: 200, borderLeft: "1px solid rgba(255,255,255,0.06)",
          padding: "16px 12px", overflowY: "auto",
          background: "rgba(0,0,0,0.2)",
        }}>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 12 }}>CHANNEL SUMMARY</div>
          {channels.map((ch, i) => {
            const data = Array.from(buffers.current[ch.id] || []);
            const rmsVal = data.length ? rms(data).toFixed(0) : "–";
            const pkVal = data.length ? peak(data).toFixed(0) : "–";
            return (
              <div key={ch.id} style={{
                borderLeft: `2px solid ${ch.color}`,
                paddingLeft: 10, marginBottom: 14,
              }}>
                <div style={{ fontSize: 9, color: "#888", marginBottom: 3 }}>CH{i + 1} · {ch.muscle.split(" ")[0]}</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 8, color: "#444" }}>RMS</div>
                    <div style={{ fontSize: 14, color: ch.color, fontWeight: 600 }}>{rmsVal}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: "#444" }}>PEAK</div>
                    <div style={{ fontSize: 14, color: ch.color, fontWeight: 600 }}>{pkVal}</div>
                  </div>
                </div>
                <div style={{ fontSize: 8, color: "#444", marginTop: 3 }}>
                  {ch.lff}–{ch.hff} Hz
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 10 }}>QUICK ACTIONS</div>
            {[
              ["ALL ON",  () => channels.forEach(ch => updateChannel(ch.id, { active: true }))],
              ["ALL OFF", () => channels.forEach(ch => updateChannel(ch.id, { active: false }))],
              ["RESET",   () => { Object.keys(buffers.current).forEach(k => { buffers.current[k] = new Float32Array(BUFFER_SIZE); }); }],
            ].map(([label, fn]) => (
              <button key={label} onClick={fn} style={{
                width: "100%", marginBottom: 6,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, color: "#888",
                fontSize: 10, padding: "6px", cursor: "pointer", letterSpacing: 1,
              }}>{label}</button>
            ))}
          </div>

          {/* Arduino wiring hint */}
          <div style={{
            marginTop: 20,
            background: "rgba(0,229,255,0.04)",
            border: "1px solid rgba(0,229,255,0.1)",
            borderRadius: 8, padding: 10,
          }}>
            <div style={{ fontSize: 9, color: "#00e5ff88", letterSpacing: 1, marginBottom: 6 }}>ARDUINO FORMAT</div>
            <div style={{ fontSize: 9, color: "#555", lineHeight: 1.7 }}>
              Serial.print(A0);<br />
              Serial.print(",");<br />
              Serial.println(A1);<br />
              Baud: 115200
            </div>
          </div>
        </div>
      </div>

      {/* pulse animation */}
      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; } 50% { opacity:0.4; }
        }
      `}</style>
    </div>
  );
}

// ── Mode bar ──────────────────────────────────────────────────────────────────
function ModeBar({ channels, onPreset }) {
  const [active, setActive] = useState("EMG");
  const modes = Object.keys(FILTER_PRESETS);

  const handleMode = (m) => {
    setActive(m);
    onPreset(FILTER_PRESETS[m].lff, FILTER_PRESETS[m].hff);
  };

  return (
    <div style={{
      display: "flex", gap: 4, padding: "6px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      background: "rgba(0,0,0,0.3)",
    }}>
      {modes.map(m => (
        <button key={m} onClick={() => handleMode(m)} style={{
          background: active === m ? "rgba(0,229,255,0.12)" : "transparent",
          border: `1px solid ${active === m ? "rgba(0,229,255,0.5)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 5,
          color: active === m ? "#00e5ff" : "#555",
          fontSize: 10, padding: "5px 16px", cursor: "pointer",
          fontFamily: "'DM Mono', monospace", letterSpacing: 1,
        }}>
          {m}
        </button>
      ))}
      <div style={{ marginLeft: 12, fontSize: 9, color: "#333", alignSelf: "center", letterSpacing: 1 }}>
        ACTIVE FILTER: {FILTER_PRESETS[active].lff} – {FILTER_PRESETS[active].hff} Hz
      </div>
    </div>
  );
}
