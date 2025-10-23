import React, { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    beehive?: {
      openFolder: () => Promise<{
        dir: string;
        files: { name: string; path: string }[];
      } | null>;
      exists: (absPath: string) => Promise<boolean>;
      executeRename: (
        items: { from: string; to: string }[]
      ) => Promise<{ ok: boolean; count?: number; error?: string }>;
      revertRename: () => Promise<{
        ok: boolean;
        count?: number;
        error?: string;
      }>;
    };
  }
}

type Row = {
  id: string;
  dir: string;
  path: string;
  from: string;
  to: string;
  status?: "OK" | "WARN" | "ERR" | "DONE";
  warnMsg?: string;
};
type ColWidths = { path: number; from: number; to: number }; // px
type SerialCfg = {
  pos: "prefix" | "suffix" | "none";
  sep: string;
  start: number;
  width: number;
};

// ===== diff util =====
function lcsDiff(a: string, b: string) {
  if (a === b) return [{ t: "eq", s: a }];
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: "eq" | "ins" | "del"; s: string }[] = [];
  const push = (t: any, s: string) => {
    if (!s) return;
    const p = out[out.length - 1];
    if (p && p.t === t) p.s += s;
    else out.push({ t, s });
  };
  let i = 0,
    j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push("eq", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i]);
      i++;
    } else {
      push("ins", b[j]);
      j++;
    }
  }
  if (i < m) push("del", a.slice(i));
  if (j < n) push("ins", b.slice(j));
  return out;
}
function NameDiff({ from, to }: { from: string; to: string }) {
  const parts = useMemo(() => lcsDiff(from, to), [from, to]);
  return (
    <span className="diff">
      {parts.map((p, i) =>
        p.t === "eq" ? (
          <span key={i}>{p.s}</span>
        ) : p.t === "ins" ? (
          <ins key={i}>{p.s}</ins>
        ) : (
          <del key={i}>{p.s}</del>
        )
      )}
    </span>
  );
}

