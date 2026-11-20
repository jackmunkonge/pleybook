"use client";

import { useEffect, useRef } from "react";

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Rows of dim "contract text" on a dark panel; a green beam sweeps down on a loop,
// lighting rows as it passes. A few rows stay flagged in red.
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
out vec4 outColor;

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;

  vec3 ink = vec3(0.106, 0.102, 0.090);
  vec3 green = vec3(0.627, 0.812, 0.431);
  vec3 red = vec3(0.898, 0.282, 0.302);
  vec3 col = ink;

  // faint dot grid
  vec2 g = mod(p, 24.0) - 12.0;
  col += smoothstep(1.5, 0.5, length(g)) * 0.035;

  // beam position (loops every 120s of slow time)
  float period = 120.0;
  float beamY = mod(uTime, period) / period * (uRes.y + 200.0) - 100.0;

  // text rows
  float pitch = 30.0;
  float top = 70.0;
  float row = floor((p.y - top) / pitch);
  float ry = p.y - top - (row + 0.5) * pitch;
  float inRows = step(0.0, row) * step(row, floor((uRes.y - 140.0) / pitch));

  float heading = step(0.86, hash(row * 7.7));
  float flagged = step(0.8, hash(row * 5.3)) * (1.0 - heading);
  float lenFrac = mix(mix(0.38, 1.0, hash(row * 3.1)), 0.42, heading);

  float x = p.x - 56.0;
  float lineLen = (uRes.x - 112.0) * lenFrac;
  float cell = 18.0;
  float ci = floor(x / cell);
  float on = step(0.16, hash(ci * 1.7 + row * 13.0));
  float cx = mod(x, cell);
  float cellShape = smoothstep(0.0, 1.5, cx) * smoothstep(cell - 3.0, cell - 4.5, cx);
  float thick = mix(3.0, 5.5, heading);
  float bar = smoothstep(thick, thick - 1.2, abs(ry))
    * step(0.0, x) * step(x, lineLen) * on * cellShape * inRows;

  // how far behind the beam this pixel is
  float d = beamY - p.y;
  float passed = step(0.0, d);
  float litFast = passed * exp(-max(d, 0.0) / 150.0);
  float litSlow = passed * exp(-max(d, 0.0) / 340.0);
  float lit = mix(litFast, litSlow, flagged);

  vec3 barCol = mix(vec3(0.2), mix(green, red, flagged), lit);
  barCol += green * exp(-abs(d) / 14.0) * 0.5;
  col = mix(col, barCol, bar);

  // the beam itself + soft wash behind it
  col += green * (exp(-abs(d) / 1.6) * 0.95 + exp(-abs(d) / 46.0) * 0.22);
  col += green * 0.05 * passed * exp(-max(d, 0.0) / 220.0);

  // vignette
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.9;

  outColor = vec4(col, 1.0);
}`;

/** Animated "contract scan" background. Fills its parent; plain WebGL2, no dependencies. */
export function ContractScan({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) return; // falls back to the CSS background behind the canvas

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("ContractScan shader:", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("ContractScan shader failed:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SPEED = 30; // shader time units per second; the period is 120, so one sweep takes ~12s
    const START = 20; // start with the beam partway down so the first frame isn't blank
    let raf = 0;
    let visible = true;
    const t0 = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    };

    const draw = (now: number) => {
      resize();
      // Shader works in CSS-pixel units so the row layout is dpr-independent.
      gl.uniform2f(uRes, canvas.clientWidth, canvas.clientHeight);
      gl.uniform1f(uTime, START + (reduced ? 0 : ((now - t0) / 1000) * SPEED));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const loop = (now: number) => {
      if (visible && !document.hidden) draw(now);
      raf = requestAnimationFrame(loop);
    };

    draw(t0);
    if (!reduced) raf = requestAnimationFrame(loop);

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const ro = new ResizeObserver(() => draw(performance.now()));
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className ?? "block size-full"} />;
}
