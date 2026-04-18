// Zone Arc Component — Heart rate zone arc visualization
import { getZoneColor } from '@utils/formatting';
import { HeartRateZone } from '@types/index';

export class ZoneArc {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cx: number;
  private cy: number;
  private radius: number;
  private outerR: number;
  private innerR: number;

  constructor(canvas: HTMLCanvasElement, radius: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.cx = canvas.width / 2;
    this.cy = canvas.height / 2;
    this.radius = radius;
    this.outerR = radius - 6;
    this.innerR = this.outerR - 11;
  }

  draw(activeZone: HeartRateZone, isRunning: boolean, pulseBoost: number): void {
    // Clear zone arc area
    const w = Math.sqrt(2) * this.outerR;
    this.ctx.clearRect(this.cx - w, this.cy - w, w * 2, w * 2);

    // Segment angles (CCW from lower-right to lower-left)
    const segments = [
      { zone: 5, start: 336, end: 20, color: '#F44336' }, // Red
      { zone: 4, start: 22, end: 66, color: '#FF6D00' }, // Orange
      { zone: 3, start: 68, end: 112, color: '#FFD740' }, // Amber
      { zone: 2, start: 114, end: 158, color: '#00E676' }, // Green
      { zone: 1, start: 160, end: 204, color: '#2979FF' }, // Blue
    ];

    // Background ring
    this.ctx.strokeStyle = '#141414';
    this.ctx.lineWidth = 11;
    this.drawArcPath(330, 210);
    this.ctx.stroke();

    // Draw zone segments
    segments.forEach(({ zone, start, end, color }) => {
      const isActive = isRunning && activeZone === zone;

      if (isActive) {
        // Active zone: full brightness + glow
        const glow = 1 + pulseBoost * 2;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 11 + glow;
        this.ctx.lineCap = 'round';
        this.drawArcPath(start, end);
        this.ctx.stroke();

        // Outer glow
        this.ctx.strokeStyle = this.hexToRgba(color, 0.3);
        this.ctx.lineWidth = 15 + glow;
        this.drawArcPath(start, end);
        this.ctx.stroke();
      } else if (isRunning) {
        // Inactive zone: dimmed
        this.ctx.strokeStyle = this.getDimColor(color);
        this.ctx.lineWidth = 11;
        this.drawArcPath(start, end);
        this.ctx.stroke();
      } else {
        // Pre-run: all dimmed
        this.ctx.strokeStyle = this.getDimColor(color);
        this.ctx.lineWidth = 11;
        this.drawArcPath(start, end);
        this.ctx.stroke();
      }
    });

    // Inner separator ring
    this.ctx.strokeStyle = '#002233';
    this.ctx.lineWidth = 2;
    this.drawArcPath(330, 210);
    this.ctx.stroke();
  }

  private drawArcPath(startAngle: number, endAngle: number): void {
    const startRad = this.degToRad(startAngle);
    const endRad = this.degToRad(endAngle);

    this.ctx.beginPath();
    this.ctx.arc(this.cx, this.cy, this.outerR, startRad, endRad, true); // CCW
    this.ctx.arc(this.cx, this.cy, this.innerR, endRad, startRad, false); // back CW
    this.ctx.closePath();
  }

  private degToRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private getDimColor(color: string): string {
    // Return darker version of the color
    const dimColors: Record<string, string> = {
      '#F44336': '#1A0404', // Red
      '#FF6D00': '#1A0800', // Orange
      '#FFD740': '#201800', // Amber
      '#00E676': '#00200E', // Green
      '#2979FF': '#0A1628', // Blue
    };
    return dimColors[color] || color;
  }
}