// ===== DryRun rules =====
const windowsReserved = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);
function invalidForOS(name: string, platform: string): string | null {
  if (!name) return "empty";
  if (/^[\. ]+$/.test(name)) return "dots/spaces-only";
  if (platform === "win32") {
    if (/[<>:"/\\|?*\x00-\x1F]/.test(name)) return "invalid char (Windows)";
    const base = name.split(".")[0].toUpperCase();
    if (windowsReserved.has(base)) return "reserved name (Windows)";
    if (/[. ]$/.test(name)) return "trailing dot/space (Windows)";
  } else {
    if (/[\/\x00]/.test(name)) return "invalid char";
  }
  return null;
}

export default function App() {
  const [platform] = useState<string>(
    navigator.platform.toLowerCase().includes("win")
      ? "win32"
      : navigator.platform.toLowerCase().includes("mac")
      ? "darwin"
      : "linux"
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [regex, setRegex] = useState<string>("");
  const [flags, setFlags] = useState<string>("");
  const [repl, setRepl] = useState<string>("");

  const [serial, setSerial] = useState<SerialCfg>({
    pos: "suffix",
    sep: "_",
    start: 1,
    width: 3,
  });
  const [widths, setWidths] = useState<ColWidths>({
    path: 360,
    from: 240,
    to: 240,
  });

  // ====== グローバル D&D 抑止（ファイルを“開かず”、リストに追加）======
  useEffect(() => {
    const prevent = (e: Event) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      const next: Row[] = [];
      const nextId = () =>
        `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      files.forEach((f: any) => {
        const p = (f as any).path as string;
        if (!p) return;
        const idx = p.lastIndexOf("/");
        const dir = idx >= 0 ? p.slice(0, idx) : "";
        const name = idx >= 0 ? p.slice(idx + 1) : p;
        next.push({
          id: nextId(),
          dir,
          path: p,
          from: name,
          to: name,
          status: "OK",
        });
      });
      if (next.length) setRows((prev) => [...prev, ...next]);
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // ====== 状態の永続化 ======
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("beehive.state") || "null");
      if (saved) {
        setRows(saved.rows ?? []);
        setRegex(saved.regex ?? "");
        setFlags(saved.flags ?? "");
        setRepl(saved.repl ?? "");
        setSerial(
          saved.serial ?? { pos: "suffix", sep: "_", start: 1, width: 3 }
        );
        setWidths(saved.widths ?? { path: 360, from: 240, to: 240 });
      }
    } catch {}
  }, []);
  useEffect(() => {
    const data = { rows, regex, flags, repl, serial, widths };
    localStorage.setItem("beehive.state", JSON.stringify(data));
  }, [rows, regex, flags, repl, serial, widths]);

  // 列リサイズ（Path/From のみ）
  const startResize = (col: keyof ColWidths, ev: React.MouseEvent) => {
    if (col === "to") return; // To は固定（ハンドル撤去）
    ev.preventDefault();
    const startX = ev.clientX;
    const startW = widths[col];
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      setWidths((w) => ({ ...w, [col]: Math.max(120, startW + delta) }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // RegExp -> Serial（Apply）
  const parseRegex = (input: string, flags: string) => {
    const m = input.match(/^\/(.+)\/([a-z]*)$/i);
    if (m) return new RegExp(m[1], m[2]);
    return new RegExp(input || ".*", flags);
  };
  const applyAll = () => {
    let re: RegExp;
    try {
      re = parseRegex(regex, flags);
    } catch {
      alert("Invalid RegExp");
      return;
    }
    let counter = serial.start;
    setRows((prev) =>
      prev.map((r) => {
        let to = r.from.replace(re, repl);
        if (serial.pos !== "none") {
          const extIdx = to.lastIndexOf(".");
          const base = extIdx > 0 ? to.slice(0, extIdx) : to;
          const ext = extIdx > 0 ? to.slice(extIdx) : "";
          const serialStr = String(counter++).padStart(serial.width, "0");
          to =
            serial.pos === "prefix"
              ? `${serialStr}${serial.sep}${to}`
              : `${base}${serial.sep}${serialStr}${ext}`;
        }
        return { ...r, to };
      })
    );
  };

  // 行操作
  const nextId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const addFromDir = async () => {
    if (!window.beehive) {
      alert("preload API not available");
      return;
    }
    const res = await window.beehive.openFolder();
    if (!res) return;
    const next = res.files.map((f) => ({
      id: nextId(),
      dir: res.dir,
      path: f.path,
      from: f.name,
      to: f.name,
      status: "OK",
    }));
    setRows((prev) => [...prev, ...next]);
  };
  const removeRow = (id: string) =>
    setRows((prev) => prev.filter((r) => r.id !== id));
  // 並べ替え（テーブル内D&D）
  const dragId = useRef<string | null>(null);
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOverRow = (overId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragId.current;
    if (!from || from === overId) return;
    setRows((prev) => {
      const a = prev.findIndex((r) => r.id === from)!;
      const b = prev.findIndex((r) => r.id === overId)!;
      if (a < 0 || b < 0) return prev;
      const copy = prev.slice();
      const [it] = copy.splice(a, 1);
      copy.splice(b, 0, it);
      return copy;
    });
  };
  const onDragEnd = () => {
    dragId.current = null;
  };

  // To 編集
  const updateTo = (id: string, to: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, to } : r)));

  // Dry Run
  const updateStatus = (id: string, status: Row["status"], msg?: string) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status, warnMsg: msg } : r))
    );
  const dryRun = async () => {
    const toMap = new Map<string, string>();
    for (const r of rows) {
      const abs = `${r.dir}/${r.to}`;
      if (toMap.has(abs)) {
        updateStatus(r.id, "ERR", "duplicate target");
        return;
      }
      toMap.set(abs, r.id);
    }
    for (const r of rows) {
      const err = invalidForOS(r.to, platform);
      if (err) {
        updateStatus(r.id, "ERR", err);
        return;
      }
      if (await window.beehive?.exists(`${r.dir}/${r.to}`)) {
        updateStatus(r.id, "ERR", "exists on disk");
        return;
      }
      updateStatus(r.id, "OK");
    }
    alert("Dry Run OK");
  };

  // Execute / Revert
  const execute = async () => {
    const items = rows.map((r) => ({ from: r.path, to: `${r.dir}/${r.to}` }));
    const res = await window.beehive?.executeRename(items);
    if (!res?.ok) {
      alert("Execute failed: " + (res?.error || ""));
      return;
    }
    setRows((prev) =>
      prev.map((r) => ({ ...r, status: "DONE", path: `${r.dir}/${r.to}` }))
    );
  };
  const revert = async () => {
    const res = await window.beehive?.revertRename();
    if (!res?.ok) {
      alert("Revert failed: " + (res?.error || ""));
      return;
    }
    setRows((prev) => prev.map((r) => ({ ...r, status: "OK" })));
  };
  const editUndo = () => {
    history.back();
  }; // 簡易版（必要なら専用スタックへ）

  const colStyle = {
    path: { width: widths.path },
    from: { width: widths.from },
    to: { width: widths.to },
  } as const;

  // 既存の colStyle の後に最少幅を用意
  const MIN_TO = 260; // お好みで 240〜300 に調整可

  return (
    <div className="app">
      <div className="header">
        <div className="logo" style={{ justifyContent: "var(--logo-align)" }}>
          🐝 BeeHiVE
        </div>
        <div className="controls">
          <button
            className="btn"
            data-action="open-folder"
            onClick={addFromDir}
          >
            Open Folder
          </button>

          <input
            className="input"
            placeholder="RegExp: /pattern/flags or pattern"
            value={regex}
            onChange={(e) => setRegex(e.target.value)}
            style={{ width: 220 }}
          />
          <input
            className="input"
            placeholder="flags"
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            style={{ width: 80 }}
          />
          <input
            className="input"
            placeholder="replacement"
            value={repl}
            onChange={(e) => setRepl(e.target.value)}
            style={{ width: 180 }}
          />

          <select
            className="input"
            value={serial.pos}
            onChange={(e) =>
              setSerial((s) => ({ ...s, pos: e.target.value as any }))
            }
          >
            <option value="none">serial: none</option>
            <option value="prefix">serial: prefix</option>
            <option value="suffix">serial: suffix</option>
          </select>
          <input
            className="input"
            style={{ width: 60 }}
            type="number"
            value={serial.start}
            onChange={(e) =>
              setSerial((s) => ({
                ...s,
                start: parseInt(e.target.value || "1"),
              }))
            }
            title="start"
          />
          <input
            className="input"
            style={{ width: 60 }}
            type="number"
            value={serial.width}
            onChange={(e) =>
              setSerial((s) => ({
                ...s,
                width: parseInt(e.target.value || "3"),
              }))
            }
            title="width"
          />
          <input
            className="input"
            style={{ width: 60 }}
            value={serial.sep}
            onChange={(e) => setSerial((s) => ({ ...s, sep: e.target.value }))}
            title="separator"
          />

          <button className="btn" data-action="apply" onClick={applyAll}>
            Apply
          </button>
          <button className="btn" data-action="dry-run" onClick={dryRun}>
            Dry Run
          </button>
          <button className="btn" data-action="execute" onClick={execute}>
            Execute
          </button>
          <button className="btn" data-action="revert" onClick={revert}>
            Revert
          </button>
          <button className="btn" data-action="edit-undo" onClick={editUndo}>
            Edit-Undo
          </button>
        </div>
        <div className="statusbar">
          <span className="badge">Rows: {rows.length}</span>
        </div>
      </div>

      <div className="list">
        <table className="table">
          <colgroup>
            <col style={{ width: 48 }} />
            <col style={{ ...colStyle.path }} />
            <col style={{ ...colStyle.from }} />
            <col style={{ width: Math.max(widths.to, MIN_TO) }} />
            <col style={{ width: 84 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="small col-index" data-col="#">
                #
              </th>

              <th className="small" data-col="path">
                <span
                  className="drag-handle"
                  title="drag row by grip on each row"
                >
                  ☰
                </span>{" "}
                Path
                <span
                  className="col-resizer"
                  onMouseDown={(e) => startResize("path", e)}
                />
              </th>
              <th className="small" data-col="from">
                From
                <span
                  className="col-resizer"
                  onMouseDown={(e) => startResize("from", e)}
                />
              </th>
              <th data-col="to" className="col-to">
                To
              </th>
              <th data-col="status" className="col-status">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.id}
                draggable
                onDragStart={onDragStart(r.id)}
                onDragOver={onDragOverRow(r.id)}
                onDragEnd={onDragEnd}
              >
                <td className="small col-index">{idx + 1}</td>
                <td className="small copyable">
                  <div className="cell cell-clip" title={r.path}>
                    {r.path}
                  </div>
                </td>
                <td className="small copyable">
                  <div className="cell cell-clip" title={r.from}>
                    {r.from}
                  </div>
                </td>
                <td className="col-to">
                  <div className="cell cell-clip">
                    <input
                      className="input cell-input"
                      value={r.to}
                      onChange={(e) => updateTo(r.id, e.target.value)}
                      title={r.to}
                    />
                  </div>
                  <div className="cell cell-clip">
                    <small>
                      <NameDiff from={r.from} to={r.to} />
                    </small>
                  </div>
                </td>
                <td className="col-status" title={r.warnMsg || ""}>
                  {r.status === "ERR" ? (
                    <span className="badge err">ERR</span>
                  ) : r.status === "WARN" ? (
                    <span className="badge warn">WARN</span>
                  ) : r.status === "DONE" ? (
                    <span className="badge ok">done</span>
                  ) : (
                    <span className="badge">OK</span>
                  )}
                  <button
                    className="btn"
                    data-action="remove-row"
                    onClick={() => removeRow(r.id)}
                    style={{ marginLeft: 8 }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
