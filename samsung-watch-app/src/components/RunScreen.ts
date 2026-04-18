// Run Screen Component — Main dashboard display during running
import {
  formatTime,
  formatPace,
  formatDistance,
  formatHeartRate,
  formatCadence,
  getPaceDeviationColor,
  getHeartRateZone,
  getZoneColor,
} from '@utils/formatting';
import { RunMetrics, CoachingData, RunState } from '@types/index';
import { ZoneArc } from './ZoneArc';

export class RunScreen {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private zoneArc: ZoneArc;

  // Display metrics
  private displayMetrics = {
    pace: 0,
    distance: 0,
    hr: 0,
    cadence: 0,
  };

  // Smoothing factor
  private smoothFactor = 0.15;

  // Animation state
  private pulseBoost = 0;
  private ringPhase = 0;

  // Run state
  private coachingData: CoachingData | null = null;
  private coachingCue = '';
  private coachingCueTicks = 0;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) || document.body;
    this.canvas = this.createCanvas();
    this.zoneArc = new ZoneArc(this.canvas, this.canvas.width / 2);
    this.setupDisplay();
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 360;
    canvas.style.position = 'absolute';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.container.appendChild(canvas);
    return canvas;
  }

  private setupDisplay(): void {
    // Create SVG overlay for text (more flexible than canvas text)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 360 360');
    svg.setAttribute('width', '360');
    svg.setAttribute('height', '360');
    svg.style.position = 'absolute';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.id = 'metrics-overlay';
    this.container.appendChild(svg);
  }

  update(metrics: RunMetrics, state: RunState, now: number): void {
    // Smooth metrics
    const e = this.smoothFactor;
    if (metrics.pace > 0 && metrics.pace < 1200) {
      this.displayMetrics.pace = this.displayMetrics.pace + (metrics.pace - this.displayMetrics.pace) * e;
    } else {
      this.displayMetrics.pace = this.displayMetrics.pace + (0 - this.displayMetrics.pace) * 0.08;
    }

    this.displayMetrics.distance = this.displayMetrics.distance + (metrics.distance - this.displayMetrics.distance) * e;
    this.displayMetrics.hr = Math.round(this.displayMetrics.hr + (metrics.heartRate - this.displayMetrics.hr) * 0.3);
    this.displayMetrics.cadence = Math.round(
      this.displayMetrics.cadence + (metrics.cadence - this.displayMetrics.cadence) * 0.3
    );

    // Animation
    this.ringPhase += 0.1;
    if (this.ringPhase > Math.PI * 2) {
      this.ringPhase -= Math.PI * 2;
    }
    this.pulseBoost *= 0.82;
    if (this.pulseBoost < 0.01) {
      this.pulseBoost = 0;
    }

    // Update coaching cue timer
    if (this.coachingCueTicks > 0) {
      this.coachingCueTicks--;
      if (this.coachingCueTicks <= 0) {
        this.coachingCue = '';
      }
    }

    // Render
    this.render(metrics, state);
  }

  private render(metrics: RunMetrics, state: RunState): void {
    const ctx = this.canvas.getContext('2d')!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Draw zone arc
    const hrZone = getHeartRateZone(this.displayMetrics.hr);
    this.zoneArc.draw(hrZone, state.isRunning, this.pulseBoost);

    // Draw text overlays via SVG
    this.renderText(cx, cy, h, metrics, state, hrZone);
  }

  private renderText(
    cx: number,
    cy: number,
    h: number,
    metrics: RunMetrics,
    state: RunState,
    hrZone: number
  ): void {
    const svg = document.getElementById('metrics-overlay') as SVGElement;
    if (!svg) return;

    // Clear previous content
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // ── Timer (top center) ──
    if (state.isRunning) {
      const timerY = h * 0.13;
      const timerText = formatTime(state.elapsedTime);

      const timerTspan = this.createText(cx, timerY, timerText, 'text-title text-cyan');
      svg.appendChild(timerTspan);
    }

    // ── MIN/KM Label (above pace) ──
    const lblY = h * 0.26;
    const labelText = this.createText(cx, lblY, 'MIN / KM', 'text-tiny text-white');
    svg.appendChild(labelText);

    // ── PACE (large center value) ──
    const paceY = h * 0.32;
    const paceStr = formatPace(this.displayMetrics.pace);
    const paceColor =
      this.coachingData && this.coachingData.targetPaceSec > 0 && this.displayMetrics.pace > 0
        ? getPaceDeviationColor(this.coachingData.targetPaceSec, this.displayMetrics.pace)
        : state.isRunning && this.displayMetrics.pace > 0
          ? '#ffffff'
          : '#404040';

    const paceText = this.createText(cx, paceY, paceStr, 'text-title', paceColor);
    svg.appendChild(paceText);

    // ── Target pace badge (if coached) ──
    if (this.coachingData && this.coachingData.targetPace) {
      const tY = h * 0.44;
      const targetStr = `TARGET ${this.coachingData.targetPace} /KM`;
      const targetBg = this.createRect(cx - 50, tY - 8, 100, 15, '#00263A');
      svg.appendChild(targetBg);

      const targetText = this.createText(cx, tY, targetStr, 'text-tiny text-cyan');
      svg.appendChild(targetText);
    }

    // ── Secondary metrics (distance left, HR right) ──
    const secY = h * 0.625;
    const secLblY = h * 0.555;

    // Distance (left)
    const distText = this.createText(cx * 0.54, secLblY, 'KM', 'text-tiny text-white');
    svg.appendChild(distText);

    const distValue = this.createText(cx * 0.54, secY, formatDistance(this.displayMetrics.distance), 'text-normal text-white');
    svg.appendChild(distValue);

    // HR (right)
    const hrText = this.createText(cx * 1.46, secLblY, 'BPM', 'text-tiny text-white');
    svg.appendChild(hrText);

    const hrColor = state.isRunning ? getZoneColor(hrZone as any) : '#383838';
    const hrValue = this.createText(
      cx * 1.46,
      secY,
      formatHeartRate(this.displayMetrics.hr),
      'text-normal',
      hrColor
    );
    svg.appendChild(hrValue);

    // ── Cadence (bottom) ──
    const cadY = h * 0.765;
    const cadText = this.createText(cx, cadY, formatCadence(this.displayMetrics.cadence), 'text-tiny text-white');
    svg.appendChild(cadText);

    // ── Status / coaching cue ──
    if (this.coachingCue) {
      const cueY = 20;
      const cueBg = this.createRect(0, 0, 360, 24, '#001A0D');
      svg.appendChild(cueBg);

      const cueText = this.createText(cx, cueY + 8, this.coachingCue, 'text-small text-green');
      svg.appendChild(cueText);
    }

    // ── Paused banner ──
    if (state.isPaused) {
      const pausedY = h * 0.03;
      const pausedText = this.createText(cx, pausedY, '— PAUSED —', 'text-small', '#ff9800');
      svg.appendChild(pausedText);
    }
  }

  private createText(x: number, y: number, text: string, className: string, fill?: string): SVGTextElement {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tspan.setAttribute('x', x.toString());
    tspan.setAttribute('y', y.toString());
    tspan.setAttribute('text-anchor', 'middle');
    tspan.setAttribute('dominant-baseline', 'middle');
    tspan.setAttribute('class', className);
    if (fill) {
      tspan.setAttribute('fill', fill);
    }
    tspan.textContent = text;
    return tspan;
  }

  private createRect(x: number, y: number, width: number, height: number, fill: string): SVGRectElement {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x.toString());
    rect.setAttribute('y', y.toString());
    rect.setAttribute('width', width.toString());
    rect.setAttribute('height', height.toString());
    rect.setAttribute('fill', fill);
    rect.setAttribute('rx', '4');
    return rect;
  }

  setCoachingData(data: CoachingData): void {
    this.coachingData = data;
  }

  setCoachingCue(cue: string): void {
    this.coachingCue = cue;
    this.coachingCueTicks = 20;
  }

  setPulseBoost(boost: number): void {
    this.pulseBoost = boost;
  }
}
